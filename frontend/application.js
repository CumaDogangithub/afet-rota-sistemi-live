/**
 * Afet Rota Sistemi — Frontend Controller
 * ========================================
 * Harita etkilesimi, koordinat girisi, goruntu analiz, hava durumu,
 * deprem verileri, acil numara, enkaz bildirim ve sonuc gorsellestirme.
 */

// === CONFIG ===
const API_URL = window.location.origin;
const MAP_CENTER = [36.2023, 36.1613]; // Antakya
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
let debrisReportMode = false;
let debrisSelectionPending = false;
let debrisReportLatLng = null;
let reportedDebrisMarkers = [];

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

const weatherBtn = document.getElementById('weatherBtn');
const weatherPanel = document.getElementById('weatherPanel');
const weatherPanelClose = document.getElementById('weatherPanelClose');

const reportDebrisBtn = document.getElementById('reportDebrisBtn');
const debrisReportModal = document.getElementById('debrisReportModal');
const debrisReportClose = document.getElementById('debrisReportClose');
const debrisReportForm = document.getElementById('debrisReportForm');

// ============================================
// THEME MANAGEMENT
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
// WEATHER (Open-Meteo — ucretsiz, API key gereksiz)
// ============================================

const WEATHER_CODES = {
    0: { desc: 'Acik', icon: 'sunny' },
    1: { desc: 'Genellikle Acik', icon: 'partly_cloudy' },
    2: { desc: 'Parcali Bulutlu', icon: 'partly_cloudy' },
    3: { desc: 'Kapali', icon: 'cloudy' },
    45: { desc: 'Sisli', icon: 'fog' },
    48: { desc: 'Buzlu Sis', icon: 'fog' },
    51: { desc: 'Hafif Ciseleme', icon: 'drizzle' },
    53: { desc: 'Orta Ciseleme', icon: 'drizzle' },
    55: { desc: 'Yogun Ciseleme', icon: 'drizzle' },
    61: { desc: 'Hafif Yagmur', icon: 'rain' },
    63: { desc: 'Orta Yagmur', icon: 'rain' },
    65: { desc: 'Siddetli Yagmur', icon: 'rain' },
    71: { desc: 'Hafif Kar', icon: 'snow' },
    73: { desc: 'Orta Kar', icon: 'snow' },
    75: { desc: 'Yogun Kar', icon: 'snow' },
    77: { desc: 'Kar Taneleri', icon: 'snow' },
    80: { desc: 'Sagnak Yagmur', icon: 'rain' },
    81: { desc: 'Orta Sagnak', icon: 'rain' },
    82: { desc: 'Siddetli Sagnak', icon: 'rain' },
    85: { desc: 'Hafif Kar Yagisi', icon: 'snow' },
    86: { desc: 'Yogun Kar Yagisi', icon: 'snow' },
    95: { desc: 'Gok Gurultusu', icon: 'storm' },
    96: { desc: 'Dolulu Firtina', icon: 'storm' },
    99: { desc: 'Siddetli Dolu', icon: 'storm' }
};

function getWeatherAdvisory(code, temp, windSpeed, visibility) {
    const advisories = [];

    // Sis uyarisi
    if (code === 45 || code === 48 || (visibility && visibility < 1000)) {
        advisories.push('Sisli hava kosullari mevcut. Uydu ve drone goruntu analizlerinde dusuk goruntu kalitesi nedeniyle yanlis tespitler olabilir.');
    }

    // Yagmur/firtina uyarisi
    if (code >= 61 && code <= 67 || code >= 80 || code >= 95) {
        advisories.push('Yagisli hava arama-kurtarma operasyonlarini zorlastirabilir. Ekiplerin dikkatli hareket etmesi onerilir.');
    }

    // Kar uyarisi
    if (code >= 71 && code <= 77 || code === 85 || code === 86) {
        advisories.push('Kar yagisi yol kosullarini olumsuz etkiler. Rota hesaplamalarinda gecikme olabilir.');
    }

    // Ruzgar uyarisi
    if (windSpeed && windSpeed > 40) {
        advisories.push('Kuvvetli ruzgar mevcut. Drone ucuslari tehlikeli olabilir, dikkatli olun.');
    }

    // Sicaklik uyarisi
    if (temp !== undefined) {
        if (temp > 38) advisories.push('Asiri sicak! Arama kurtarma personeli icin sivi alimi kritik.');
        if (temp < 0) advisories.push('Dondurucu soguk. Enkaz altindaki kisiler hipotermiye maruz kalabilir, acil mudahale oncelikli.');
    }

    // Normal hava
    if (advisories.length === 0) {
        advisories.push('Hava kosullari operasyonlar icin uygun. Goruntu analizi ve rota hesaplamalari normal sekilde yapilabilir.');
    }

    return advisories.join(' ');
}

