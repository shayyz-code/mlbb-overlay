// Inisialisasi WebSocket khusus untuk Hero Display
const wsHero = new WebSocket('ws://localhost:3000');
let lastPlayed = {}; // Untuk melacak suara agar tidak spam

// --- FUNGSI UTAMA: MENGAMBIL DATA DARI SERVER ---
function initHeroFetch() {
    fetch('/api/matchdraft')
        .then(response => response.json())
        .then(data => {
            if (data.draftdata) {
                updateDisplay(data.draftdata);
            }
        })
        .catch(error => console.error('Error fetching hero data:', error));
}

// --- LOGIKA WEBSOCKET ---
wsHero.onopen = () => {
    console.log('Hero Display: Connected to WebSocket');
};

wsHero.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    // Jika server memberitahu ada update pada draft/hero
    if (msg.type === 'draftdata_update') {
        // Kita ambil data terbaru
        initHeroFetch();
    }
};

// --- LOGIKA UPDATE TAMPILAN (MAPPING) ---
function updateDisplay(newData) {
    // 1. Mapping dari Struktur JSON Server ke Index ID HTML (1-20)
    const map = [];
    
    // Pastikan data ada sebelum loop
    if(newData.blueside && newData.blueside.pick) newData.blueside.pick.forEach((p, i) => map[1+i] = p.hero); // 1-5
    if(newData.redside && newData.redside.pick) newData.redside.pick.forEach((p, i) => map[6+i] = p.hero);   // 6-10
    if(newData.blueside && newData.blueside.ban) newData.blueside.ban.forEach((p, i) => map[11+i] = p.hero); // 11-15
    if(newData.redside && newData.redside.ban) newData.redside.ban.forEach((p, i) => map[16+i] = p.hero);   // 16-20

    // 2. Loop Update Tampilan
    for (let i = 1; i <= 20; i++) {
        let imgSrc = map[i];
        let imgElement = document.getElementById(`image-display-${i}`);
        let boxElement = document.getElementById(`image-box-${i}`);
        
        // Cek keberadaan elemen (PENTING: agar tidak error di halaman yang cuma punya slot 1-10)
        if (imgElement && boxElement) {
            if (imgSrc) {
                // Cek apakah gambar berubah (agar tidak refresh/flicker jika gambar sama)
                if (imgElement.src !== window.location.origin + imgSrc && !imgElement.src.endsWith(imgSrc)) {
                     imgElement.src = imgSrc;

                     // --- INTEGRASI SUARA (OPSIONAL) ---
                     // Cek apakah fungsi getVoiceByImg ada (dari script lain)
                     if (typeof getVoiceByImg === 'function' && typeof playVoice === 'function') {
                         const voiceSrc = getVoiceByImg(imgSrc);
                         if (voiceSrc && lastPlayed[i] !== imgSrc) {
                             playVoice(voiceSrc, i);
                             lastPlayed[i] = imgSrc;
                         }
                     }
                }

                imgElement.style.opacity = "1";
                boxElement.classList.add("show");
            } else {
                // Reset jika data kosong
                imgElement.src = "";
                imgElement.style.opacity = "0";
                boxElement.classList.remove("show");
                lastPlayed[i] = null;
            }
        }
    }
}

// --- JALANKAN SAAT SCRIPT DIMUAT ---
initHeroFetch();