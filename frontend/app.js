/**
 * Afet Rota Sistemi — Frontend Controller
 * ========================================
 * Harita etkileşimi, AI analiz isteği ve sonuç görselleştirme.
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
        markers.A = L.marker(e.latlng, {
            draggable: true,
            icon: createMarkerIcon('A', '#3b82f6')
        }).addTo(map);
        markers.A.bindPopup('<b>📍 Başlangıç (A)</b>').openPopup();
        setStatus('A noktası seçildi. Şimdi hedef (B) noktasını seç.', 'info');
    } else if (!markers.B) {
        markers.B = L.marker(e.latlng, {
            draggable: true,
            icon: createMarkerIcon('B', '#ef4444')
        }).addTo(map);
        markers.B.bindPopup('<b>🎯 Hedef (B)</b>').openPopup();
        setStatus('A ve B hazır! "Analiz Başlat" ile yapay zekayı ateşle.', 'info');
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

            // Enkaz noktası — küçük dolu daire
            const confidencePercent = Math.round((enkaz.confidence || 0) * 100);
            const marker = L.circleMarker(coord, {
                radius: 7,
                color: '#dc2626',
                fillColor: '#f87171',
                fillOpacity: 0.9,
                weight: 2
            }).addTo(map);
            marker.bindPopup(
                `<div style="font-family:Inter,sans-serif;font-size:13px;">
                    <b>🚨 Enkaz Tespiti</b><br>
                    Sınıf: ${enkaz.sinif || 'debris'}<br>
                    Güven: %${confidencePercent}<br>
                    Tehlike Yarıçapı: ${radius}m
                </div>`
            );
            enkazLayers.push(marker);
        });
    }

    // Alternatif rota (ince, sarı, arka planda)
    if (res.alternatif_rota && res.alternatif_rota.length > 1) {
        altRouteLayer = L.polyline(res.alternatif_rota, {
            color: '#fbbf24',
            weight: 5,
            opacity: 0.4,
            dashArray: '8,8',
            lineCap: 'round'
        }).addTo(map);
    }

    // Ana güvenli rota (kalın, turuncu→yeşil gradient etkisi)
    if (res.guvenli_rota && res.guvenli_rota.length > 1) {
        // Glow efekti
        L.polyline(res.guvenli_rota, {
            color: '#f97316',
            weight: 16,
            opacity: 0.2,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
        enkazLayers.push(enkazLayers[enkazLayers.length - 1]); // track for cleanup

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
    setStatus('Sistem hazır. Haritada A ve B noktalarını seç.', 'info');
}

// === BOOT ===
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    analizBtn.addEventListener('click', otonomAnalizEt);
    resetBtn.addEventListener('click', resetAll);
});
