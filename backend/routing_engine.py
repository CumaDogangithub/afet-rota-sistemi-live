"""
Rota Hesaplama Motoru
=====================
Enkaz lokasyonlarını harita ağına entegre edip güvenli rota hesaplar.

Eski yaklaşım:  Tek node sil → shortest_path
Yeni yaklaşım:  Yarıçaplı edge ağırlıklandırma → weighted shortest_path + alternatif rota
"""
import logging
import math
import os
import osmnx as ox
import networkx as nx
from backend.config import DANGER_WEIGHT_MULTIPLIER

logger = logging.getLogger(__name__)

# osmnx cache ayarları
ox.settings.use_cache = True
ox.settings.log_console = False

# Global harita grafiği (sunucu açılışında bir kez yüklenir)
G_REGION = None


def load_city_graph(city_name: str) -> None:
    """Şehir yol ağını RAM'e yükler. Sunucu başlangıcında 1 kez çağrılır."""
    global G_REGION
    
    # Yerel bir .graphml dosyası var mı kontrol et (Daha hızlı yükleme için)
    cache_file = "antakya_graph.graphml"
    
    if os.path.exists(cache_file):
        logger.info(f"📂 Yerel harita dosyası bulundu: {cache_file}. Yükleniyor...")
        try:
            G_REGION = ox.load_graphml(filepath=cache_file)
            logger.info(f"✅ Yerel harita hazır! ({G_REGION.number_of_nodes()} düğüm)")
            return
        except Exception as e:
            logger.warning(f"⚠️ Yerel dosya okunamadı, OSM'den denenecek: {e}")

    logger.info(f"🌍 {city_name} yol ağı OSM üzerinden indiriliyor/yükleniyor...")
    try:
        G_REGION = ox.graph_from_place(city_name, network_type="drive")
        # Sonraki sefer için kaydet
        ox.save_graphml(G_REGION, filepath=cache_file)
        logger.info(f"✅ {city_name} yol ağı hazır! ({G_REGION.number_of_nodes()} düğüm)")
    except Exception as e:
        logger.error(f"❌ Harita yüklenemedi: {e}")
        raise


def _haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """İki GPS noktası arasındaki mesafeyi metre cinsinden hesaplar (Haversine formülü)."""
    R = 6_371_000  # Dünya yarıçapı (metre)
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _apply_danger_weights(
    G: nx.MultiDiGraph,
    debris_list: list[dict]
) -> nx.MultiDiGraph:
    """
    Enkaz noktaları etrafındaki edge'lere tehlike ağırlığı uygular.
    
    PERFORMANS İYİLEŞTİRMESİ:
    Sadece enkazın yakınındaki (bounding box) edge'leri kontrol eder.
    O(Debris * Edges) karmaşıklığını büyük ölçüde azaltır.
    """
    # Sabit: 1 derece enlem/boylam yaklaşık kaç metre? (Antakya civarı)
    METERS_PER_DEG = 111320.0
    
    # Tüm edge'lere orijinal ağırlığı kaydet (yoksa length kullan)
    for u, v, k, data in G.edges(keys=True, data=True):
        if "danger_weight" not in data:
            data["danger_weight"] = float(data.get("length", 100))

    for debris in debris_list:
        d_lat = debris["lat"]
        d_lon = debris["lon"]
        radius = debris["danger_radius_m"]
        
        # Mekansal Filtre: Yarıçapı derece cinsine çevir (güvenlik payıyla %20 fazla)
        # Lat/Lon farkı bu değerden büyükse haversine'e girmeye lüzum yok.
        lat_margin = (radius * 1.2) / METERS_PER_DEG
        lon_margin = (radius * 1.2) / (METERS_PER_DEG * 0.8) # cos(36) ~ 0.8
        
        affected_edges = 0

        for u, v, k, data in G.edges(keys=True, data=True):
            # Edge'in orta noktasını bul
            u_data = G.nodes[u]
            v_data = G.nodes[v]
            mid_lat = (u_data["y"] + v_data["y"]) / 2
            mid_lon = (u_data["x"] + v_data["x"]) / 2

            # HIZLI FİLTRE: Bounding Box dışındaysa atla
            if abs(mid_lat - d_lat) > lat_margin or abs(mid_lon - d_lon) > lon_margin:
                continue

            # Sadece yakınsa pahalı haversine hesabını yap
            distance = _haversine_distance(d_lat, d_lon, mid_lat, mid_lon)

            if distance < radius:
                # Mesafeye ters orantılı ağırlık çarpanı
                proximity_factor = 1.0 - (distance / radius)
                weight_multiplier = 1.0 + (DANGER_WEIGHT_MULTIPLIER * (proximity_factor ** 2))
                data["danger_weight"] *= weight_multiplier
                affected_edges += 1

        if affected_edges > 0:
            logger.info(
                f"Enkaz ({d_lat:.5f}, {d_lon:.5f}): "
                f"yarıçap={radius}m, etkilenen_kenar={affected_edges}"
            )

    return G