async function fetchWeather() {
    const content = document.getElementById('weatherContent');
    content.innerHTML = '<div class="eq-loading"><div class="spinner"></div>Hava durumu yukleniyor...</div>';

    try {
        const lat = MAP_CENTER[0];
        const lon = MAP_CENTER[1];
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,visibility&timezone=auto`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const current = data.current;

        const code = current.weather_code;
        const temp = current.temperature_2m;
        const humidity = current.relative_humidity_2m;
        const windSpeed = current.wind_speed_10m;
        const visibility = current.visibility;

        const weatherInfo = WEATHER_CODES[code] || { desc: 'Bilinmiyor', icon: 'unknown' };
        const advisory = getWeatherAdvisory(code, temp, windSpeed, visibility);

        // Sehir ismi (harita merkez koordinatina gore)
        const cityName = 'Antakya / Hatay';

        content.innerHTML = `
            <div class="weather-main">
                <div class="weather-temp">${Math.round(temp)}&deg;</div>
                <div>
                    <div class="weather-desc">${weatherInfo.desc}</div>
                    <div class="weather-city">${cityName}</div>
                </div>
            </div>
            <div class="weather-details">
                <div class="weather-detail-item">
                    <div class="weather-detail-label">Nem</div>
                    <div class="weather-detail-value">%${humidity}</div>
                </div>
                <div class="weather-detail-item">
                    <div class="weather-detail-label">Ruzgar</div>
                    <div class="weather-detail-value">${windSpeed} km/s</div>
                </div>
                <div class="weather-detail-item">
                    <div class="weather-detail-label">Gorus Mesafesi</div>
                    <div class="weather-detail-value">${visibility ? (visibility / 1000).toFixed(1) + ' km' : '-'}</div>
                </div>
                <div class="weather-detail-item">
                    <div class="weather-detail-label">Sicaklik</div>
                    <div class="weather-detail-value">${temp.toFixed(1)}&deg;C</div>
                </div>
            </div>
            <div class="weather-advisory">
                <div class="weather-advisory-title">Operasyon Tavsiyesi</div>
                <div class="weather-advisory-text">${advisory}</div>
            </div>
        `;
    } catch (error) {
        console.error('Hava durumu hatasi:', error);
        content.innerHTML = '<div class="eq-error">Hava durumu yuklenemedi.</div>';
    }
}

// ============================================
// EARTHQUAKE DATA (Kandilli Rasathanesi)
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
                        <div class="eq-details">
                            <span>Derinlik: ${depth} km</span>
                        </div>
                    </div>
                    <div class="eq-time">${timeStr}</div>
                </div>
            `;
        });

        html += '</div>';
        content.innerHTML = html;

    } catch (error) {
        console.error('Deprem verisi alinirken hata:', error);
        content.innerHTML = '<div class="eq-error">Deprem verileri yuklenemedi. Lutfen daha sonra tekrar deneyin.</div>';
    }
}

// ============================================
// EMERGENCY NUMBERS (Guncellenmis liste)
// ============================================

