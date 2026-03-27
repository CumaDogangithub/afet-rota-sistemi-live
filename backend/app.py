"""
Afet Rota Sistemi — Ana Sunucu
================================
FastAPI web sunucusu. AI analiz motoru ve rota motorunu birleştirir.
"""
import logging
import os
import tempfile
from contextlib import asynccontextmanager

import cv2
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.config import HOST, PORT, DEFAULT_CITY
from backend.ai_engine import analyze_image
from backend.routing_engine import load_city_graph, calculate_route

# Loglama ayarları
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-20s | %(levelname)-7s | %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Sunucu başlangıcında haritayı yükle."""
    load_city_graph(DEFAULT_CITY)
    yield


app = FastAPI(
    title="Afet Rota Sistemi API",
    description="Uydu görüntüsünden enkaz tespiti ve güvenli rota hesaplama",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — frontend bağlantısı için
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Frontend statik dosyaları sun
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="frontend")


@app.post("/api/otonom-analiz")
async def otonom_analiz(
    nw_lat: float = Form(...), nw_lon: float = Form(...),
    se_lat: float = Form(...), se_lon: float = Form(...),
    baslangic_lat: float = Form(...), baslangic_lon: float = Form(...),
    hedef_lat: float = Form(...), hedef_lon: float = Form(...),
    uydu_fotosu: UploadFile = File(...)
):
    """
    Otonom afet analiz endpoint'i.
    
    1. Uydu fotoğrafını al
    2. AI ile enkaz tespit et
    3. Güvenli rota hesapla
    4. Sonuçları döndür
    """
    logger.info("=" * 50)
    logger.info("📥 YENİ ANALİZ İSTEĞİ")
    logger.info(f"   Viewport: NW({nw_lat:.5f}, {nw_lon:.5f}) → SE({se_lat:.5f}, {se_lon:.5f})")
    logger.info(f"   Başlangıç: ({baslangic_lat:.5f}, {baslangic_lon:.5f})")
    logger.info(f"   Hedef:     ({hedef_lat:.5f}, {hedef_lon:.5f})")

    # Güvenli geçici dosya oluştur (eş zamanlı isteklerde çakışma olmaz)
    tmp_file = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp_path = tmp_file.name

    try:
        # Görüntüyü kaydet
        content = await uydu_fotosu.read()
        tmp_file.write(content)
        tmp_file.close()

        # Görüntü boyutlarını al
        img = cv2.imread(tmp_path)
        if img is None:
            raise HTTPException(status_code=400, detail="Görüntü okunamadı.")
        img_h, img_w = img.shape[:2]
        logger.info(f"📸 Görüntü boyutu: {img_w}x{img_h}")

        # 1. AI ANALIZ
        logger.info("🧠 AI analiz başlatılıyor...")
        debris_list = analyze_image(
            tmp_path, img_w, img_h,
            nw_lat, nw_lon, se_lat, se_lon
        )
        logger.info(f"🚨 {len(debris_list)} enkaz tespit edildi")

        # 2. ROTA HESAPLA
        logger.info("🗺️ Güvenli rota hesaplanıyor...")
        route_result = calculate_route(
            nw_lat, nw_lon, se_lat, se_lon,
            baslangic_lat, baslangic_lon,
            hedef_lat, hedef_lon,
            debris_list
        )

        # 3. SONUÇ
        response = {
            "durum": "basarili",
            "tespit_sayisi": len(debris_list),
            "enkazlar": [
                {
                    "lat": d["lat"],
                    "lon": d["lon"],
                    "confidence": d["confidence"],
                    "sinif": d["class"],
                    "tehlike_yaricapi_m": d["danger_radius_m"],
                }
                for d in debris_list
            ],
            "guvenli_rota": route_result["primary_route"],
            "alternatif_rota": route_result.get("alternative_route"),
        }

        logger.info(f"✅ Analiz tamamlandı: {len(debris_list)} enkaz, rota hazır")
        return response

    except RuntimeError as e:
        logger.error(f"Runtime hatası: {e}")
        return {"durum": "hata", "mesaj": str(e)}
    except Exception as e:
        logger.error(f"Beklenmeyen hata: {e}", exc_info=True)
        return {"durum": "hata", "mesaj": "Beklenmeyen bir hata oluştu. Loglara bakın."}
    finally:
        # Geçici dosyayı temizle
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.get("/api/health")
def health_check():
    """Sunucu sağlık kontrolü."""
    from backend.routing_engine import G_REGION
    return {
        "status": "ok",
        "city": DEFAULT_CITY,
        "graph_loaded": G_REGION is not None,
        "nodes": G_REGION.number_of_nodes() if G_REGION else 0,
        "edges": G_REGION.number_of_edges() if G_REGION else 0,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
