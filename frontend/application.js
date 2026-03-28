/**
 * Afet Rota Sistemi — Frontend Controller
 */

// === CONFIG ===
const API_URL = window.location.origin;
const MAP_CENTER = [36.2023, 36.1613];
const MAP_ZOOM = 17;

// === STATE ===
let map;
let markers = { A: null, B: null };
let routeLayer = null;
let altRouteLayer = null;
let enkazLayers = [];
let dangerZoneLayers = [];
let routeLabelLayers = [];
let isAnalyzing = false;

// === DOM ELEMENTS ===
const statusBox = document.getElementById('statusBox');
const analizBtn = document.getElementById('analizBtn');
const resetBtn = document.getElementById('resetBtn');
const statsGrid = document.getElementById('statsGrid');
const progressSteps = document.getElementById('progressSteps');
const legendPanel = document.getElementById('legendPanel');

const stepCapture = document.getElementById('stepCapture');
const stepAI = document.getElementById('stepAI');
const stepRoute = document.getElementById('stepRoute');
const stepDone = document.getElementById('stepDone');

const statEnkaz = document.getElementById('statEnkaz');
const statRota = document.getElementById('statRota');

const coordALat = document.getElementById('coordALat');
const coordALon = document.getElementById('coordALon');
const coordBLat = document.getElementById('coordBLat');
const coordBLon = document.getElementById('coordBLon');
const applyABtn = document.getElementById('applyABtn');
const applyBBtn = document.getElementById('applyBBtn');

const controlPanel = document.querySelector('.control-panel');
const hidePanelBtn = document.getElementById('hidePanelBtn');
const showPanelBtn = document.getElementById('showPanelBtn');

const droneFileInput = document.getElementById('droneFileInput');
const droneModeOverlay = document.getElementById('droneModeOverlay');
const droneCanvas = document.getElementById('droneCanvas');
let droneCtx = null;
const droneAnalyzeBtn = document.getElementById('droneAnalyzeBtn');
const droneCloseBtn = document.getElementById('droneCloseBtn');
const droneInstruction = document.getElementById('droneInstruction');

let droneImageObj = null;
let dronePoints = { A: null, B: null };
let isDroneAnalyzing = false;

const themeToggleBtn = document.getElementById('themeToggleBtn');
const earthquakeBtn = document.getElementById('earthquakeBtn');
const emergencyBtn = document.getElementById('emergencyBtn');
const earthquakeModal = document.getElementById('earthquakeModal');
const emergencyModal = document.getElementById('emergencyModal');
const earthquakeModalClose = document.getElementById('earthquakeModalClose');
const emergencyModalClose = document.getElementById('emergencyModalClose');

// ============================================
// THEME
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('afet-rota-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('afet-rota-theme', next);
}
initTheme();

// ============================================
// DEPREM VERİSİ
// ============================================
const EARTHQUAKE_API = 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live';

async function fetchEarthquakes() {
    const content = document.getElementById('earthquakeListContent');
    content.innerHTML = '<div class="eq-loading"><div class="spinner"></div>Deprem verileri yukleniyor...</div>';
    try {
        const response = await fetch(EARTHQUAKE_API);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const quakes = data.result || [];
        if (quakes.length === 0) {
            content.innerHTML = '<div class="eq-loading">Kayitli deprem verisi bulunamadi.</div>';
            return;
        }
        const items = quakes.slice(0, 50);
        let html = '<div class="earthquake-list">';
        items.forEach(q => {
            const mag = parseFloat(q.mag) || 0;
            let magClass = 'mag-low';
            if (mag >= 5) magClass = 'mag-critical';
            else if (mag >= 4) magClass = 'mag-high';
            else if (mag >= 3) magClass = 'mag-mid';
            const location = q.title || q.lokasyon || 'Bilinmiyor';
            const depth = q.depth || '-';
            const date = q.date || '';
            let timeStr = '';
            if (date) {
                const d = new Date(date);
                if (!isNaN(d.getTime())) {
                    timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                } else {
                    timeStr = date.split(' ').pop() || '';
                }
            }
            html += `
                <div class="earthquake-item">
                    <div class="eq-magnitude ${magClass}">${mag.toFixed(1)}</div>
                    <div class="eq-info">
                        <div class="eq-location">${location}</div>
                        <div class="eq-details"><span>Derinlik: ${depth} km</span></div>
                    </div>
                    <div class="eq-time">${timeStr}</div>
                </div>`;
        });
        html += '</div>';
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = '<div class="eq-error">Deprem verileri yuklenemedi.</div>';
    }
}

