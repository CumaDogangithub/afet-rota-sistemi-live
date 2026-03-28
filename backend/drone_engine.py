"""
AstroGuard Drone / Helikopter Analiz Motoru
===========================================
Görüntü yüklenir, Roboflow ile enkaz tespiti yapılır, 
ve engellerden kaçan A* (A-Star) algoritması ile piksel bazlı rota çizilir.
"""
import os
import math
import heapq
import numpy as np
from inference_sdk import InferenceHTTPClient
import logging
from backend.config import ROBOFLOW_API_KEY, ROBOFLOW_MODEL_ID

logger = logging.getLogger(__name__)

# Orijinal engel_tespit.py parametreleri
MIN_CONFIDENCE = 0.25
MIN_SIZE = 10
RISK_RADIUS_PADDING = 20  # Engelin etrafındaki ekstra kaçınma pikselleri

CLIENT = InferenceHTTPClient(
    api_url="https://serverless.roboflow.com",
    api_key=ROBOFLOW_API_KEY
)
MODEL_ID = ROBOFLOW_MODEL_ID


def analyze_drone_image(image_path: str, start_pt: tuple[int, int], end_pt: tuple[int, int]) -> dict:
    """
    1. Görüntüyü Roboflow ile analiz et
    2. Engelleri bul
    3. Engellerden kaçarak A* rotası çiz
    """
    logger.info(f"🚁 Drone analizi başlatıldı: {image_path} (A={start_pt}, B={end_pt})")
    
    # --- 1. ENKAZ TESPİTİ (engel_tespit.py mantığı) ---
    result = CLIENT.infer(image_path, model_id=MODEL_ID)
    raw_predictions = result.get('predictions', [])
    
    # Resim boyutları (Roboflow'dan geliyorsa al, yoksa standart 1000x1000 varsay for grid)
    img_width = result.get('image', {}).get('width', 1920)
    img_height = result.get('image', {}).get('height', 1080)
    
    obstacles = []
    
    for p in raw_predictions:
        label = p['class']
        conf = p['confidence']
        x, y = p['x'], p['y']
        w, h = p.get('width', 0), p.get('height', 0)
        
        if conf >= MIN_CONFIDENCE and w >= MIN_SIZE and h >= MIN_SIZE:
            class_lower = label.lower()
            if class_lower == 'collapsed':
                risk = 0.95
            elif class_lower == 'damaged':
                risk = 0.65
            else:
                risk = 0.20
                
            obstacles.append({
                "type": label,
                "confidence": round(conf, 3),
                "x": round(x),
                "y": round(y),
                "w": round(w),
                "h": round(h),
                "risk_score": risk
            })
            
    logger.info(f"🚁 {len(obstacles)} engel tespit edildi.")
    
    # --- 2. A* ROTA HESAPLAMA (Piksel Grid üzerinde) ---
    # Çok büyük resimlerde piksellerde yürümek yavaş olur, scale down mantığı kullanabiliriz
    # Veya grid üzerinden "hop" (adım) boyutunu büyütebiliriz.
    
    route = _find_pixel_path(img_width, img_height, obstacles, start_pt, end_pt)
    
    return {
        "engeller": obstacles,
        "rota": route
    }


