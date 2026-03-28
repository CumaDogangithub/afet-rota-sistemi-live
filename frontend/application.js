/**
 * Afet Rota Sistemi — Frontend Controller
 * ========================================
 * Harita etkileşimi, koordinat girişi, görüntü analiz ve sonuç görselleştirme.
 */

// === CONFIG ===
const API_URL = 'http://127.0.0.1:8000';
const MAP_CENTER = [36.2023, 36.1613]; // Antakya
const MAP_ZOOM = 17;

// === STATE ===
let map;
let markers = { A: null, B: null };
let routeLayer = null;
let altRouteLayer = null;
let enkazLayers = [];
let dangerZoneLayers = [];
let isAnalyzing = false;

// === DOM ELEMENTS ===
const statusBox = document.getElementById('statusBox');
const analizBtn = document.getElementById('analizBtn');
const resetBtn = document.getElementById('resetBtn');
const statsGrid = document.getElementById('statsGrid');
const progressSteps = document.getElementById('progressSteps');
const legendPanel = document.getElementById('legendPanel');

// Step elements
const stepCapture = document.getElementById('stepCapture');
const stepAI = document.getElementById('stepAI');
const stepRoute = document.getElementById('stepRoute');
const stepDone = document.getElementById('stepDone');

// Stat elements
const statEnkaz = document.getElementById('statEnkaz');
const statRota = document.getElementById('statRota');

// Coordinate input elements
const coordALat = document.getElementById('coordALat');
const coordALon = document.getElementById('coordALon');
const coordBLat = document.getElementById('coordBLat');
const coordBLon = document.getElementById('coordBLon');
const applyABtn = document.getElementById('applyABtn');
const applyBBtn = document.getElementById('applyBBtn');

// === PANEL TOGGLE ELEMENTS ===
const controlPanel = document.querySelector('.control-panel');
const hidePanelBtn = document.getElementById('hidePanelBtn');
const showPanelBtn = document.getElementById('showPanelBtn');

// === DRONE MODE ELEMENTS ===
const droneFileInput = document.getElementById('droneFileInput');
const droneModeOverlay = document.getElementById('droneModeOverlay');
const droneCanvas = document.getElementById('droneCanvas');
let droneCtx = null; // Daha sonra set edilecek
const droneAnalyzeBtn = document.getElementById('droneAnalyzeBtn');
const droneCloseBtn = document.getElementById('droneCloseBtn');
const droneInstruction = document.getElementById('droneInstruction');

let droneImageObj = null;
let dronePoints = { A: null, B: null }; 
let isDroneAnalyzing = false;

// === MAP INIT ===
function initMap() {
    map = L.map('map', {
        preferCanvas: true,
        maxZoom: 22,
        zoomControl: true
    }).setView(MAP_CENTER, MAP_ZOOM);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Maxar | Esri',
        maxZoom: 22,
        maxNativeZoom: 18
    }).addTo(map);

    // Harita tıklama — A ve B noktası seç
    map.on('click', onMapClick);
}

function onMapClick(e) {
    if (isAnalyzing) return;

    if (!markers.A) {
        setMarker('A', e.latlng.lat, e.latlng.lng);
        setStatus('A noktası seçildi. Şimdi hedef (B) noktasını seç.', 'info');
    } else if (!markers.B) {
        setMarker('B', e.latlng.lat, e.latlng.lng);
        setStatus('A ve B hazır! "Analiz Başlat" ile yapay zekayı ateşle.', 'info');
    }
}

/**
 * Marker oluşturur veya günceller ve input alanlarını senkronize eder.
 */