// ============================================
// ACİL NUMARALAR
// ============================================
const EMERGENCY_NUMBERS = [
    { number: '112', name: 'Acil Yardim', desc: 'Ambulans, itfaiye, polis' },
    { number: '110', name: 'Itfaiye', desc: 'Yangin ihbar ve kurtarma' },
    { number: '155', name: 'Polis Imdat', desc: 'Asayis ve guvenlik olaylari' },
    { number: '156', name: 'Jandarma Imdat', desc: 'Kirsal alan guvenlik' },
    { number: '122', name: 'AFAD', desc: 'Afet ve acil durum koordinasyonu' },
    { number: '104', name: 'Saglik Danisma', desc: 'Saglik danisma hatti' },
    { number: '182', name: 'Alo Valilik', desc: 'Valilik bilgi ve sikayet hatti' },
    { number: '183', name: 'Alo Sosyal Destek', desc: 'Aile ve sosyal hizmetler' },
    { number: '181', name: 'Kizilay', desc: 'Turk Kizilayi yardim hatti' },
];

function renderEmergencyNumbers() {
    const content = document.getElementById('emergencyListContent');
    let html = '';
    EMERGENCY_NUMBERS.forEach(item => {
        html += `
            <div class="emergency-item">
                <div class="emergency-number">${item.number}</div>
                <div class="emergency-info">
                    <div class="emergency-name">${item.name}</div>
                    <div class="emergency-desc">${item.desc}</div>
                </div>
            </div>`;
    });
    content.innerHTML = html;
}

// ============================================
// MODAL
// ============================================
function openModal(modal) { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

// ============================================
// HARİTA
// ============================================
function initMap() {
    map = L.map('map', {
        preferCanvas: true,
        maxZoom: 22,
        zoomControl: false
    }).setView(MAP_CENTER, MAP_ZOOM);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Maxar | Esri',
        maxZoom: 22,
        maxNativeZoom: 18,
        crossOrigin: ''
    }).addTo(map);

    map.on('click', onMapClick);
}

function onMapClick(e) {
    if (isAnalyzing) return;
    if (!markers.A) {
        setMarker('A', e.latlng.lat, e.latlng.lng);
        setStatus('A noktasi secildi. Simdi hedef (B) noktasini sec.', 'info');
    } else if (!markers.B) {
        setMarker('B', e.latlng.lat, e.latlng.lng);
        setStatus('A ve B hazir! "Analiz Baslat" ile yapay zekayi atesle.', 'info');
    }
}

function setMarker(point, lat, lng) {
    const color = point === 'A' ? '#3b82f6' : '#ef4444';
    const label = point === 'A' ? 'Baslangic (A)' : 'Hedef (B)';
    if (markers[point]) map.removeLayer(markers[point]);

    markers[point] = L.marker([lat, lng], {
        draggable: true,
        icon: createMarkerIcon(point, color)
    }).addTo(map);

    markers[point].bindPopup(`<b>${label}</b>`).openPopup();
    markers[point].on('dragend', function (e) {
        const pos = e.target.getLatLng();
        updateCoordInputs(point, pos.lat, pos.lng);
    });
    updateCoordInputs(point, lat, lng);
    map.panTo([lat, lng]);
}

function updateCoordInputs(point, lat, lng) {
    if (point === 'A') {
        coordALat.value = lat.toFixed(6);
        coordALon.value = lng.toFixed(6);
    } else {
        coordBLat.value = lat.toFixed(6);
        coordBLon.value = lng.toFixed(6);
    }
}