def calculate_route(
    nw_lat: float, nw_lon: float,
    se_lat: float, se_lon: float,
    start_lat: float, start_lon: float,
    end_lat: float, end_lon: float,
    debris_list: list[dict]
) -> dict:
    """
    Güvenli rota hesaplar.
    
    Args:
        nw_lat, nw_lon: Görüntü kuzeybatı köşesi
        se_lat, se_lon: Görüntü güneydoğu köşesi
        start_lat, start_lon: Başlangıç noktası
        end_lat, end_lon: Hedef noktası
        debris_list: AI'dan gelen enkaz listesi (lat, lon, danger_radius_m)
    
    Returns:
        {
            "primary_route": [[lat, lon], ...],
            "alternative_route": [[lat, lon], ...] veya None,
            "debris_markers": [{lat, lon, danger_radius_m}, ...]
        }
    """
    if G_REGION is None:
        raise RuntimeError("Harita yüklenmemiş! Önce load_city_graph() çağrılmalı.")

    # Tüm şehir grafiğini kullan (viewport truncate etmek yerine)
    # Küçük viewport'larda truncate çok az node döndürüyordu ve 
    # farklı GPS noktaları aynı node'a düşüyordu. Bu sorunu çözer.
    logger.info("Şehir grafiği üzerinden rota hesaplanıyor...")
    G_active = G_REGION.copy()

    logger.info(f"Aktif graf: {G_active.number_of_nodes()} düğüm, {G_active.number_of_edges()} kenar")

    # 2. Tehlike ağırlıkları uygula
    if debris_list:
        G_active = _apply_danger_weights(G_active, debris_list)

    # 3. Başlangıç ve hedef noktalarını bul
    try:
        start_node = ox.distance.nearest_nodes(G_active, X=start_lon, Y=start_lat)
        end_node = ox.distance.nearest_nodes(G_active, X=end_lon, Y=end_lat)
    except Exception as e:
        logger.error(f"Düğüm bulunamadı: {e}")
        raise RuntimeError("Başlangıç veya hedef noktası yol ağına yeterince yakın değil.")

    logger.info(f"Başlangıç node: {start_node}, Hedef node: {end_node}")

    if start_node == end_node:
        # Son çare: noktalar gerçekten çok yakın, ama yine de
        # farklı GPS olduğu için bir rota dönmeye çalış
        logger.warning("Başlangıç ve hedef aynı node — noktalar çok yakın olabilir")
        start_coord = [G_active.nodes[start_node]["y"], G_active.nodes[start_node]["x"]]
        return {
            "primary_route": [
                [start_lat, start_lon],
                start_coord,
                [end_lat, end_lon]
            ],
            "alternative_route": None,
        }

    # 4. Ana rota: Tehlike ağırlıklı en kısa yol
    primary_route = _find_path(G_active, start_node, end_node, weight="danger_weight")
    if primary_route is None:
        raise RuntimeError("Güzergah bulunamadı. Noktaları daha geniş seçmeyi dene.")

    primary_coords = [
        [G_active.nodes[n]["y"], G_active.nodes[n]["x"]]
        for n in primary_route
    ]

    # 5. Alternatif rota: Normal ağırlıklı (karşılaştırma için)
    alt_coords = None
    alt_route = _find_path(G_active, start_node, end_node, weight="length")
    if alt_route and alt_route != primary_route:
        alt_coords = [
            [G_active.nodes[n]["y"], G_active.nodes[n]["x"]]
            for n in alt_route
        ]

    logger.info(
        f"✅ Rota hazır: ana={len(primary_coords)} nokta"
        + (f", alternatif={len(alt_coords)} nokta" if alt_coords else "")
    )

    return {
        "primary_route": primary_coords,
        "alternative_route": alt_coords,
    }


def _find_path(
    G: nx.MultiDiGraph,
    source: int, target: int,
    weight: str = "danger_weight"
) -> list | None:
    """
    Kademeli fallback ile yol bulma.
    1. Ağırlıklı en kısa yol dene
    2. Başarısızsa ağırlıksız dene
    3. Hâlâ yoksa None döndür
    """
    try:
        return nx.shortest_path(G, source=source, target=target, weight=weight)
    except nx.NetworkXNoPath:
        logger.warning(f"'{weight}' ağırlığı ile rota bulunamadı, ağırlıksız deneniyor...")
        try:
            return nx.shortest_path(G, source=source, target=target)
        except nx.NetworkXNoPath:
            logger.error("Hiçbir rota bulunamadı!")
            return None