def _find_pixel_path(width: int, height: int, obstacles: list[dict], start: tuple[int,int], end: tuple[int,int]):
    """
    Basit bir kaba A* implementasyonu veya düz çizgi çekme, yavaşlamaması için downscale yaklaşımı.
    """
    logger.info("🗺️ A* Drone rotası hesaplanıyor...")
    
    # Performans için çalışma alanını küçült (Grid Resolution)
    # 1 birim grid = 10 pixel
    GRID_SIZE = 10
    
    gw = int(math.ceil(width / GRID_SIZE))
    gh = int(math.ceil(height / GRID_SIZE))
    
    # Grid matrisi oluştur (0=geçilebilir, 1=engel)
    grid = np.zeros((gh, gw), dtype=np.uint8)
    
    # Engelleri gride yerleştir
    for obs in obstacles:
        # Engelin bounding box'ını grid koordinatlarına çevir, padding ekle
        x1 = max(0, int((obs['x'] - obs['w']/2 - RISK_RADIUS_PADDING) / GRID_SIZE))
        y1 = max(0, int((obs['y'] - obs['h']/2 - RISK_RADIUS_PADDING) / GRID_SIZE))
        x2 = min(gw-1, int((obs['x'] + obs['w']/2 + RISK_RADIUS_PADDING) / GRID_SIZE))
        y2 = min(gh-1, int((obs['y'] + obs['h']/2 + RISK_RADIUS_PADDING) / GRID_SIZE))
        
        # Risk >= 0.5 olanları (collapsed, damaged) engel olarak işaretle (içerisinden geçilemez)
        if obs['risk_score'] >= 0.5:
            grid[y1:y2+1, x1:x2+1] = 1
            
    # Başlangıç ve Bitiş grid koordinatlarını bul
    sx, sy = int(start[0] / GRID_SIZE), int(start[1] / GRID_SIZE)
    ex, ey = int(end[0] / GRID_SIZE), int(end[1] / GRID_SIZE)
    
    # Sınır kontrolü
    sx = max(0, min(sx, gw-1))
    sy = max(0, min(sy, gh-1))
    ex = max(0, min(ex, gw-1))
    ey = max(0, min(ey, gh-1))
    
    # Başlangıç ve bitiş noktasının engelin içinde kalmamasını sağla
    grid[sy, sx] = 0
    grid[ey, ex] = 0

    # A* Algoritması
    def heuristic(a, b):
        # Diagonal + düz mesafe (Octile / Chebyshev kırması)
        dx = abs(a[0] - b[0])
        dy = abs(a[1] - b[1])
        return math.sqrt(dx*dx + dy*dy) # Euclid
        
    neighbors = [(0,1),(0,-1),(1,0),(-1,0), (1,1),(-1,-1),(1,-1),(-1,1)]
    
    open_set = []
    heapq.heappush(open_set, (0, (sx, sy)))
    came_from = {}
    g_score = {(sx, sy): 0}
    
    path_found = False
    
    while open_set:
        _, current = heapq.heappop(open_set)
        
        if current == (ex, ey):
            path_found = True
            break
            
        cx, cy = current
        for dx, dy in neighbors:
            nx, ny = cx + dx, cy + dy
            
            # Sınır içinde mi?
            if 0 <= nx < gw and 0 <= ny < gh:
                # Engel mi?
                if grid[ny, nx] == 1:
                    continue
                    
                # Çapraz hareket için köşe kesme (corner cutting) kontrolü - basit tutabiliriz
                tentative_g_score = g_score[current] + math.sqrt(dx*dx + dy*dy)
                
                if (nx, ny) not in g_score or tentative_g_score < g_score[(nx, ny)]:
                    came_from[(nx, ny)] = current
                    g_score[(nx, ny)] = tentative_g_score
                    f_score = tentative_g_score + heuristic((nx, ny), (ex, ey))
                    heapq.heappush(open_set, (f_score, (nx, ny)))
                    
    # Yolu oluştur
    route_pixels = []
    # Rota her zaman tam A noktasından başlasın
    route_pixels.append([start[0], start[1]])
    
    if path_found:
        curr = (ex, ey)
        grid_path = []
        while curr in came_from:
            grid_path.append(curr)
            curr = came_from[curr]
        # grid_path.append((sx, sy)) # Gerek yok, tam piksel basıcaz
        grid_path.reverse()
        
        # Grid -> Piksel
        for (gx, gy) in grid_path:
            px = gx * GRID_SIZE + (GRID_SIZE / 2)
            py = gy * GRID_SIZE + (GRID_SIZE / 2)
            route_pixels.append([px, py])
            
    else:
        logger.warning("Drone A* rotası bulunamadı! Düz çizgi çekilecek.")
        
    # Rota her zaman tam B noktasında bitsin
    route_pixels.append([end[0], end[1]])
    
    return route_pixels