const EMERGENCY_NUMBERS = [
    { number: '112', name: 'Acil Cagri Merkezi', desc: 'Ambulans, itfaiye, polis — birlesik acil cagri hatti' },
    { number: '122', name: 'AFAD', desc: 'Afet ve Acil Durum Yonetimi Baskanligi' },
    { number: '181', name: 'Kizilay', desc: 'Turk Kizilayi yardim ve bagis hatti' },
    { number: '155', name: 'Polis Imdat', desc: 'Emniyet Genel Mudurlugu ihbar hatti' },
    { number: '156', name: 'Jandarma', desc: 'Jandarma Genel Komutanligi ihbar hatti' },
    { number: '182', name: 'Alo Valilik', desc: 'Valilik bilgi ve koordinasyon hatti' },
    { number: '153', name: 'Belediye', desc: 'Belediye zabita ve hizmet ihbar hatti' },
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
            </div>
        `;
    });

    content.innerHTML = html;
}

// ============================================
// DEBRIS REPORT (Firebase Firestore)
// ============================================

function startDebrisReportMode() {
    debrisReportMode = true;
    debrisSelectionPending = false;
    
    // Eger onceden kalmis gecici marker varsa silmiyoruz, kullanici silene kadar kalir
    // ama form acildiginda mevcut olan koordinat null kalmamasi lazim.
    if (!window._tempDebrisMarker) {
        debrisReportLatLng = null;
        document.getElementById('debrisReportCoords').style.display = 'none';
        document.getElementById('debrisReportInstruction').textContent = 'Lutfen formu doldurun ve haritadan konumunuzu secin.';
    }

    document.getElementById('debrisFormMessage').textContent = '';
    document.getElementById('debrisFormMessage').className = 'debris-form-message';
    debrisReportForm.reset();

    // Modali HEMEN ac (Kullanici "Haritadan Konum Sec" butonuna basicak)
    openModal(debrisReportModal);

    setStatus('Enkaz bildirim formu acildi.', 'info');
}

function cancelDebrisReportMode() {
    debrisReportMode = false;
    debrisSelectionPending = false;
    // Kullanici X ile bilerek kapatirsa gecici isareti temizle (opsiyonel)
    closeModal(debrisReportModal);
    setStatus('Sistem hazir. Haritada A ve B noktalarini sec.', 'info');
}

// "Haritadan Konum Sec" Butonu Tiklaninca
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('selectDebrisMapBtn');
    if(btn) {
        btn.addEventListener('click', () => {
            debrisSelectionPending = true;
            closeModal(debrisReportModal); // Haritayi gorebilmesi icin modali gecici gizle
            setStatus('Haritada bir enkaz noktasi secmek icin tiklayin.', 'loading');
        });
    }

    // "Otomatik Konum Sec (Merkez)" Butonu Tiklaninca
    const autoBtn = document.getElementById('autoDebrisMapBtn');
    if(autoBtn) {
        autoBtn.addEventListener('click', () => {
            const center = map.getCenter();
            debrisReportLatLng = { lat: center.lat, lng: center.lng };
            
            // Koordinatlari goster
            document.getElementById('debrisReportCoords').style.display = 'block';
            document.getElementById('debrisReportLatLng').textContent = `Enlem: ${center.lat.toFixed(6)}, Boylam: ${center.lng.toFixed(6)}`;
            
            // Gecici marker ekle
            if (window._tempDebrisMarker) { map.removeLayer(window._tempDebrisMarker); }
            const iconHTML = `
                <div class="debris-select-marker-inner" style="background:#ef4444; border-color:white; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                    !
                    <div class="debris-select-marker-close" onclick="window.removeTempDebrisMarker(event)">×</div>
                </div>`;
            window._tempDebrisMarker = L.marker([center.lat, center.lng], {
                icon: L.divIcon({
                    className: 'debris-select-marker',
                    html: iconHTML,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                })
            }).addTo(map);
            
            showDebrisMessage('Konum harita merkezi olarak ayarlandi.', 'success');
        });
    }

    // "Gercek GPS (Simulasyon)" Butonu Tiklaninca
    const gpsBtn = document.getElementById('autoGpsMapBtn');
    if(gpsBtn) {
        gpsBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                Swal.fire('Hata', 'Tarayiciniz GPS ozelligini desteklemiyor.', 'error');
                return;
            }

            gpsBtn.textContent = "⏳ Konum Bulunuyor...";
            gpsBtn.disabled = true;

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    gpsBtn.textContent = "📡 Gercek GPS (Simulasyon)";
                    gpsBtn.disabled = false;

                    const realLat = position.coords.latitude;
                    const realLng = position.coords.longitude;

                    // Antakya Afet Bolgesi Bounding Box (Yaklasik)
                    // Lat: 36.1 - 36.4, Lng: 36.0 - 36.3
                    const isInsideDisasterZone = (realLat >= 36.1 && realLat <= 36.4 && realLng >= 36.0 && realLng <= 36.3);

                    let targetLat, targetLng;

                    if (!isInsideDisasterZone) {
                        // Afet bolgesi disinda - Simulasyon Modu
                        const center = map.getCenter();
                        targetLat = center.lat;
                        targetLng = center.lng;

                        // Modali gecici kapat, Swal'i goster
                        closeModal(debrisReportModal);

                        Swal.fire({
                            title: 'Simulasyon Modu Aktif',
                            html: `<b>Gerçek konumunuz tespit edildi:</b><br><span style="font-size:13px; color:#64748b;">(Enlem: ${realLat.toFixed(4)}, Boylam: ${realLng.toFixed(4)})</span><br><br>Sistem şu an <b>Antakya Afet Bölgesine</b> kilitli olduğu için hücresel konumunuz simülasyon amacıyla afet bölgesi merkezine yansıtılıyor.`,
                            icon: 'info',
                            confirmButtonText: 'Anladim',
                            confirmButtonColor: '#3b82f6'
                        }).then(() => {
                            // Swal kapatilinca modali tekrar ac
                            openModal(debrisReportModal);
                        });
                    } else {
                        // Afet bolgesi icinde -> gercek konumu kullan
                        targetLat = realLat;
                        targetLng = realLng;
                        showDebrisMessage('Gercek konumunuz afet bolgesi icinde basariyla alindi.', 'success');
                    }

                    debrisReportLatLng = { lat: targetLat, lng: targetLng };
                    
                    document.getElementById('debrisReportCoords').style.display = 'block';
                    document.getElementById('debrisReportLatLng').textContent = `Enlem: ${targetLat.toFixed(6)}, Boylam: ${targetLng.toFixed(6)}`;
                    
                    if (window._tempDebrisMarker) { map.removeLayer(window._tempDebrisMarker); }
                    const iconHTML = `
                        <div class="debris-select-marker-inner" style="background:#ef4444; border-color:white; box-shadow:0 4px 10px rgba(0,0,0,0.5);">
                            !
                            <div class="debris-select-marker-close" onclick="window.removeTempDebrisMarker(event)">×</div>
                        </div>`;
                    window._tempDebrisMarker = L.marker([targetLat, targetLng], {
                        icon: L.divIcon({
                            className: 'debris-select-marker',
                            html: iconHTML,
                            iconSize: [40, 40],
                            iconAnchor: [20, 20]
                        })
                    }).addTo(map);
                    
                    map.flyTo([targetLat, targetLng], 17);
                },
                (error) => {
                    gpsBtn.textContent = "📡 Gercek GPS (Simulasyon)";
                    gpsBtn.disabled = false;
                    
                    let msg = "Bilinmeyen bir hata olustu.";
                    if (error.code === 1) msg = "Konum erisimi reddedildi.";
                    else if (error.code === 2) msg = "Konum bulunamadi.";
                    else if (error.code === 3) msg = "Zaman asimi.";
                    
                    Swal.fire('Konum Hatasi', msg, 'error');
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    }
});

// Ozel marker'daki "X" kapatma butonuna basilinca
window.removeTempDebrisMarker = function(event) {
    if (event) event.stopPropagation();
    if (window._tempDebrisMarker) {
        map.removeLayer(window._tempDebrisMarker);
        window._tempDebrisMarker = null;
    }
    debrisReportLatLng = null;
    document.getElementById('debrisReportCoords').style.display = 'none';
    document.getElementById('debrisReportLatLng').textContent = '';
};

async function submitDebrisReport(e) {
    e.preventDefault();

    if (!debrisReportLatLng) {
        showDebrisMessage('Once haritada bir nokta secin!', 'error');
        return;
    }

    const msgEl = document.getElementById('debrisFormMessage');
    const submitBtn = document.getElementById('debrisSubmitBtn');

    // Form verilerini topla
    const reportData = {
        lat: debrisReportLatLng.lat,
        lng: debrisReportLatLng.lng,
        isim: document.getElementById('debrisName').value.trim() || null,
        yikilma_orani: document.getElementById('debrisCollapseRate').value || null,
        kisi_sayisi: document.getElementById('debrisPersonCount').value ? parseInt(document.getElementById('debrisPersonCount').value) : null,
        saglik_durumu: document.getElementById('debrisHealthStatus').value || null,
        iletisim: document.getElementById('debrisPhone').value.trim() || null,
        aciklama: document.getElementById('debrisNote').value.trim() || null,
        tarih: new Date().toISOString(),
        durum: 'aktif'
    };

    submitBtn.disabled = true;
    showDebrisMessage('Gonderiliyor...', '');

    // Yerel kaydetme yardimci fonksiyonu
    const saveDebrisLocalFallback = (data) => {
        const saved = JSON.parse(localStorage.getItem('enkaz_bildirimleri') || '[]');
        data.id = 'local_' + Date.now();
        saved.push(data);
        localStorage.setItem('enkaz_bildirimleri', JSON.stringify(saved));
    };

    try {
        // Firebase REST API kullanarak gonderim yapalim. (Web SDK'deki "askida kalma" sorununu tamamen asar).
        if (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) {
            const projectId = firebaseConfig.projectId;
            const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/enkaz_bildirimleri`;

            // Veriyi Firestore REST algomasina gore paketle
            const firestoreData = {
                fields: {
                    lat: { doubleValue: reportData.lat },
                    lng: { doubleValue: reportData.lng },
                    tarih: { stringValue: reportData.tarih },
                    durum: { stringValue: reportData.durum }
                }
            };

            // Opsiyonel alanlari ekle
            if (reportData.isim) firestoreData.fields.isim = { stringValue: reportData.isim };
            if (reportData.yikilma_orani) firestoreData.fields.yikilma_orani = { stringValue: reportData.yikilma_orani };
            if (reportData.kisi_sayisi) firestoreData.fields.kisi_sayisi = { integerValue: reportData.kisi_sayisi.toString() };
            if (reportData.saglik_durumu) firestoreData.fields.saglik_durumu = { stringValue: reportData.saglik_durumu };
            if (reportData.iletisim) firestoreData.fields.iletisim = { stringValue: reportData.iletisim };
            if (reportData.aciklama) firestoreData.fields.aciklama = { stringValue: reportData.aciklama };

            // 5 saniye icinde cevap gelmezse (Asiri yavas aglar) iptal etmek icin abort controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);

            try {
                const response = await fetch(restUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(firestoreData),
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errObj = await response.json();
                    throw new Error(errObj.error ? errObj.error.message : `HTTP ${response.status}`);
                }

                const result = await response.json();
                if(result && result.name) {
                    // Extract ID from full document name path
                    reportData.id = result.name.split('/').pop();
                }

                showDebrisMessage('Enkaz bildirimi basariyla kaydedildi!', 'success');
            } catch (err) {
                console.warn('REST API Firestore Hatasi: ', err.message);
                saveDebrisLocalFallback(reportData);
                
                if (err.name === 'AbortError') {
                    showDebrisMessage('Baglanti yavasti, bildiri yerel belleke alindi.', 'success');
                } else if (err.message.includes('Permission denied')) {
                    showDebrisMessage('Yetki yok (Veritabani Gizli). Yerel belleke alindi.', 'success');
                } else {
                    showDebrisMessage('Sunucu eksikligi: ' + err.message + '. (Yerel depo kullanildi)', 'success');
                }
            }
        } else {
            // Config yoksa direk yerel
            saveDebrisLocalFallback(reportData);
            showDebrisMessage('Bildiri yerel olarak kaydedildi. (Firebase kapali)', 'success');
        }

        // Gecici marker'i kaldir
        if (window._tempDebrisMarker) {
            map.removeLayer(window._tempDebrisMarker);
            window._tempDebrisMarker = null;
        }

        // Haritaya kalici marker ekle
        addDebrisMarkerToMap(reportData);

        // Modu kapat
        setTimeout(() => {
            debrisReportMode = false;
            debrisSelectionPending = false;
            closeModal(debrisReportModal);
            setStatus('Enkaz bildirimi eklendi.', 'success');
        }, 1500);

    } catch (error) {
        // Bu sadece en distaki odengunemeyen hatalar icin
        console.error('Enkaz bildirimi islenemedi:', error);
        showDebrisMessage('Kritik sistem hatasi.', 'error');
    } finally {
        submitBtn.disabled = false;
    }
}

