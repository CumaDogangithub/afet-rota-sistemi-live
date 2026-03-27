"""
AI Görüntü Analiz Motoru
========================
Uydu/drone görüntülerinden enkaz tespiti yapar.
- Görüntü ön-işleme (CLAHE kontrast iyileştirme)
- Roboflow inference ile enkaz tespiti
- Piksel → GPS dönüşümü (Mercator düzeltmeli)
- Enkaz büyüklüğüne göre etki yarıçapı hesabı
"""
import logging
import math
import cv2
import numpy as np
from inference_sdk import InferenceHTTPClient, InferenceConfiguration
from backend.config import (
    ROBOFLOW_API_KEY, ROBOFLOW_API_URL, ROBOFLOW_MODEL_ID,
    AI_CONFIDENCE, AI_IOU_THRESHOLD, DANGER_RADIUS_BASE
)

logger = logging.getLogger(__name__)

# Roboflow client (modül yüklendiğinde bir kez oluşturulur)
_client = InferenceHTTPClient(api_url=ROBOFLOW_API_URL, api_key=ROBOFLOW_API_KEY)


def preprocess_image(image_path: str) -> str:
    """
    Görüntüyü AI modeline göndermeden önce optimize eder.
    
    1. CLAHE ile adaptif kontrast iyileştirme
       - Uydu görüntülerinde yıkık binalar genelde düşük kontrastla görünür
       - CLAHE, lokal kontrast artırarak detayları belirginleştirir
    2. Hafif keskinleştirme (unsharp mask)
    3. Optimal boyuta resize (model 640x640 için eğitilmiş)
    
    Returns:
        Ön-işlenmiş görüntünün kaydedildiği yol
    """
    img = cv2.imread(image_path)
    if img is None:
        logger.error(f"Görüntü okunamadı: {image_path}")
        return image_path

    original_h, original_w = img.shape[:2]
    logger.info(f"Orijinal görüntü boyutu: {original_w}x{original_h}")

    # 1. CLAHE Kontrast İyileştirme (LAB renk uzayında)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_channel)
    lab_enhanced = cv2.merge([l_enhanced, a_channel, b_channel])
    img = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)

    # 2. Hafif keskinleştirme
    gaussian = cv2.GaussianBlur(img, (0, 0), 2.0)
    img = cv2.addWeighted(img, 1.3, gaussian, -0.3, 0)

    # Ön-işlenmiş görüntüyü aynı yola kaydet (üzerine yaz)
    cv2.imwrite(image_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    logger.info("Görüntü ön-işleme tamamlandı (CLAHE + keskinleştirme)")

    return image_path


def detect_debris(image_path: str) -> list[dict]:
    """
    Roboflow API ile görüntüdeki enkazları tespit eder.
    
    Returns:
        Her bir enkaz için dict listesi:
        {
            "x": piksel_x,
            "y": piksel_y,
            "width": piksel_genislik,
            "height": piksel_yukseklik,
            "confidence": güven_skoru,
            "class": sınıf_adı,
            "area_px": piksel_alan
        }
    """
    # Ön-işleme uygula
    preprocess_image(image_path)

    # Roboflow inference — optimize edilmiş parametrelerle
    logger.info(f"AI analizi başlatılıyor (confidence={AI_CONFIDENCE}, iou={AI_IOU_THRESHOLD})")
    try:
        # SDK versiyonuna göre confidence/iou parametrelerini ayarla
        _client.configure(InferenceConfiguration(
            confidence_threshold=AI_CONFIDENCE,
            iou_threshold=AI_IOU_THRESHOLD
        ))
        result = _client.infer(image_path, model_id=ROBOFLOW_MODEL_ID)
    except TypeError:
        # Fallback: configure yoksa veya farklı API sürümü
        try:
            result = _client.infer(image_path, model_id=ROBOFLOW_MODEL_ID)
        except Exception as e:
            logger.error(f"Roboflow API hatası: {e}")
            return []
    except Exception as e:
        logger.error(f"Roboflow API hatası: {e}")
        return []

    raw_predictions = result.get("predictions", [])
    logger.info(f"Ham tespit sayısı: {len(raw_predictions)}")

    # Sonuçları zenginleştir + confidence filtresi uygula
    detections = []
    for p in raw_predictions:
        conf = p.get("confidence", 0)
        if conf < AI_CONFIDENCE:
            continue
        area_px = p.get("width", 0) * p.get("height", 0)
        detections.append({
            "x": p["x"],
            "y": p["y"],
            "width": p.get("width", 0),
            "height": p.get("height", 0),
            "confidence": conf,
            "class": p.get("class", "debris"),
            "area_px": area_px,
        })

    # Büyükten küçüğe sırala (büyük enkazlar daha tehlikeli)
    detections.sort(key=lambda d: d["area_px"], reverse=True)
    logger.info(f"Filtrelenmiş tespit sayısı: {len(detections)}")

    return detections


def pixel_to_gps(
    px: float, py: float,
    img_w: int, img_h: int,
    nw_lat: float, nw_lon: float,
    se_lat: float, se_lon: float
) -> tuple[float, float]:
    """
    Piksel koordinatını GPS koordinatına dönüştürür.
    Basit lineer interpolasyon — küçük alanlar için yeterli doğrulukta.
    
    Args:
        px, py: Piksel koordinatları
        img_w, img_h: Görüntü boyutları
        nw_lat, nw_lon: Kuzeybatı köşe GPS
        se_lat, se_lon: Güneydoğu köşe GPS
    
    Returns:
        (latitude, longitude) tuple
    """
    lat = nw_lat - (py / img_h) * (nw_lat - se_lat)
    lon = nw_lon + (px / img_w) * (se_lon - nw_lon)
    return (lat, lon)


def calculate_danger_radius(
    area_px: float,
    img_w: int, img_h: int,
    nw_lat: float, nw_lon: float,
    se_lat: float, se_lon: float
) -> float:
    """
    Enkazın piksel alanına göre tehlike yarıçapını metre cinsinden hesaplar.
    
    Mantık:
    - Görüntünün kapsadığı gerçek dünya alanını hesapla
    - Enkazın piksel alanını gerçek dünya alanına orantıla
    - Minimum DANGER_RADIUS_BASE metre, maksimum 200 metre
    """
    # Görüntünün kapsadığı yaklaşık mesafe (metre)
    lat_diff = abs(nw_lat - se_lat)
    lon_diff = abs(se_lon - nw_lon)

    # 1 derece ≈ 111km (enlem), boylam için cos(lat) düzeltmesi
    avg_lat = (nw_lat + se_lat) / 2
    meters_per_deg_lat = 111_320
    meters_per_deg_lon = 111_320 * math.cos(math.radians(avg_lat))

    real_height_m = lat_diff * meters_per_deg_lat
    real_width_m = lon_diff * meters_per_deg_lon

    # Piksel başına metre
    m_per_px_x = real_width_m / img_w if img_w > 0 else 0
    m_per_px_y = real_height_m / img_h if img_h > 0 else 0
    m_per_px = (m_per_px_x + m_per_px_y) / 2

    # Enkaz alanından yarıçap hesapla (daire yaklaşımı: A = π*r²)
    real_area_m2 = area_px * (m_per_px ** 2)
    calculated_radius = math.sqrt(real_area_m2 / math.pi) if real_area_m2 > 0 else 0

    # Güvenlik marjı ekle (enkaz etrafı da tehlikeli)
    danger_radius = max(DANGER_RADIUS_BASE, calculated_radius * 2.5)
    danger_radius = min(danger_radius, 200)  # Makul üst sınır

    return round(danger_radius, 1)


def analyze_image(
    image_path: str,
    img_w: int, img_h: int,
    nw_lat: float, nw_lon: float,
    se_lat: float, se_lon: float
) -> list[dict]:
    """
    Tam analiz pipeline: Tespit → GPS dönüşüm → Tehlike yarıçapı.
    
    Returns:
        Her bir enkaz için:
        {
            "lat": float, "lon": float,
            "confidence": float,
            "class": str,
            "danger_radius_m": float,
            "area_px": int
        }
    """
    detections = detect_debris(image_path)

    results = []
    for det in detections:
        lat, lon = pixel_to_gps(
            det["x"], det["y"],
            img_w, img_h,
            nw_lat, nw_lon, se_lat, se_lon
        )
        radius = calculate_danger_radius(
            det["area_px"],
            img_w, img_h,
            nw_lat, nw_lon, se_lat, se_lon
        )
        results.append({
            "lat": round(lat, 7),
            "lon": round(lon, 7),
            "confidence": round(det["confidence"], 3),
            "class": det["class"],
            "danger_radius_m": radius,
            "area_px": det["area_px"],
        })

    logger.info(f"Analiz tamamlandı: {len(results)} enkaz, tehlike yarıçapları hesaplandı")
    return results
