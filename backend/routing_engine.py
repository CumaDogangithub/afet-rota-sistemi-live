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


def _dist_to_segment(p_lat: float, p_lon: float, a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    """
    P (Enkaz) noktasının AB doğru parçasına (yol) olan en kısa mesafesini (metre) hesaplar.
    Düzlemsel geometri (Equirectangular projeksiyon) yaklaşımı kullanılır.
    """
    cos_lat = math.cos(math.radians(p_lat))
    
    # Derece cinsinden XY düzlemine oturt
    px, py = p_lon * cos_lat, p_lat
    ax, ay = a_lon * cos_lat, a_lat
    bx, by = b_lon * cos_lat, b_lat
    
    l2 = (ax - bx)**2 + (ay - by)**2
    if l2 == 0:
        return _haversine_distance(p_lat, p_lon, a_lat, a_lon)
        
    # P noktasından AB doğrusuna inen dikmenin t parametresi (sınırlandırılmış: [0, 1])
    t = max(0, min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2))
    
    proj_x = ax + t * (bx - ax)
    proj_y = ay + t * (by - ay)
    
    proj_lon = proj_x / cos_lat
    proj_lat = proj_y
    
    return _haversine_distance(p_lat, p_lon, proj_lat, proj_lon)


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
        
        # Mekansal Filtre: Sokaklar çok uzun olabileceği için margin'i devasa tut (örn: radius + 2000m)
        # Eğer sokak segmenti 2km'den uzun değilse (ki şehir içinde imkansız) asla gözden kaçırmaz.
        lat_margin = (radius + 2000.0) / METERS_PER_DEG
        lon_margin = (radius + 2000.0) / (METERS_PER_DEG * 0.8) # cos(36) ~ 0.8
        
        affected_edges = 0

        for u, v, k, data in G.edges(keys=True, data=True):
            u_lat = G.nodes[u]["y"]
            u_lon = G.nodes[u]["x"]
            v_lat = G.nodes[v]["y"]
            v_lon = G.nodes[v]["x"]
            
            mid_lat = (u_lat + v_lat) / 2
            mid_lon = (u_lon + v_lon) / 2

            # HIZLI FİLTRE: Bounding Box. U, V veya Mid noktalarından en az BİRİ margin içindeyse hesapla
            if (abs(u_lat - d_lat) > lat_margin and abs(v_lat - d_lat) > lat_margin and abs(mid_lat - d_lat) > lat_margin) or \
               (abs(u_lon - d_lon) > lon_margin and abs(v_lon - d_lon) > lon_margin and abs(mid_lon - d_lon) > lon_margin):
                continue

            # Noktanın doğru parçasına dik olan EN KISA mesafesini hesapla
            distance = _dist_to_segment(d_lat, d_lon, u_lat, u_lon, v_lat, v_lon)

            # Sadece radius kadar değil, %20 güvenlik payıyla (radius * 1.2) kontrol edelim
            if distance < (radius * 1.2):
                # Kademeli ceza (multiplier) yerine devasa SABİT bir ceza ekliyoruz (+ 1000 km).
                # Böylece yol kenarından bile geçse kesinlikle o sokağa girmeyi reddedecek.
                data["danger_weight"] += 1_000_000.0
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

    # Gerçek A ve B noktalarını listenin başına ve sonuna ekle
    # Gerçek sokak kıvrımlarını (geometry) çizmek için LineString'i kullan
    primary_coords = [[start_lat, start_lon]]
    for i in range(len(primary_route)):
        if i > 0:
            u_node = primary_route[i-1]
            v_node = primary_route[i]
            edge_data = G_active.get_edge_data(u_node, v_node)[0]
            if "geometry" in edge_data:
                # shapely LineString (lon, lat) formatındadır
                for coord in list(edge_data["geometry"].coords)[1:]:
                    primary_coords.append([coord[1], coord[0]])
                continue
        primary_coords.append([G_active.nodes[primary_route[i]]["y"], G_active.nodes[primary_route[i]]["x"]])
    
    primary_coords.append([end_lat, end_lon])

    # 5. Gerçek Bir Alternatif Rota Bul (Ana rotadaki kenarları cezalandırarak)
    # Önce ana rotadaki kenarların tehlike ağırlıklarını geçici olarak artıralım (örn. 5 kat)
    # Böylece algoritma mümkünse başka bir *güvenli* yol bulmaya çalışır.
    alt_coords = None
    if len(primary_route) > 1:
        # Ana rota kenarlarının ağırlığını orantısal artır (1.5x)
        # Böylece mantıklı alternatif caddeler arar, 1km düz ceza gibi alakasız rotalar çizmez.
        for i in range(len(primary_route) - 1):
            u = primary_route[i]
            v = primary_route[i+1]
            if G_active.has_edge(u, v):
                for k in G_active[u][v]:
                    if "danger_weight" in G_active[u][v][k]:
                        G_active[u][v][k]["danger_weight"] *= 1.5

        alt_route = _find_path(G_active, start_node, end_node, weight="danger_weight")
        
        if alt_route and alt_route != primary_route:
            alt_coords = [[start_lat, start_lon]]
            for i in range(len(alt_route)):
                if i > 0:
                    u_node = alt_route[i-1]
                    v_node = alt_route[i]
                    edge_data = G_active.get_edge_data(u_node, v_node)[0]
                    if "geometry" in edge_data:
                        for coord in list(edge_data["geometry"].coords)[1:]:
                            alt_coords.append([coord[1], coord[0]])
                        continue
                alt_coords.append([G_active.nodes[alt_route[i]]["y"], G_active.nodes[alt_route[i]]["x"]])
            
            alt_coords.append([end_lat, end_lon])

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