function showDebrisMessage(msg, type) {
    const el = document.getElementById('debrisFormMessage');
    el.textContent = msg;
    el.className = 'debris-form-message' + (type ? ' ' + type : '');
}

function addDebrisMarkerToMap(data) {
    const collapseLabels = {
        'hafif': 'Hafif Hasar',
        'orta': 'Orta Hasar',
        'agir': 'Agir Hasar',
        'tamamen': 'Tamamen Yikik'
    };
    const healthLabels = {
        'iyi': 'Iyi',
        'hafif_yarali': 'Hafif Yarali',
        'agir_yarali': 'Agir Yarali',
        'bilinmiyor': 'Bilinmiyor'
    };

    const collapseColor = {
        'hafif': '#22c55e',
        'orta': '#f59e0b',
        'agir': '#ef4444',
        'tamamen': '#991b1b'
    };

    const color = collapseColor[data.yikilma_orani] || '#ef4444';
    
    // Rastgele ID atamasini saglama
    if (!data.id) data.id = 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(7);

    const customIcon = L.divIcon({
        className: 'debris-select-marker',
        html: `
            <div class="debris-select-marker-inner" style="background: ${color}; border-color: white; box-shadow: 0 4px 10px rgba(0,0,0,0.5); animation: none;">
                !
                <div class="debris-select-marker-close" onclick="window.removePermanentDebris('${data.id}', event)">×</div>
            </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    const marker = L.marker([data.lat, data.lng], {
        icon: customIcon,
        debrisId: data.id,
        yikilma_orani: data.yikilma_orani // Eklenen alan (rota motoru icin)
    }).addTo(map);

    // Popup icerigi
    let popupHtml = '<div style="font-family:Inter,sans-serif;font-size:13px;min-width:180px;">';
    popupHtml += '<b style="font-size:14px;">Enkaz Bildirimi</b><br>';
    if (data.isim) popupHtml += `<b>Bildiren:</b> ${data.isim}<br>`;
    if (data.yikilma_orani) popupHtml += `<b>Yikilma:</b> ${collapseLabels[data.yikilma_orani] || data.yikilma_orani}<br>`;
    if (data.kisi_sayisi) popupHtml += `<b>Kisi Sayisi:</b> ${data.kisi_sayisi}<br>`;
    if (data.saglik_durumu) popupHtml += `<b>Saglik:</b> ${healthLabels[data.saglik_durumu] || data.saglik_durumu}<br>`;
    if (data.iletisim) popupHtml += `<b>Iletisim:</b> ${data.iletisim}<br>`;
    if (data.aciklama) popupHtml += `<b>Not:</b> ${data.aciklama}<br>`;
    if (data.tarih) {
        const d = new Date(data.tarih);
        popupHtml += `<span style="color:#94a3b8;font-size:11px;">${d.toLocaleString('tr-TR')}</span><br>`;
    }
    popupHtml += `<hr style="margin:5px 0; border:0; border-top:1px solid #334155;">`;
    popupHtml += `<span style="color:#94a3b8;font-size:11px;">Koor: ${data.lat.toFixed(6)}, ${data.lng.toFixed(6)}</span>`;
    popupHtml += '</div>';

    marker.bindPopup(popupHtml);
    reportedDebrisMarkers.push(marker);
}

// Firebase'den veya localStorage'dan mevcut bildirimleri yukle
async function loadExistingDebrisReports() {
    try {
        if (db) {
            const snapshot = await db.collection('enkaz_bildirimleri').where('durum', '==', 'aktif').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                data.id = doc.id;
                addDebrisMarkerToMap(data);
            });
            if (snapshot.size > 0) {
                console.log(`${snapshot.size} enkaz bildirimi Firebase'den yuklendi.`);
            }
        } else {
            // localStorage fallback
            const saved = JSON.parse(localStorage.getItem('enkaz_bildirimleri') || '[]');
            saved.forEach(data => addDebrisMarkerToMap(data));
            if (saved.length > 0) {
                console.log(`${saved.length} enkaz bildirimi localStorage'dan yuklendi.`);
            }
        }
    } catch (error) {
        console.error('Enkaz bildirimleri yuklenirken hata:', error);
    }
}

