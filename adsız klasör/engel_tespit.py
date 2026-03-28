from inference_sdk import InferenceHTTPClient
import json
import os

# ==========================================
#   🛰️ AstroGuard - Afet Analiz Motoru
# ==========================================

API_KEY = "5fbUGdRiFe1D8ja16Uvq"
MODEL_ID = "earthquake-damage-detection-xmfgr/1"
GORUNTU = "marasdepremi.jpg"  # YENİ

# 🎯 BARAJ KAPAKLARI AÇILDI: Eşikler Düşürüldü
MIN_CONFIDENCE = 0.25  # %65'ten %25'e düşürüldü (Daha çok şüpheli alan)
MIN_SIZE = 10          # 20'den 10'a düşürüldü (Daha küçük molozlar)

CLIENT = InferenceHTTPClient(
    api_url="https://serverless.roboflow.com",
    api_key=API_KEY
)

print("\n" + "="*52)
print("🛰️  AstroGuard: Afet Bölgesi Analiz Motoru")
print("💻  Asus TUF F16 | Geniş Alan Tarama Modu")
print("="*52 + "\n")

if not os.path.exists(GORUNTU):
    print(f"❌ HATA: '{GORUNTU}' bulunamadı! Klasörü kontrol et.")
    exit()

print(f"🔍 '{GORUNTU}' analiz ediliyor...\n")

result = CLIENT.infer(GORUNTU, model_id=MODEL_ID)
raw_predictions = result.get('predictions', [])

obstacles = []
sayac = 1

print("📡 TESPİT SONUÇLARI:")
print("-" * 52)

if not raw_predictions:
    print("⚠️  Ham veri boş — model hiç tespit yapamadı.")
else:
    for p in raw_predictions:
        label = p['class']
        conf = p['confidence']
        x, y = p['x'], p['y']
        w, h = p.get('width', 0), p.get('height', 0)

        # Filtreleme burada yapılıyor
        if conf >= MIN_CONFIDENCE and w >= MIN_SIZE and h >= MIN_SIZE:

            if label == 'collapsed':
                risk = 0.95
                emoji = "🔴"
            elif label == 'damaged':
                risk = 0.65
                emoji = "🟠"
            else:
                risk = 0.20
                emoji = "🟢"

            print(f"{emoji} [{sayac}] {label.upper()}")
            print(f"    📊 Güven  : %{round(conf*100, 1)}")
            print(f"    📍 Piksel : X={round(x)}, Y={round(y)}")
            print(f"    📐 Boyut  : {round(w)}x{round(h)} px")
            print(f"    ⚠️  Risk   : {risk}")
            print()

            obstacles.append({
                "id": sayac,
                "type": label,
                "confidence": round(conf, 3),
                "pixel_x": round(x, 1),
                "pixel_y": round(y, 1),
                "width_px": round(w, 1),
                "height_px": round(h, 1),
                "risk_score": risk
            })
            sayac += 1

if not obstacles:
    print("🔕 Filtreden geçen tespit yok.")
    print("   → MIN_CONFIDENCE veya MIN_SIZE değerini düşürmeyi dene.")

with open('obstacles.json', 'w', encoding='utf-8') as f:
    json.dump({
        "goruntu": GORUNTU,
        "toplam": len(obstacles),
        "engeller": obstacles
    }, f, indent=4, ensure_ascii=False)

print("-" * 52)
print(f"✅ {len(obstacles)} hassas engel tespit edildi (Geniş Alan).")
print(f"📦 obstacles.json oluşturuldu → Cuma'ya gönder!")
print("="*52 + "\n")
