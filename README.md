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

Projeyi klonladıktan sonra tek yapmanız gereken işletim sisteminize uygun **başlatma dosyasını** çalıştırmaktır. Sistem tüm sanal ortamları (`venv`), kütüphaneleri ve `.env` dosyalarını otomatik olarak sizin için kurup haritayı tarayıcıda açacaktır.

**Windows Kullanıcıları İçin:**
Proje klasöründeki `start.bat` dosyasına **çift tıklayın**.

**Mac / Linux Kullanıcıları İçin:**
Terminali açıp proje dizininde şu komutu çalıştırın:
```bash
./start.sh
```

*(Not: İlk çalıştırmada OSMNx internetten Antakya yön haritasını indireceği için kısa bir bekleme yaşanabilir).*

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