function setMarker(point, lat, lng) {
    const color = point === 'A' ? '#3b82f6' : '#ef4444';
    const label = point === 'A' ? '📍 Başlangıç (A)' : '🎯 Hedef (B)';

    // Mevcut marker'ı kaldır
    if (markers[point]) {
        map.removeLayer(markers[point]);
    }

    // Yeni marker oluştur
    markers[point] = L.marker([lat, lng], {
        draggable: true,
        icon: createMarkerIcon(point, color)
    }).addTo(map);

    markers[point].bindPopup(`<b>${label}</b>`).openPopup();

    // Drag event — marker sürüklenince input'ları güncelle
    markers[point].on('dragend', function (e) {
        const pos = e.target.getLatLng();
        updateCoordInputs(point, pos.lat, pos.lng);
    });

    // Input alanlarını güncelle
    updateCoordInputs(point, lat, lng);

    // Haritayı bu noktaya pan et
    map.panTo([lat, lng]);
}

/**
 * Koordinat input alanlarını günceller.
 */
function updateCoordInputs(point, lat, lng) {
    if (point === 'A') {
        coordALat.value = lat.toFixed(6);
        coordALon.value = lng.toFixed(6);
    } else {
        coordBLat.value = lat.toFixed(6);
        coordBLon.value = lng.toFixed(6);
    }
}

/**
 * Input alanlarından koordinat okuyup marker uygular.
 */
function applyCoordinate(point) {
    const latInput = point === 'A' ? coordALat : coordBLat;
    const lonInput = point === 'A' ? coordALon : coordBLon;

    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);

    if (isNaN(lat) || isNaN(lon)) {
        setStatus(`❌ Geçersiz koordinat! Enlem ve boylam sayısal değer olmalıdır.`, 'error');
        return;
    }

    if (lat < -90 || lat > 90) {
        setStatus(`❌ Enlem -90 ile 90 arasında olmalıdır.`, 'error');
        return;
    }

    if (lon < -180 || lon > 180) {
        setStatus(`❌ Boylam -180 ile 180 arasında olmalıdır.`, 'error');
        return;
    }

    setMarker(point, lat, lon);

    const pointLabel = point === 'A' ? 'Başlangıç (A)' : 'Hedef (B)';
    setStatus(`✅ ${pointLabel} noktası ayarlandı: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, 'info');

    // Her iki nokta da seçildiyse bilgilendir
    if (markers.A && markers.B) {
        setTimeout(() => {
            setStatus('A ve B hazır! "Analiz Başlat" ile yapay zekayı ateşle.', 'info');
        }, 1500);
    }
}

function createMarkerIcon(label, color) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background: ${color};
            width: 32px; height: 32px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            color: white; font-weight: 700; font-size: 14px;
            box-shadow: 0 3px 12px ${color}88;
            border: 2px solid white;
            font-family: Inter, sans-serif;
        ">${label}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

// === ANALİZ ===
async function otonomAnalizEt() {
    if (!markers.A || !markers.B) {
        setStatus('Önce haritada A ve B noktalarını seç!', 'error');
        return;
    }
    if (isAnalyzing) return;

    isAnalyzing = true;
    analizBtn.disabled = true;
    clearResults();
    showProgress(true);

    try {
        // Adım 1: Ekran yakalama
        setStep('capture');
        setStatus('📸 Harita görüntüsü yakalanıyor...', 'loading');

        const bounds = map.getBounds();
        const nw = bounds.getNorthWest();
        const se = bounds.getSouthEast();

        // Yüksek kaliteli ekran yakalama
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = await html2canvas(document.getElementById('map'), {
            useCORS: true,
            scale: scale,
            logging: false,
            backgroundColor: null,
            removeContainer: true
        });

        // Adım 2: AI Analiz
        setStep('ai');
        setStatus('🧠 Yapay zeka görüntüyü analiz ediyor...', 'loading');

        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png', 1.0);
        });

        const formData = new FormData();
        formData.append('uydu_fotosu', blob, 'viewport.png');
        formData.append('nw_lat', nw.lat);
        formData.append('nw_lon', nw.lng);
        formData.append('se_lat', se.lat);
        formData.append('se_lon', se.lng);
        formData.append('baslangic_lat', markers.A.getLatLng().lat);
        formData.append('baslangic_lon', markers.A.getLatLng().lng);
        formData.append('hedef_lat', markers.B.getLatLng().lat);
        formData.append('hedef_lon', markers.B.getLatLng().lng);

        // Adım 3: Rota hesaplama (sunucu tarafında)
        setStep('route');
        setStatus('🗺️ Güvenli rota hesaplanıyor...', 'loading');

        const response = await fetch(`${API_URL}/api/otonom-analiz`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Sunucu hatası: ${response.status}`);
        }

        const res = await response.json();

        if (res.durum === 'basarili') {
            // Adım 4: Tamamlandı
            setStep('done');
            drawResults(res);
            showStats(res);
            setStatus(
                `✅ <b>${res.tespit_sayisi}</b> enkaz tespit edildi. Güvenli rota hazır!`,
                'success'
            );
        } else {
            setStatus(`❌ ${res.mesaj || 'Bilinmeyen hata'}`, 'error');
        }

    } catch (e) {
        console.error('Analiz hatası:', e);
        setStatus(`❌ Bağlantı hatası: Sunucu çalışıyor mu? (${e.message})`, 'error');
    } finally {
        isAnalyzing = false;
        analizBtn.disabled = false;
    }
}