// ============================================
// MARKET SİLME
// ============================================

window.removePermanentDebris = async function(id, event) {
    if(event) event.stopPropagation();
    if(confirm('Arama-kurtarma islemi tamamlandiysa veya bu ihbar hataliysa haritadan kaldirmak istediginize emin misiniz?')) {
        // Haritadan kaldir
        const idx = reportedDebrisMarkers.findIndex(m => m.options.debrisId === id);
        if(idx !== -1) {
            map.removeLayer(reportedDebrisMarkers[idx]);
            reportedDebrisMarkers.splice(idx, 1);
        }
        
        // Veritabanindan sil (Local vs Firebase)
        if (id.startsWith('local_') || id.startsWith('temp_')) {
            let saved = JSON.parse(localStorage.getItem('enkaz_bildirimleri') || '[]');
            saved = saved.filter(item => item.id !== id);
            localStorage.setItem('enkaz_bildirimleri', JSON.stringify(saved));
            setStatus('Bildirim yerel veritabanindan kaldirildi.', 'success');
        } else {
            // Firebase REST ile sil
            if (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) {
                const restUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/enkaz_bildirimleri/${id}`;
                try {
                    await fetch(restUrl, { method: 'DELETE' });
                    setStatus('Bildirim basariyla bulut veritabanindan kaldirildi.', 'success');
                } catch(e) {
                    console.error('Firebase silme hatasi:', e);
                }
            }
        }
    }
}

// ============================================
// MODAL MANAGEMENT
// ============================================

function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

// ============================================
// MAP INIT
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
    // Eger kullanici haritadan enkaz secmek icin bekliyorsa
    if (debrisReportMode && debrisSelectionPending) {
        debrisSelectionPending = false;
        debrisReportLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };

        // Oncekini temizle
        if (window._tempDebrisMarker) { map.removeLayer(window._tempDebrisMarker); }

        // Ozel custom divIcon marker
        const iconHTML = `
            <div class="debris-select-marker-inner">
                !
                <div class="debris-select-marker-close" onclick="window.removeTempDebrisMarker(event)">×</div>
            </div>`;
            
        const customIcon = L.divIcon({
            className: 'debris-select-marker',
            html: iconHTML,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        window._tempDebrisMarker = L.marker([e.latlng.lat, e.latlng.lng], { icon: customIcon }).addTo(map);

        // Modali geri ac ve bilgiyi guncelle
        document.getElementById('debrisReportCoords').style.display = 'block';
        document.getElementById('debrisReportLatLng').textContent = `Enlem: ${e.latlng.lat.toFixed(6)}, Boylam: ${e.latlng.lng.toFixed(6)}`;
        document.getElementById('debrisReportInstruction').textContent = 'Konum secildi. Lutfen formu doldurun.';
        
        openModal(debrisReportModal);
        setStatus('Konum secildi. Formu doldurmaya devam edin.', 'success');
        return;
    }

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

    if (markers[point]) {
        map.removeLayer(markers[point]);
    }

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

    if (isNaN(lat) || isNaN(lon)) {
        setStatus('Gecersiz koordinat! Enlem ve boylam sayisal deger olmalidir.', 'error');
        return;
    }

    if (lat < -90 || lat > 90) {
        setStatus('Enlem -90 ile 90 arasinda olmalidir.', 'error');
        return;
    }

    if (lon < -180 || lon > 180) {
        setStatus('Boylam -180 ile 180 arasinda olmalidir.', 'error');
        return;
    }

    setMarker(point, lat, lon);

    const pointLabel = point === 'A' ? 'Baslangic (A)' : 'Hedef (B)';
    setStatus(`${pointLabel} noktasi ayarlandi: ${lat.toFixed(6)}, ${lon.toFixed(6)}`, 'info');

    if (markers.A && markers.B) {
        setTimeout(() => {
            setStatus('A ve B hazir! "Analiz Baslat" ile yapay zekayi atesle.', 'info');
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

// ============================================
// MESAFE HESABI (Haversine)
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

// === ANALIZ ===
async function otonomAnalizEt() {
    if (!markers.A || !markers.B) {
        setStatus('Once haritada A ve B noktalarini sec!', 'error');
        return;
    }
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
            useCORS: true,
            scale: scale,
            logging: false,
            backgroundColor: null,
            removeContainer: true
        });

        setStep('ai');
        setStatus('Yapay zeka goruntuyu analiz ediyor...', 'loading');

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

        // Kullanicinin manuel ekledigi enkazlari da rotaya gonder
        const activeManualDebris = reportedDebrisMarkers.map(m => {
            return {
                lat: m.getLatLng().lat,
                lon: m.getLatLng().lng,
                radius: m.options.yikilma_orani === 'hafif' ? 15 : (m.options.yikilma_orani === 'orta' ? 25 : 40)
            };
        });
        formData.append('manuel_enkazlar', JSON.stringify(activeManualDebris));

        setStep('route');
        setStatus('Guvenli rota hesaplaniyor...', 'loading');

        const response = await fetch(`${API_URL}/api/otonom-analiz`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Sunucu hatasi: ${response.status}`);
        }

        const res = await response.json();

        if (res.durum === 'basarili') {
            setStep('done');
            drawResults(res);
            showStats(res);
            setStatus(
                `<b>${res.tespit_sayisi}</b> enkaz tespit edildi. Guvenli rota hazir!`,
                'success'
            );
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

// === SONUC CIZIMI ===
function drawResults(res) {
    if (res.enkazlar) {
        res.enkazlar.forEach(enkaz => {
            const coord = [enkaz.lat, enkaz.lon];
            const radius = enkaz.tehlike_yaricapi_m || 50;

            const dangerZone = L.circle(coord, {
                radius: radius,
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

            if (enkaz.sinif !== 'manual_report') {
                const marker = L.circleMarker(coord, {
                    radius: 7,
                    color: markerColor,
                    fillColor: markerFill,
                    fillOpacity: 0.9,
                    weight: 2
                }).addTo(map);
                marker.bindPopup(
                    `<div style="font-family:Inter,sans-serif;font-size:13px;">
                        <b>Enkaz Tespiti</b><br>
                        Sinif: ${enkaz.sinif || 'debris'}<br>
                        Guven: %${confidencePercent}<br>
                        Tehlike Yaricapi: ${radius}m<br>
                        Risk: %${riskPercent} (${riskLabel})
                    </div>`
                );
                enkazLayers.push(marker);
            }
        });
    }

    if (res.alternatif_rota && res.alternatif_rota.length > 1) {
        altRouteLayer = L.polyline(res.alternatif_rota, {
            color: '#3b82f6',
            weight: 7,
            opacity: 0.6,
            dashArray: '8,8',
            lineCap: 'round'
        }).addTo(map);
        
        drawRouteLabel(res.alternatif_rota, 'alt');
    }

    if (res.guvenli_rota && res.guvenli_rota.length > 1) {
        const glow = L.polyline(res.guvenli_rota, {
            color: '#f97316',
            weight: 16,
            opacity: 0.2,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
        enkazLayers.push(glow);

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
    [stepCapture, stepAI, stepRoute, stepDone].forEach(s => {
        s.className = 'progress-step';
    });
    resetStepIcons();
}

function resetStepIcons() {
    const steps = [stepCapture, stepAI, stepRoute, stepDone];
    steps.forEach((s, i) => {
        s.querySelector('.step-icon').textContent = (i + 1).toString();
    });
}

function setStep(step) {
    const steps = ['capture', 'ai', 'route', 'done'];
    const elements = [stepCapture, stepAI, stepRoute, stepDone];
    const currentIdx = steps.indexOf(step);

    elements.forEach((el, i) => {
        if (i < currentIdx) {
            el.className = 'progress-step done';
            el.querySelector('.step-icon').textContent = '\u2713';
        } else if (i === currentIdx) {
            el.className = 'progress-step active';
        } else {
            el.className = 'progress-step';
        }
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
    enkazLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    dangerZoneLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    routeLabelLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
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

    coordALat.value = '';
    coordALon.value = '';
    coordBLat.value = '';
    coordBLon.value = '';

    if (droneCtx && droneCanvas) {
        droneCtx.clearRect(0, 0, droneCanvas.width, droneCanvas.height);
    }
    dronePoints = { A: null, B: null };
    droneImageObj = null;
    droneFileInput.value = '';
    droneAnalyzeBtn.disabled = true;
    droneInstruction.textContent = "1. Baslangic noktasini (A) secmek icin gorsele tiklayin.";

    setStatus('Sistem hazir. Haritada A ve B noktalarini sec veya koordinat gir.', 'info');
}

// === DRONE MODU LOGIC ===

function openDroneMode(file) {
    if (!file) {
        alert("Hata: Dosya alinamadi!");
        return;
    }

    const reader = new FileReader();
    reader.onerror = function() { alert("Dosya okuma hatasi!"); };
    reader.onload = function(e) {
        const img = new Image();
        img.onerror = function() { alert("Resim yukleme hatasi!"); };
        img.onload = function() {
            droneImageObj = img;

            droneCanvas.width = img.width;
            droneCanvas.height = img.height;

            const container = document.getElementById('droneCanvasContainer');
            const containerH = container.clientHeight - 30;
            const containerW = container.clientWidth - 30;

            const imgAspect = img.width / img.height;
            const containerAspect = containerW / containerH;

            if (imgAspect > containerAspect) {
                droneCanvas.style.width = '100%';
                droneCanvas.style.height = 'auto';
            } else {
                droneCanvas.style.height = '100%';
                droneCanvas.style.width = 'auto';
            }

            droneCtx = droneCanvas.getContext('2d', { alpha: false });
            droneCtx.imageSmoothingEnabled = true;
            droneCtx.imageSmoothingQuality = 'high';

            droneCtx.drawImage(img, 0, 0);

            document.getElementById('droneWorkspaceEmpty').style.display = 'none';
            container.style.display = 'flex';
            dronePoints = { A: null, B: null };
            droneInstruction.textContent = "1. Baslangic noktasini (A) secmek icin gorsele tiklayin.";
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
        droneInstruction.textContent = "Hata: GPS koordinatlarini doldurun (NW ve SE koseler).";
        return;
    }

    const gpsA = pixelToGps(dronePoints.A.x, dronePoints.A.y);
    const gpsB = pixelToGps(dronePoints.B.x, dronePoints.B.y);

    if (!gpsA || !gpsB) {
        droneInstruction.textContent = "Hata: GPS donusumu yapilamadi.";
        return;
    }

    isDroneAnalyzing = true;
    droneAnalyzeBtn.disabled = true;
    droneCloseBtn.disabled = true;
    droneInstruction.textContent = "SAHI analizi + rota hesaplama... (Gercek sokak agi kullaniliyor)";

    try {
        droneCanvas.toBlob(async (blob) => {
            try {
                const formData = new FormData();
                formData.append('resim', blob, 'drone_image.jpg');
                formData.append('nw_lat', nwLat);
                formData.append('nw_lon', nwLon);
                formData.append('se_lat', seLat);
                formData.append('se_lon', seLon);
                formData.append('start_lat', gpsA.lat);
                formData.append('start_lon', gpsA.lon);
                formData.append('end_lat', gpsB.lat);
                formData.append('end_lon', gpsB.lon);

                // Kullanicinin manuel ekledigi enkazlari da drone rotasina gonder
                const activeManualDebris = reportedDebrisMarkers.map(m => {
                    return {
                        lat: m.getLatLng().lat,
                        lon: m.getLatLng().lng,
                        radius: m.options.yikilma_orani === 'hafif' ? 15 : (m.options.yikilma_orani === 'orta' ? 25 : 40)
                    };
                });
                formData.append('manuel_enkazlar', JSON.stringify(activeManualDebris));

                const response = await fetch(`${API_URL}/api/drone-analiz`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

                const res = await response.json();

                if (res.durum === 'basarili') {
                    droneInstruction.textContent = `${res.tespit_sayisi} enkaz bulundu. Gercek sokak rotasi cizildi!`;
                    drawDroneResults(res.engeller, res.rota, res.rota_alt);
                } else {
                    droneInstruction.textContent = `Hata: ${res.mesaj}`;
                }
            } catch (innerErr) {
                console.error("Drone analiz hatasi (ic):", innerErr);
                droneInstruction.textContent = `Basarisiz: ${innerErr.message}`;
            } finally {
                isDroneAnalyzing = false;
                droneCloseBtn.disabled = false;
            }
        }, 'image/jpeg', 0.95);

    } catch (e) {
        console.error("Drone analiz hatasi:", e);
        droneInstruction.textContent = "Basarisiz: Sunucu baglanti hatasi.";
        isDroneAnalyzing = false;
        droneCloseBtn.disabled = false;
    }
}

function drawDroneResults(engeller, rota, rotaAlt) {
    redrawDroneCanvas();

    engeller.forEach(enc => {
        const halfW = enc.w / 2;
        const halfH = enc.h / 2;
        const x = enc.x - halfW;
        const y = enc.y - halfH;

        droneCtx.lineWidth = 3;
        droneCtx.strokeStyle = enc.risk_score >= 0.9 ? '#ef4444' :
                              enc.risk_score >= 0.5 ? '#f97316' : '#22c55e';

        droneCtx.fillStyle = enc.risk_score >= 0.9 ? 'rgba(239, 68, 68, 0.25)' :
                            enc.risk_score >= 0.5 ? 'rgba(249, 115, 22, 0.25)' : 'rgba(34, 197, 94, 0.25)';

        droneCtx.beginPath();
        droneCtx.rect(x, y, enc.w, enc.h);
        droneCtx.fill();
        droneCtx.stroke();

        droneCtx.fillStyle = '#fff';
        droneCtx.font = 'bold 12px Arial';
        droneCtx.fillText(`${enc.sinif} %${Math.round(enc.confidence * 100)}`, x + 4, y - 4);
    });

    if (rotaAlt && rotaAlt.length > 1) {
        droneCtx.beginPath();
        droneCtx.moveTo(rotaAlt[0][0], rotaAlt[0][1]);
        for (let i = 1; i < rotaAlt.length; i++) {
            droneCtx.lineTo(rotaAlt[i][0], rotaAlt[i][1]);
        }
        droneCtx.strokeStyle = '#3b82f6';
        droneCtx.lineWidth = 5;
        droneCtx.setLineDash([12, 8]);
        droneCtx.lineCap = 'round';
        droneCtx.lineJoin = 'round';
        droneCtx.stroke();
        droneCtx.setLineDash([]);
    }

    if (rota && rota.length > 1) {
        droneCtx.beginPath();
        droneCtx.moveTo(rota[0][0], rota[0][1]);
        for (let i = 1; i < rota.length; i++) {
            droneCtx.lineTo(rota[i][0], rota[i][1]);
        }
        droneCtx.strokeStyle = 'rgba(249, 115, 22, 0.3)';
        droneCtx.lineWidth = 14;
        droneCtx.lineCap = 'round';
        droneCtx.lineJoin = 'round';
        droneCtx.stroke();

        droneCtx.beginPath();
        droneCtx.moveTo(rota[0][0], rota[0][1]);
        for (let i = 1; i < rota.length; i++) {
            droneCtx.lineTo(rota[i][0], rota[i][1]);
        }
        droneCtx.strokeStyle = '#f97316';
        droneCtx.lineWidth = 5;
        droneCtx.stroke();

        droneCtx.strokeStyle = '#fef08a';
        droneCtx.lineWidth = 1.5;
        droneCtx.stroke();
    }

    if (dronePoints.A) drawDroneMarker(dronePoints.A.x, dronePoints.A.y, 'A', '#3b82f6');
    if (dronePoints.B) drawDroneMarker(dronePoints.B.x, dronePoints.B.y, 'B', '#ef4444');
}

// === BOOT ===
document.addEventListener('DOMContentLoaded', () => {
    initMap();

    // Firebase baslatma
    const firebaseReady = initFirebase();

    // Mevcut enkaz bildirimlerini yukle
    loadExistingDebrisReports();

    // Ana analiz ve sifirlama butonlari
    analizBtn.addEventListener('click', otonomAnalizEt);
    resetBtn.addEventListener('click', resetAll);

    // Theme toggle
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Hava Durumu
    weatherBtn.addEventListener('click', () => {
        const isActive = weatherPanel.classList.contains('active');
        if (isActive) {
            weatherPanel.classList.remove('active');
        } else {
            weatherPanel.classList.add('active');
            fetchWeather();
        }
    });
    weatherPanelClose.addEventListener('click', () => {
        weatherPanel.classList.remove('active');
    });

    // Deprem modal
    earthquakeBtn.addEventListener('click', () => {
        openModal(earthquakeModal);
        fetchEarthquakes();
    });
    earthquakeModalClose.addEventListener('click', () => closeModal(earthquakeModal));
    earthquakeModal.addEventListener('click', (e) => {
        if (e.target === earthquakeModal) closeModal(earthquakeModal);
    });

    // Acil durum modal
    emergencyBtn.addEventListener('click', () => {
        openModal(emergencyModal);
        renderEmergencyNumbers();
    });
    emergencyModalClose.addEventListener('click', () => closeModal(emergencyModal));
    emergencyModal.addEventListener('click', (e) => {
        if (e.target === emergencyModal) closeModal(emergencyModal);
    });

    // Enkaz Bildir
    reportDebrisBtn.addEventListener('click', startDebrisReportMode);
    debrisReportClose.addEventListener('click', cancelDebrisReportMode);
    debrisReportModal.addEventListener('click', (e) => {
        if (e.target === debrisReportModal) cancelDebrisReportMode();
    });
    debrisReportForm.addEventListener('submit', submitDebrisReport);

    // Drone Modu Eventleri
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
        if (e.target.files && e.target.files.length > 0) {
            openDroneMode(e.target.files[0]);
        }
    });

    droneCloseBtn.addEventListener('click', closeDroneMode);
    droneAnalyzeBtn.addEventListener('click', runDroneAnalysis);

    // Koordinat uygulama butonlari
    applyABtn.addEventListener('click', () => applyCoordinate('A'));
    applyBBtn.addEventListener('click', () => applyCoordinate('B'));

    // Panel Kucult / Buyut
    hidePanelBtn.addEventListener('click', () => {
        controlPanel.classList.add('hidden');
        showPanelBtn.style.display = 'block';
    });

    showPanelBtn.addEventListener('click', () => {
        controlPanel.classList.remove('hidden');
        showPanelBtn.style.display = 'none';
    });

    // Enter tusu ile koordinat uygulama
    coordALat.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('A'); });
    coordALon.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('A'); });
    coordBLat.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('B'); });
    coordBLon.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCoordinate('B'); });

    // Sayfa acildiginda da bekleyen offline veri varsa senkronize et
    syncOfflineDebrisReports();

    // Tarayici internete baglandiginda otomatik tetikle
    window.addEventListener('online', () => {
        console.log('🌐 İnternet bağlantısı algılandı! Offline veriler senkronize ediliyor...');
        syncOfflineDebrisReports();
    });
});

// ============================================
// OFFLINE → ONLINE OTOMATİK SENKRONİZASYON
// ============================================
async function syncOfflineDebrisReports() {
    // Firebase config yoksa senkronizasyon yapilamaz
    if (typeof firebaseConfig === 'undefined' || !firebaseConfig.projectId) return;

    const saved = JSON.parse(localStorage.getItem('enkaz_bildirimleri') || '[]');
    const offlineReports = saved.filter(item => item.id && item.id.startsWith('local_'));

    if (offlineReports.length === 0) return; // Bekleyen offline veri yok

    console.log(`📤 ${offlineReports.length} adet offline enkaz bildirimi buluta yükleniyor...`);
    let syncCount = 0;

    for (const report of offlineReports) {
        try {
            const restUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/enkaz_bildirimleri`;

            const firestoreData = {
                fields: {
                    lat: { doubleValue: report.lat },
                    lng: { doubleValue: report.lng },
                    tarih: { stringValue: report.tarih || new Date().toISOString() },
                    durum: { stringValue: report.durum || 'aktif' }
                }
            };

            // Opsiyonel alanlari ekle
            if (report.isim) firestoreData.fields.isim = { stringValue: report.isim };
            if (report.yikilma_orani) firestoreData.fields.yikilma_orani = { stringValue: report.yikilma_orani };
            if (report.kisi_sayisi) firestoreData.fields.kisi_sayisi = { integerValue: report.kisi_sayisi.toString() };
            if (report.saglik_durumu) firestoreData.fields.saglik_durumu = { stringValue: report.saglik_durumu };
            if (report.iletisim) firestoreData.fields.iletisim = { stringValue: report.iletisim };
            if (report.aciklama) firestoreData.fields.aciklama = { stringValue: report.aciklama };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);

            const response = await fetch(restUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(firestoreData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                // Basarili: localStorage'dan bu kaydi sil
                const updatedSaved = JSON.parse(localStorage.getItem('enkaz_bildirimleri') || '[]');
                const filtered = updatedSaved.filter(item => item.id !== report.id);
                localStorage.setItem('enkaz_bildirimleri', JSON.stringify(filtered));
                syncCount++;
            }
        } catch (err) {
            // Basarisiz — dokunma, sonraki "online" eventinde tekrar denenir
            console.warn(`⚠️ Offline rapor senkronize edilemedi (${report.id}):`, err.message);
        }
    }

    if (syncCount > 0) {
        console.log(`✅ ${syncCount} offline bildiri başarıyla buluta yüklendi.`);
        setStatus(`${syncCount} bekleyen enkaz bildirimi buluta senkronize edildi!`, 'success');
    }
}
