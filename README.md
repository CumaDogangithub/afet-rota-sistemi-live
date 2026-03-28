# 🛰️ Afet Rota Sistemi

Uydu/drone görüntülerinden **yapay zeka ile enkaz tespiti** yaparak, afet bölgesinde **güvenli rota hesaplayan** web tabanlı komuta merkezi.

## 🚀 Özellikler

- **AI Enkaz Tespiti**: Roboflow üzerinde eğitilmiş deprem hasar modeli ile otomatik enkaz algılama
- **Görüntü Ön-İşleme**: CLAHE kontrast iyileştirme, keskinleştirme
- **Akıllı Rota Hesaplama**: Enkaz bölgelerinden kaçınan ağırlıklı en kısa yol algoritması
- **Tehlike Bölgesi Analizi**: Enkaz büyüklüğüne göre dinamik tehlike yarıçapı
- **Alternatif Rota**: Ana rota + karşılaştırma rotası
- **Gerçek Zamanlı Harita**: Leaflet.js + Esri uydu görüntüleri

## 📋 Kurulum

## 🚀 Hızlı Kurulum

1. **Repoyu Klonlayın:**
   ```bash
   git clone <repo-url>
   cd afet-rota-sistemi
   ```

2. **Bağımlılıkları Yükleyin:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows için: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Yapılandırma (.env):**
   `.env.example` dosyasını `.env` olarak kopyalayın ve `ROBOFLOW_API_KEY` kısmına kendi anahtarınızı ekleyin.
   ```bash
   cp .env.example .env
   ```

4. **Çalıştırın:**
   ```bash
   python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
   ```
   Ardından tarayıcıda `http://localhost:8000/static/index.html` adresine gidin.

## 🗺️ Harita ve Rota Motoru
Proje, Antakya bölgesi için önceden indirilmiş bir yol ağı (`antakya_graph.graphml`) ile birlikte gelir. Bu sayede ilk açılışta internetten harita indirme bekletmesi yaşanmaz ve "nokta bulunamadı" hataları önlenir.

## 🏃 Çalıştırma

```bash
# Backend sunucuyu başlat
python -m backend.app
```

Sunucu başladıktan sonra `frontend/index.html` dosyasını tarayıcıda aç.

## 🗂️ Proje Yapısı

```
afet-rota-sistemi/
├── backend/
│   ├── app.py              # FastAPI sunucu
│   ├── ai_engine.py        # AI enkaz tespit motoru
│   ├── routing_engine.py   # Güvenli rota hesaplama motoru
│   └── config.py           # Merkezi konfigürasyon
├── frontend/
│   ├── index.html           # Ana sayfa
│   ├── style.css            # Premium dark theme
│   └── app.js               # Frontend controller
├── .env                     # API anahtarları (git'e dahil değil)
├── requirements.txt         # Python bağımlılıkları
└── README.md
```

## 🔧 Nasıl Çalışır?

1. Haritada **A** (başlangıç) ve **B** (hedef) noktalarını seç
2. Bölgeye yakınlaş
3. **"Analiz Başlat"** butonuna tıkla
4. Sistem:
   - Ekran görüntüsünü yakalar
   - AI modeline gönderip enkaz tespit eder
   - Enkaz bölgelerini haritada işaretler
   - Tehlike yarıçaplarını hesaplar
   - Enkazlardan kaçınan güvenli rotayı çizer

## ⚙️ Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Backend | FastAPI, Python |
| AI Modeli | Roboflow (Earthquake Damage Detection) |
| Görüntü İşleme | OpenCV, CLAHE |
| Harita/Rota | OSMnx, NetworkX, OpenStreetMap |
| Frontend | Leaflet.js, html2canvas |