function applyCoordinate(point) {
    const latInput = point === 'A' ? coordALat : coordBLat;
    const lonInput = point === 'A' ? coordALon : coordBLon;
    const lat = parseFloat(latInput.value);
    const lon = parseFloat(lonInput.value);
    if (isNaN(lat) || isNaN(lon)) { setStatus('Gecersiz koordinat!', 'error'); return; }
    if (lat < -90 || lat > 90) { setStatus('Enlem -90 ile 90 arasinda olmalidir.', 'error'); return; }
    if (lon < -180 || lon > 180) { setStatus('Boylam -180 ile 180 arasinda olmalidir.', 'error'); return; }
    setMarker(point, lat, lon);
    const pointLabel = point === 'A' ? 'Baslangic (A)' : 'Hedef (B)';
    setStatus(`${pointLabel} noktasi ayarlandi: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, 'info');
    if (markers.A && markers.B) {
        setTimeout(() => setStatus('A ve B hazir! "Analiz Baslat" ile yapay zekayi atesle.', 'info'), 1500);
    }
}

function createMarkerIcon(label, color) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            background:${color};width:32px;height:32px;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            color:white;font-weight:700;font-size:14px;
            box-shadow:0 3px 12px ${color}88;border:2px solid white;
            font-family:Inter,sans-serif;">${label}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

// ============================================
// MESAFe HESABI (Haversine)
// ============================================
function haversineDistance(coords) {
    if (!coords || coords.length < 2) return 0;
    let total = 0;
    const R = 6371000;
    for (let i = 0; i < coords.length - 1; i++) {
        const [lat1, lon1] = coords[i];
        const [lat2, lon2] = coords[i + 1];
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return total;
}

function formatDist(meters) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatTime(meters) {
    // Araç hızı: 20 km/s (afet bölgesi yavaş seyir)
    const min = Math.round(meters / 20000 * 60);
    return min < 1 ? '<1 dk' : `~${min} dk`;
}

// ============================================
// ROTA ETİKETİ
// ============================================
function drawRouteLabel(routeCoords, type) {
    const totalMeters = haversineDistance(routeCoords);
    const distText = formatDist(totalMeters);
    const timeText = formatTime(totalMeters);
    const isAlt = type === 'alt';

    // Rotanın %40 noktasını al (alt ve main çakışmasın)
    const idx = isAlt
        ? Math.floor(routeCoords.length * 0.35)
        : Math.floor(routeCoords.length * 0.60);
    const point = routeCoords[Math.max(0, Math.min(idx, routeCoords.length - 1))];

    const html = isAlt
        ? `<div class="route-label-bubble route-label-bubble-alt">
               <span class="route-label-tag">ALT</span>
               <span class="route-label-dist route-label-dist-alt">${distText}</span>
               <span class="route-label-sep">·</span>
               <span class="route-label-time">${timeText}</span>
           </div>`
        : `<div class="route-label-bubble">
               <span class="route-label-dist">${distText}</span>
               <span class="route-label-sep">·</span>
               <span class="route-label-time">${timeText}</span>
           </div>`;

    // iconAnchor: etiket genişliği ~120px, yükseklik ~28px — ortala
    const icon = L.divIcon({
        className: '',
        html: html,
        iconSize: [140, 30],
        iconAnchor: [70, 15]
    });

    const lm = L.marker(point, { icon, interactive: false, zIndexOffset: 500 }).addTo(map);
    routeLabelLayers.push(lm);
}

// ============================================
// ANALİZ
// ============================================
async function otonomAnalizEt() {
    if (!markers.A || !markers.B) { setStatus('Once haritada A ve B noktalarini sec!', 'error'); return; }
    if (isAnalyzing) return;

    isAnalyzing = true;
    analizBtn.disabled = true;
    clearResults();
    showProgress(true);

    try {
        setStep('capture');
        setStatus('Harita goruntusu yakalaniyor...', 'loading');

        const bounds = map.getBounds();
        const nw = bounds.getNorthWest();
        const se = bounds.getSouthEast();

        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = await html2canvas(document.getElementById('map'), {
            useCORS: true, scale, logging: false, backgroundColor: null, removeContainer: true
        });

        setStep('ai');
        setStatus('Yapay zeka goruntuyu analiz ediyor...', 'loading');

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));

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

        setStep('route');
        setStatus('Guvenli rota hesaplaniyor...', 'loading');

        const response = await fetch(`${API_URL}/api/otonom-analiz`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Sunucu hatasi: ${response.status}`);

        const res = await response.json();

        if (res.durum === 'basarili') {
            setStep('done');
            drawResults(res);
            showStats(res);
            setStatus(`<b>${res.tespit_sayisi}</b> enkaz tespit edildi. Guvenli rota hazir!`, 'success');
        } else {
            setStatus(`${res.mesaj || 'Bilinmeyen hata'}`, 'error');
        }

    } catch (e) {
        console.error('Analiz hatasi:', e);
        setStatus(`Baglanti hatasi: Sunucu calisiyor mu? (${e.message})`, 'error');
    } finally {
        isAnalyzing = false;
        analizBtn.disabled = false;
    }
}

