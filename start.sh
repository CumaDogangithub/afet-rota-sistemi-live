#!/bin/bash
echo "===================================="
echo "Afet Rota Sistemi Kurulum ve Baslat"
echo "===================================="

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "[1/4] Sanal ortam (venv) olusturuluyor..."
    python3 -m venv venv
fi

echo "[2/4] Bagimliliklar kontrol ediliyor..."
source venv/bin/activate
pip install -r requirements.txt

echo "[3/4] Cevre (Environment) degiskenleri hazirlaniyor..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ".env dosyasi olusturuldu. (Eger API anahtarini degistirmeniz gerekirse burayi kullaabilirsiniz)."
fi

echo "[4/4] Sunucu baslatiliyor..."
echo ""
echo "========================================================"
echo "Lutfen tarayicizidan http://127.0.0.1:8000/static/index.html adresine gidin."
echo "========================================================"

# Try to open the browser automatically
if which xdg-open > /dev/null
then
  xdg-open http://127.0.0.1:8000/static/index.html &
elif which open > /dev/null
then
  open http://127.0.0.1:8000/static/index.html &
fi

python -m backend.app