// === SONUÇ ÇİZİMİ ===
function drawResults(res) {
    // Tehlike bölgelerini çiz
    if (res.enkazlar) {
        res.enkazlar.forEach(enkaz => {
            const coord = [enkaz.lat, enkaz.lon];
            const radius = enkaz.tehlike_yaricapi_m || 50;

            // Tehlike yarıçapı — yarı şeffaf kırmızı daire
            const dangerZone = L.circle(coord, {
                radius: radius,
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.12,
                weight: 1,
                dashArray: '5,5'
            }).addTo(map);
            dangerZoneLayers.push(dangerZone);

            // Enkaz noktası — küçük dolu daire (riske göre renk)
            const confidencePercent = Math.round((enkaz.confidence || 0) * 100);
            const riskScore = enkaz.risk_score || 0.2;
            const riskPercent = Math.round(riskScore * 100);
            const riskEmoji = riskScore >= 0.9 ? '🔴' : riskScore >= 0.5 ? '🟠' : '🟢';
            const riskLabel = riskScore >= 0.9 ? 'KRİTİK' : riskScore >= 0.5 ? 'ORTA' : 'DÜŞÜK';
            const markerColor = riskScore >= 0.9 ? '#dc2626' : riskScore >= 0.5 ? '#f97316' : '#22c55e';
            const markerFill = riskScore >= 0.9 ? '#f87171' : riskScore >= 0.5 ? '#fdba74' : '#86efac';

            const marker = L.circleMarker(coord, {
                radius: 7,
                color: markerColor,
                fillColor: markerFill,
                fillOpacity: 0.9,
                weight: 2
            }).addTo(map);
            marker.bindPopup(
                `<div style="font-family:Inter,sans-serif;font-size:13px;">
                    <b>🚨 Enkaz Tespiti</b><br>
                    Sınıf: ${enkaz.sinif || 'debris'}<br>
                    Güven: %${confidencePercent}<br>
                    Tehlike Yarıçapı: ${radius}m<br>
                    ${riskEmoji} Risk: %${riskPercent} (${riskLabel})
                </div>`
            );
            enkazLayers.push(marker);
        });
    }

    // Alternatif rota (daha belirgin, mavi)
    if (res.alternatif_rota && res.alternatif_rota.length > 1) {
        altRouteLayer = L.polyline(res.alternatif_rota, {
            color: '#3b82f6',
            weight: 7,
            opacity: 0.6,
            dashArray: '8,8',
            lineCap: 'round'
        }).addTo(map);
    }

    // Ana güvenli rota (kalın, turuncu→yeşil gradient etkisi)
    if (res.guvenli_rota && res.guvenli_rota.length > 1) {
        // Glow efekti
        const glow = L.polyline(res.guvenli_rota, {
            color: '#f97316',
            weight: 16,
            opacity: 0.2,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
        enkazLayers.push(glow);

        // Ana çizgi
        routeLayer = L.polyline(res.guvenli_rota, {
            color: '#f97316',
            weight: 6,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
    }

    // Legend göster
    legendPanel.classList.add('visible');
}

// === UI HELPERS ===
function setStatus(html, type) {
    statusBox.innerHTML = html;
    statusBox.className = 'status-box';
    if (type === 'loading') statusBox.classList.add('status-loading');
    if (type === 'success') statusBox.classList.add('status-success');
    if (type === 'error') statusBox.classList.add('status-error');
}

function showProgress(show) {
    progressSteps.classList.toggle('visible', show);
    // Reset steps
    [stepCapture, stepAI, stepRoute, stepDone].forEach(s => {
        s.className = 'progress-step';
    });
}

function setStep(step) {
    const steps = ['capture', 'ai', 'route', 'done'];
    const elements = [stepCapture, stepAI, stepRoute, stepDone];
    const currentIdx = steps.indexOf(step);

    elements.forEach((el, i) => {
        if (i < currentIdx) {
            el.className = 'progress-step done';
            el.querySelector('.step-icon').textContent = '✓';
        } else if (i === currentIdx) {
            el.className = 'progress-step active';
        } else {
            el.className = 'progress-step';
        }
    });
}

function showStats(res) {
    statEnkaz.textContent = res.tespit_sayisi || 0;
    statRota.textContent = res.guvenli_rota ? res.guvenli_rota.length : 0;
    statsGrid.classList.add('visible');
}

function clearResults() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (altRouteLayer) { map.removeLayer(altRouteLayer); altRouteLayer = null; }
    enkazLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    dangerZoneLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    enkazLayers = [];
    dangerZoneLayers = [];
    statsGrid.classList.remove('visible');
    legendPanel.classList.remove('visible');
    showProgress(false);
}

function resetAll() {
    clearResults();
    if (markers.A) { map.removeLayer(markers.A); markers.A = null; }
    if (markers.B) { map.removeLayer(markers.B); markers.B = null; }

    // Koordinat inputlarını temizle
    coordALat.value = '';
    coordALon.value = '';
    coordBLat.value = '';
    coordBLon.value = '';

    // Drone modunu sıfırla
    if (droneCtx && droneCanvas) {
        droneCtx.clearRect(0, 0, droneCanvas.width, droneCanvas.height);
    }
    dronePoints = { A: null, B: null };
    droneImageObj = null;
    droneFileInput.value = '';
    droneAnalyzeBtn.disabled = true;
    droneInstruction.textContent = "1. Başlangıç noktasını (A) seçmek için görsele tıklayın.";

    setStatus('Sistem hazır. Haritada A ve B noktalarını seç veya koordinat gir.', 'info');
}

// === DRONE MODU LOGIC ===

function openDroneMode(file) {
    if (!file) {
        alert("Hata: Dosya alınamadı!");
        return;
    }
    
    // Görüntüyü oku ve Canvas'a at
    const reader = new FileReader();
    reader.onerror = function() { alert("Dosya okuma hatası!"); };
    reader.onload = function(e) {
        const img = new Image();
        img.onerror = function() { alert("Resim yükleme hatası!"); };
        img.onload = function() {
            droneImageObj = img;
            
            // Canvas boyutunu resme uydur
            droneCanvas.width = img.width;
            droneCanvas.height = img.height;
            
            // CSS boyutunu konteynere uydur (responsive)
            droneCanvas.style.width = 'auto';
            droneCanvas.style.height = 'auto';
            
            // Context al (Her seferinde taze)
            droneCtx = droneCanvas.getContext('2d', { alpha: false });
            
            // Keskinlik için imageSmoothingEnabled kapatılabilir veya açılabilir
            // Drone fotoğraflarında true genelde daha iyidir
            droneCtx.imageSmoothingEnabled = true;
            droneCtx.imageSmoothingQuality = 'high';
            
            // Resmi çiz
            droneCtx.drawImage(img, 0, 0);
            
            // UI ayarla
            document.getElementById('droneWorkspaceEmpty').style.display = 'none';
            document.getElementById('droneCanvasContainer').style.display = 'flex';
            dronePoints = { A: null, B: null };
            droneInstruction.textContent = "1. Başlangıç noktasını (A) seçmek için görsele tıklayın.";
            droneAnalyzeBtn.disabled = true;
        }
        img.src = e.target.result;
    }
    reader.readAsDataURL(file);
}

function closeDroneMode() {
    droneModeOverlay.style.display = 'none';
    document.getElementById('droneWorkspaceEmpty').style.display = 'flex';
    document.getElementById('droneCanvasContainer').style.display = 'none';
    droneFileInput.value = ''; // Yeni seçime izin ver
}

function redrawDroneCanvas() {
    if (!droneImageObj) return;
    
    // Temizle ve resmi yeniden çiz
    droneCtx.clearRect(0, 0, droneCanvas.width, droneCanvas.height);
    droneCtx.drawImage(droneImageObj, 0, 0);
    
    // A noktasını çiz
    if (dronePoints.A) drawDroneMarker(dronePoints.A.x, dronePoints.A.y, 'A', '#3b82f6');
    // B noktasını çiz
    if (dronePoints.B) drawDroneMarker(dronePoints.B.x, dronePoints.B.y, 'B', '#ef4444');
}

function drawDroneMarker(x, y, label, color) {
    // Dış Halka
    droneCtx.beginPath();
    droneCtx.arc(x, y, 15, 0, 2 * Math.PI);
    droneCtx.fillStyle = color;
    droneCtx.fill();
    droneCtx.lineWidth = 3;
    droneCtx.strokeStyle = '#ffffff';
    droneCtx.stroke();
    
    // İç Metin
    droneCtx.fillStyle = '#ffffff';
    droneCtx.font = 'bold 16px Arial';
    droneCtx.textAlign = 'center';
    droneCtx.textBaseline = 'middle';
    droneCtx.fillText(label, x, y + 1);
}

droneCanvas.addEventListener('click', (e) => {
    if (isDroneAnalyzing) return;
    
    // Tıklanan piksel koordinatını hesapla (CSS scale vs hesaba katarak)
    const rect = droneCanvas.getBoundingClientRect();
    const scaleX = droneCanvas.width / rect.width;
    const scaleY = droneCanvas.height / rect.height;
    
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    
    if (!dronePoints.A) {
        dronePoints.A = { x, y };
        droneInstruction.textContent = "2. Hedef noktasını (B) seçin.";
    } else if (!dronePoints.B) {
        dronePoints.B = { x, y };
        droneInstruction.textContent = "3. Noktalar seçildi. Analizi başlatabilirsiniz.";
        droneAnalyzeBtn.disabled = false;
    } else {
        // İkisi de varsa, sıfırlayıp baştan A ata
        dronePoints.A = { x, y };
        dronePoints.B = null;
        droneInstruction.textContent = "2. Hedef noktasını (B) seçin.";
        droneAnalyzeBtn.disabled = true;
    }
    
    redrawDroneCanvas();
});

async function runDroneAnalysis() {
    if (!droneImageObj || !dronePoints.A || !dronePoints.B) return;
    
    isDroneAnalyzing = true;
    droneAnalyzeBtn.disabled = true;
    droneCloseBtn.disabled = true;
    droneInstruction.textContent = "⏳ Analiz ediliyor... (A* Algoritması ve Engel Tespiti)";
    
    try {
        // Yüksek kalite Blob olarak gönder (0.9 -> 0.95)
        droneCanvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('resim', blob, 'drone_image.jpg');
            formData.append('start_x', dronePoints.A.x);
            formData.append('start_y', dronePoints.A.y);
            formData.append('end_x', dronePoints.B.x);
            formData.append('end_y', dronePoints.B.y);
            
            const response = await fetch(`${API_URL}/api/drone-analiz`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const res = await response.json();
            
            if (res.durum === 'basarili') {
                droneInstruction.textContent = `✅ Tamamlandı: ${res.engeller.length} engel bulundu. Rota çizildi.`;
                drawDroneResults(res.engeller, res.rota);
            } else {
                droneInstruction.textContent = `❌ Hata: ${res.mesaj}`;
            }
        }, 'image/jpeg', 0.95);
        
    } catch (e) {
        console.error("Drone analiz hatası:", e);
        droneInstruction.textContent = `❌ Başarısız: Sunucu bağlantı hatası.`;
    } finally {
        isDroneAnalyzing = false;
        droneCloseBtn.disabled = false;
    }
}

function drawDroneResults(engeller, rota) {
    redrawDroneCanvas(); // Resmi ve markerları temizce çiz
    
    // Engelleri kutu olarak çiz
    engeller.forEach(enc => {
        const x = enc.x - (enc.w / 2);
        const y = enc.y - (enc.h / 2);
        
        // Risk rengine göre sınır
        droneCtx.lineWidth = 3;
        droneCtx.strokeStyle = enc.risk_score >= 0.9 ? '#ef4444' : 
                              enc.risk_score >= 0.5 ? '#f97316' : '#22c55e';
                              
        droneCtx.fillStyle = enc.risk_score >= 0.9 ? 'rgba(239, 68, 68, 0.2)' : 
                            enc.risk_score >= 0.5 ? 'rgba(249, 115, 22, 0.2)' : 'rgba(34, 197, 94, 0.2)';
                            
        droneCtx.beginPath();
        droneCtx.rect(x, y, enc.w, enc.h);
        droneCtx.fill();
        droneCtx.stroke();
    });
    
    // Rotayı çiz
    if (rota && rota.length > 0) {
        droneCtx.beginPath();
        droneCtx.moveTo(rota[0][0], rota[0][1]);
        for (let i = 1; i < rota.length; i++) {
            droneCtx.lineTo(rota[i][0], rota[i][1]);
        }
        droneCtx.strokeStyle = '#f97316'; // Turuncu rota
        droneCtx.lineWidth = 6;
        droneCtx.lineCap = 'round';
        droneCtx.lineJoin = 'round';
        droneCtx.stroke();
        
        // Rotanın üstüne daha ince sarı çizgi (Glow effect)
        droneCtx.strokeStyle = '#fef08a';
        droneCtx.lineWidth = 2;
        droneCtx.stroke();
    }
    
    // A ve B'yi en üste tekrar çiz
    if (dronePoints.A) drawDroneMarker(dronePoints.A.x, dronePoints.A.y, 'A', '#3b82f6');
    if (dronePoints.B) drawDroneMarker(dronePoints.B.x, dronePoints.B.y, 'B', '#ef4444');
}

// === BOOT ===
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Ana analiz ve sıfırlama butonları
    analizBtn.addEventListener('click', otonomAnalizEt);
    resetBtn.addEventListener('click', resetAll);
    
    // Drone Modu Eventleri
    const openDroneWorkspaceBtn = document.getElementById('openDroneWorkspaceBtn');
    if (openDroneWorkspaceBtn) {
        openDroneWorkspaceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            droneModeOverlay.style.display = 'flex';
            document.getElementById('droneWorkspaceEmpty').style.display = 'flex';
            document.getElementById('droneCanvasContainer').style.display = 'none';
            droneFileInput.value = ''; 
        });
    }

    droneFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            openDroneMode(e.target.files[0]);
        }
    });
    
    droneCloseBtn.addEventListener('click', closeDroneMode);
    droneAnalyzeBtn.addEventListener('click', runDroneAnalysis);

    // Koordinat uygulama butonları
    applyABtn.addEventListener('click', () => applyCoordinate('A'));
    applyBBtn.addEventListener('click', () => applyCoordinate('B'));
    
    // Panel Küçült / Büyüt
    hidePanelBtn.addEventListener('click', () => {
        controlPanel.classList.add('hidden');
        showPanelBtn.style.display = 'block';
    });
    
    showPanelBtn.addEventListener('click', () => {
        controlPanel.classList.remove('hidden');
        showPanelBtn.style.display = 'none';
    });

    // Enter tuşu ile koordinat uygulama
    coordALat.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('A'); });
    coordALon.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('A'); });
    coordBLat.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('B'); });
    coordBLon.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('B'); });


});