// ============================================
// SONUÇ ÇİZİMİ
// ============================================
function drawResults(res) {
    // 1. Tehlike bölgeleri ve enkaz noktaları
    if (res.enkazlar) {
        res.enkazlar.forEach(enkaz => {
            const coord = [enkaz.lat, enkaz.lon];
            const radius = enkaz.tehlike_yaricapi_m || 50;

            const dangerZone = L.circle(coord, {
                radius,
                color: '#ef4444',
                fillColor: '#ef4444',
                fillOpacity: 0.12,
                weight: 1,
                dashArray: '5,5'
            }).addTo(map);
            dangerZoneLayers.push(dangerZone);

            const confidencePercent = Math.round((enkaz.confidence || 0) * 100);
            const riskScore = enkaz.risk_score || 0.2;
            const riskPercent = Math.round(riskScore * 100);
            const riskLabel = riskScore >= 0.9 ? 'KRITIK' : riskScore >= 0.5 ? 'ORTA' : 'DUSUK';
            const markerColor = riskScore >= 0.9 ? '#dc2626' : riskScore >= 0.5 ? '#f97316' : '#22c55e';
            const markerFill = riskScore >= 0.9 ? '#f87171' : riskScore >= 0.5 ? '#fdba74' : '#86efac';

            const marker = L.circleMarker(coord, {
                radius: 7,
                color: markerColor,
                fillColor: markerFill,
                fillOpacity: 0.9,
                weight: 2
            }).addTo(map);

            marker.bindPopup(`
                <div style="font-family:Inter,sans-serif;font-size:13px;min-width:160px;">
                    <b style="font-size:14px;">🚨 Enkaz Tespiti</b><br><br>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr><td style="color:#94a3b8;padding:2px 0;">Sinif</td><td style="font-weight:600;">${enkaz.sinif || 'debris'}</td></tr>
                        <tr><td style="color:#94a3b8;padding:2px 0;">Guven</td><td style="font-weight:600;color:#34d399;">%${confidencePercent}</td></tr>
                        <tr><td style="color:#94a3b8;padding:2px 0;">Yaricap</td><td style="font-weight:600;">${radius}m</td></tr>
                        <tr><td style="color:#94a3b8;padding:2px 0;">Risk</td><td style="font-weight:700;color:${markerColor};">%${riskPercent} — ${riskLabel}</td></tr>
                    </table>
                </div>`
            );
            enkazLayers.push(marker);
        });
    }

    // 2. Alternatif rotayı ÖNCE çiz (altta kalır)
    if (res.alternatif_rota && res.alternatif_rota.length > 1) {
        altRouteLayer = L.polyline(res.alternatif_rota, {
            color: '#3b82f6',
            weight: 6,
            opacity: 0.85,
            dashArray: '10,8',
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        drawRouteLabel(res.alternatif_rota, 'alt');
    }

    // 3. Ana güvenli rotayı SONRA çiz (üstte görünür)
    if (res.guvenli_rota && res.guvenli_rota.length > 1) {
        // Glow efekti
        const glow = L.polyline(res.guvenli_rota, {
            color: '#f97316',
            weight: 18,
            opacity: 0.18,
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

        drawRouteLabel(res.guvenli_rota, 'main');
    }

    legendPanel.classList.add('visible');
}

// ============================================
// UI HELPERS
// ============================================
function setStatus(html, type) {
    statusBox.innerHTML = html;
    statusBox.className = 'status-box';
    if (type === 'loading') statusBox.classList.add('status-loading');
    if (type === 'success') statusBox.classList.add('status-success');
    if (type === 'error') statusBox.classList.add('status-error');
}

function showProgress(show) {
    progressSteps.classList.toggle('visible', show);
    [stepCapture, stepAI, stepRoute, stepDone].forEach(s => s.className = 'progress-step');
    resetStepIcons();
}

function resetStepIcons() {
    [stepCapture, stepAI, stepRoute, stepDone].forEach((s, i) => {
        s.querySelector('.step-icon').textContent = (i + 1).toString();
    });
}

function setStep(step) {
    const steps = ['capture', 'ai', 'route', 'done'];
    const elements = [stepCapture, stepAI, stepRoute, stepDone];
    const currentIdx = steps.indexOf(step);
    elements.forEach((el, i) => {
        if (i < currentIdx) { el.className = 'progress-step done'; el.querySelector('.step-icon').textContent = '✓'; }
        else if (i === currentIdx) el.className = 'progress-step active';
        else el.className = 'progress-step';
    });
}

function showStats(res) {
    statEnkaz.textContent = res.tespit_sayisi || 0;

    // Rota mesafesi ve süresi
    if (res.guvenli_rota && res.guvenli_rota.length > 1) {
        const dist = haversineDistance(res.guvenli_rota);
        statRota.textContent = `${formatDist(dist)} · ${formatTime(dist)}`;
    } else {
        statRota.textContent = '—';
    }

    statsGrid.classList.add('visible');
}

function clearResults() {
    if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
    if (altRouteLayer) { map.removeLayer(altRouteLayer); altRouteLayer = null; }
    enkazLayers.forEach(l => { try { map.removeLayer(l); } catch (e) { } });
    dangerZoneLayers.forEach(l => { try { map.removeLayer(l); } catch (e) { } });
    routeLabelLayers.forEach(l => { try { map.removeLayer(l); } catch (e) { } });
    enkazLayers = [];
    dangerZoneLayers = [];
    routeLabelLayers = [];
    statsGrid.classList.remove('visible');
    legendPanel.classList.remove('visible');
    showProgress(false);
}

function resetAll() {
    clearResults();
    if (markers.A) { map.removeLayer(markers.A); markers.A = null; }
    if (markers.B) { map.removeLayer(markers.B); markers.B = null; }
    coordALat.value = ''; coordALon.value = '';
    coordBLat.value = ''; coordBLon.value = '';
    if (droneCtx && droneCanvas) droneCtx.clearRect(0, 0, droneCanvas.width, droneCanvas.height);
    dronePoints = { A: null, B: null };
    droneImageObj = null;
    droneFileInput.value = '';
    droneAnalyzeBtn.disabled = true;
    droneInstruction.textContent = "1. Baslangic noktasini (A) secmek icin gorsele tiklayin.";
    setStatus('Sistem hazir. Haritada A ve B noktalarini sec veya koordinat gir.', 'info');
}

// ============================================
// DRONE MODU
// ============================================
function openDroneMode(file) {
    if (!file) { alert("Hata: Dosya alinamadi!"); return; }
    const reader = new FileReader();
    reader.onerror = () => alert("Dosya okuma hatasi!");
    reader.onload = function (e) {
        const img = new Image();
        img.onerror = () => alert("Resim yukleme hatasi!");
        img.onload = function () {
            droneImageObj = img;
            droneCanvas.width = img.width;
            droneCanvas.height = img.height;
            const container = document.getElementById('droneCanvasContainer');
            const containerH = container.clientHeight - 30;
            const containerW = container.clientWidth - 30;
            const imgAspect = img.width / img.height;
            const containerAspect = containerW / containerH;
            if (imgAspect > containerAspect) { droneCanvas.style.width = '100%'; droneCanvas.style.height = 'auto'; }
            else { droneCanvas.style.height = '100%'; droneCanvas.style.width = 'auto'; }
            droneCtx = droneCanvas.getContext('2d', { alpha: false });
            droneCtx.imageSmoothingEnabled = true;
            droneCtx.imageSmoothingQuality = 'high';
            droneCtx.drawImage(img, 0, 0);
            document.getElementById('droneWorkspaceEmpty').style.display = 'none';
            container.style.display = 'flex';
            dronePoints = { A: null, B: null };
            droneInstruction.textContent = "1. Baslangic noktasini (A) secmek icin gorsele tiklayin.";
            droneAnalyzeBtn.disabled = true;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function closeDroneMode() {
    droneModeOverlay.style.display = 'none';
    document.getElementById('droneWorkspaceEmpty').style.display = 'flex';
    document.getElementById('droneCanvasContainer').style.display = 'none';
    droneFileInput.value = '';
}

function pixelToGps(px, py) {
    const nwLat = parseFloat(document.getElementById('droneNWLat').value);
    const nwLon = parseFloat(document.getElementById('droneNWLon').value);
    const seLat = parseFloat(document.getElementById('droneSELat').value);
    const seLon = parseFloat(document.getElementById('droneSELon').value);
    if (isNaN(nwLat) || isNaN(nwLon) || isNaN(seLat) || isNaN(seLon)) return null;
    const lat = nwLat - (py / droneCanvas.height) * (nwLat - seLat);
    const lon = nwLon + (px / droneCanvas.width) * (seLon - nwLon);
    return { lat, lon };
}

function redrawDroneCanvas() {
    if (!droneImageObj) return;
    droneCtx.clearRect(0, 0, droneCanvas.width, droneCanvas.height);
    droneCtx.drawImage(droneImageObj, 0, 0);
    if (dronePoints.A) drawDroneMarker(dronePoints.A.x, dronePoints.A.y, 'A', '#3b82f6');
    if (dronePoints.B) drawDroneMarker(dronePoints.B.x, dronePoints.B.y, 'B', '#ef4444');
}

function drawDroneMarker(x, y, label, color) {
    droneCtx.beginPath();
    droneCtx.arc(x, y, 15, 0, 2 * Math.PI);
    droneCtx.fillStyle = color;
    droneCtx.fill();
    droneCtx.lineWidth = 3;
    droneCtx.strokeStyle = '#ffffff';
    droneCtx.stroke();
    droneCtx.fillStyle = '#ffffff';
    droneCtx.font = 'bold 16px Arial';
    droneCtx.textAlign = 'center';
    droneCtx.textBaseline = 'middle';
    droneCtx.fillText(label, x, y + 1);
}

droneCanvas.addEventListener('click', (e) => {
    if (isDroneAnalyzing) return;
    const rect = droneCanvas.getBoundingClientRect();
    const scaleX = droneCanvas.width / rect.width;
    const scaleY = droneCanvas.height / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    if (!dronePoints.A) {
        dronePoints.A = { x, y };
        droneInstruction.textContent = "2. Hedef noktasini (B) secin.";
    } else if (!dronePoints.B) {
        dronePoints.B = { x, y };
        droneInstruction.textContent = "3. Noktalar secildi. Analizi baslatabilirsiniz.";
        droneAnalyzeBtn.disabled = false;
    } else {
        dronePoints.A = { x, y };
        dronePoints.B = null;
        droneInstruction.textContent = "2. Hedef noktasini (B) secin.";
        droneAnalyzeBtn.disabled = true;
    }
    redrawDroneCanvas();
});

async function runDroneAnalysis() {
    if (!droneImageObj || !dronePoints.A || !dronePoints.B) return;
    const nwLat = parseFloat(document.getElementById('droneNWLat').value);
    const nwLon = parseFloat(document.getElementById('droneNWLon').value);
    const seLat = parseFloat(document.getElementById('droneSELat').value);
    const seLon = parseFloat(document.getElementById('droneSELon').value);
    if (isNaN(nwLat) || isNaN(nwLon) || isNaN(seLat) || isNaN(seLon)) {
        droneInstruction.textContent = "Hata: GPS koordinatlarini doldurun."; return;
    }
    const gpsA = pixelToGps(dronePoints.A.x, dronePoints.A.y);
    const gpsB = pixelToGps(dronePoints.B.x, dronePoints.B.y);
    if (!gpsA || !gpsB) { droneInstruction.textContent = "Hata: GPS donusumu yapilamadi."; return; }

    isDroneAnalyzing = true;
    droneAnalyzeBtn.disabled = true;
    droneCloseBtn.disabled = true;
    droneInstruction.textContent = "SAHI analizi + rota hesaplama...";

    try {
        droneCanvas.toBlob(async (blob) => {
            try {
                const formData = new FormData();
                formData.append('resim', blob, 'drone_image.jpg');
                formData.append('nw_lat', nwLat); formData.append('nw_lon', nwLon);
                formData.append('se_lat', seLat); formData.append('se_lon', seLon);
                formData.append('start_lat', gpsA.lat); formData.append('start_lon', gpsA.lon);
                formData.append('end_lat', gpsB.lat); formData.append('end_lon', gpsB.lon);

                const response = await fetch(`${API_URL}/api/drone-analiz`, { method: 'POST', body: formData });
                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
                const res = await response.json();

                if (res.durum === 'basarili') {
                    droneInstruction.textContent = `${res.tespit_sayisi} enkaz bulundu. Gercek sokak rotasi cizildi!`;
                    drawDroneResults(res.engeller, res.rota, res.rota_alt);
                } else {
                    droneInstruction.textContent = `Hata: ${res.mesaj}`;
                }
            } catch (innerErr) {
                droneInstruction.textContent = `Basarisiz: ${innerErr.message}`;
            } finally {
                isDroneAnalyzing = false;
                droneCloseBtn.disabled = false;
            }
        }, 'image/jpeg', 0.95);
    } catch (e) {
        droneInstruction.textContent = "Basarisiz: Sunucu baglanti hatasi.";
        isDroneAnalyzing = false;
        droneCloseBtn.disabled = false;
    }
}

function drawDroneResults(engeller, rota, rotaAlt) {
    redrawDroneCanvas();
    engeller.forEach(enc => {
        const halfW = enc.w / 2, halfH = enc.h / 2;
        const x = enc.x - halfW, y = enc.y - halfH;
        droneCtx.lineWidth = 3;
        droneCtx.strokeStyle = enc.risk_score >= 0.9 ? '#ef4444' : enc.risk_score >= 0.5 ? '#f97316' : '#22c55e';
        droneCtx.fillStyle = enc.risk_score >= 0.9 ? 'rgba(239,68,68,0.25)' : enc.risk_score >= 0.5 ? 'rgba(249,115,22,0.25)' : 'rgba(34,197,94,0.25)';
        droneCtx.beginPath(); droneCtx.rect(x, y, enc.w, enc.h); droneCtx.fill(); droneCtx.stroke();
        droneCtx.fillStyle = '#fff'; droneCtx.font = 'bold 12px Arial';
        droneCtx.fillText(`${enc.sinif} %${Math.round(enc.confidence * 100)}`, x + 4, y - 4);
    });

    if (rotaAlt && rotaAlt.length > 1) {
        droneCtx.beginPath();
        droneCtx.moveTo(rotaAlt[0][0], rotaAlt[0][1]);
        for (let i = 1; i < rotaAlt.length; i++) droneCtx.lineTo(rotaAlt[i][0], rotaAlt[i][1]);
        droneCtx.strokeStyle = '#3b82f6'; droneCtx.lineWidth = 5;
        droneCtx.setLineDash([12, 8]); droneCtx.lineCap = 'round'; droneCtx.lineJoin = 'round';
        droneCtx.stroke(); droneCtx.setLineDash([]);
    }

    if (rota && rota.length > 1) {
        droneCtx.beginPath();
        droneCtx.moveTo(rota[0][0], rota[0][1]);
        for (let i = 1; i < rota.length; i++) droneCtx.lineTo(rota[i][0], rota[i][1]);
        droneCtx.strokeStyle = 'rgba(249,115,22,0.3)'; droneCtx.lineWidth = 14;
        droneCtx.lineCap = 'round'; droneCtx.lineJoin = 'round'; droneCtx.stroke();

        droneCtx.beginPath();
        droneCtx.moveTo(rota[0][0], rota[0][1]);
        for (let i = 1; i < rota.length; i++) droneCtx.lineTo(rota[i][0], rota[i][1]);
        droneCtx.strokeStyle = '#f97316'; droneCtx.lineWidth = 5; droneCtx.stroke();
        droneCtx.strokeStyle = '#fef08a'; droneCtx.lineWidth = 1.5; droneCtx.stroke();
    }

    if (dronePoints.A) drawDroneMarker(dronePoints.A.x, dronePoints.A.y, 'A', '#3b82f6');
    if (dronePoints.B) drawDroneMarker(dronePoints.B.x, dronePoints.B.y, 'B', '#ef4444');
}

// ============================================
// BOOT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    analizBtn.addEventListener('click', otonomAnalizEt);
    resetBtn.addEventListener('click', resetAll);
    themeToggleBtn.addEventListener('click', toggleTheme);

    earthquakeBtn.addEventListener('click', () => { openModal(earthquakeModal); fetchEarthquakes(); });
    earthquakeModalClose.addEventListener('click', () => closeModal(earthquakeModal));
    earthquakeModal.addEventListener('click', (e) => { if (e.target === earthquakeModal) closeModal(earthquakeModal); });

    emergencyBtn.addEventListener('click', () => { openModal(emergencyModal); renderEmergencyNumbers(); });
    emergencyModalClose.addEventListener('click', () => closeModal(emergencyModal));
    emergencyModal.addEventListener('click', (e) => { if (e.target === emergencyModal) closeModal(emergencyModal); });

    const openDroneWorkspaceBtn = document.getElementById('openDroneWorkspaceBtn');
    if (openDroneWorkspaceBtn) {
        openDroneWorkspaceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            droneModeOverlay.style.display = 'flex';
            document.getElementById('droneWorkspaceEmpty').style.display = 'flex';
            document.getElementById('droneCanvasContainer').style.display = 'none';
            droneFileInput.value = '';
            if (map) {
                const bounds = map.getBounds();
                const nw = bounds.getNorthWest();
                const se = bounds.getSouthEast();
                document.getElementById('droneNWLat').value = nw.lat.toFixed(5);
                document.getElementById('droneNWLon').value = nw.lng.toFixed(5);
                document.getElementById('droneSELat').value = se.lat.toFixed(5);
                document.getElementById('droneSELon').value = se.lng.toFixed(5);
            }
        });
    }

    droneFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) openDroneMode(e.target.files[0]);
    });
    droneCloseBtn.addEventListener('click', closeDroneMode);
    droneAnalyzeBtn.addEventListener('click', runDroneAnalysis);
    applyABtn.addEventListener('click', () => applyCoordinate('A'));
    applyBBtn.addEventListener('click', () => applyCoordinate('B'));

    hidePanelBtn.addEventListener('click', () => { controlPanel.classList.add('hidden'); showPanelBtn.style.display = 'block'; });
    showPanelBtn.addEventListener('click', () => { controlPanel.classList.remove('hidden'); showPanelBtn.style.display = 'none'; });

    coordALat.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('A'); });
    coordALon.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('A'); });
    coordBLat.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('B'); });
    coordBLon.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('B'); });
});
