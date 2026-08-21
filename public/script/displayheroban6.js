let allHeroes = [];
let lastPlayed = {};
let localTimerValue = 0;
let timerCountdownInterval = null;
let currentDraftData = null;

// Tambahan variabel untuk animasi bar agar tidak bentrok
let timerAnimationTimeout = null;

// --- 1. LOAD HERO DATA (Untuk Audio) ---
async function loadHeroes() {
    try {
        const response = await fetch('/database/herolist.json');
        allHeroes = await response.json();
    } catch (e) { console.error("Error loading herolist", e); }
}

function getVoiceByImg(imgSrc) {
    if (!imgSrc || !allHeroes.length) return null;
    const hero = allHeroes.find(h => h.img === imgSrc);
    return hero ? hero.voice : null;
}

// --- 2. WEBSOCKET & DATA FETCHING ---

async function fetchDraftData() {
    try {
        const response = await fetch('/api/matchdraft');
        const data = await response.json();
        const newDraftData = data.draftdata;
        
        // Update Tampilan dan Logika Game
        updateDisplay(newDraftData);
        updateGameLogic(newDraftData);
        
        currentDraftData = newDraftData;
    } catch (error) {
        console.error("Error fetch draft data:", error);
    }
}

// Koneksi WebSocket ke Server
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${protocol}://${window.location.host}`);

ws.onopen = () => {
    console.log('Connected to Display WebSocket');
    loadHeroes().then(() => fetchDraftData());
};

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'draftdata_update') {
        fetchDraftData();
    }
};

// --- 3. DISPLAY UPDATE LOGIC ---

function playVoice(voiceSrc, index) {
    if (!voiceSrc) return;
    
    let audio = document.getElementById("hero-voice");
    let phaseIdx = currentDraftData ? parseInt(currentDraftData.current_phase) : 0;
    
    if (phaseIdx >= phases.length - 1) {
        audio.volume = 0;
    } else {
        audio.volume = 1;
    }
    
    audio.pause();
    audio.currentTime = 0;
    audio.src = voiceSrc;
    audio.play().catch(error => console.error('Audio play error:', error));
}

function updateDisplay(newData) {
    const map = [];
    
    // Mapping Data Pick/Ban ke Index Slot (1-20)
    if(newData.blueside.pick) newData.blueside.pick.forEach((p, i) => map[1+i] = p.hero);
    if(newData.redside.pick) newData.redside.pick.forEach((p, i) => map[6+i] = p.hero);
    if(newData.blueside.ban) newData.blueside.ban.forEach((p, i) => map[11+i] = p.hero);
    if(newData.redside.ban) newData.redside.ban.forEach((p, i) => map[16+i] = p.hero);

    for (let i = 1; i <= 20; i++) {
        let imgSrc = map[i];
        let imgElement = document.getElementById(`image-display-${i}`);
        let boxElement = document.getElementById(`image-box-${i}`);
        
        if (imgSrc) {
            // Cek apakah gambar berubah
            if (imgElement.src !== window.location.origin + imgSrc && !imgElement.src.endsWith(imgSrc)) {
                 imgElement.src = imgSrc;
                 
                 const voiceSrc = getVoiceByImg(imgSrc);
                 if (voiceSrc && lastPlayed[i] !== imgSrc) {
                     playVoice(voiceSrc, i);
                     lastPlayed[i] = imgSrc;
                 }
            }

            // Tampilkan gambar hero (Animasi diatur CSS .image-box.show img)
            imgElement.style.opacity = "1";
            boxElement.classList.add("show");
        } else {
            // Kosongkan slot
            imgElement.src = "";
            imgElement.style.opacity = "0";
            boxElement.classList.remove("show");
            lastPlayed[i] = null;
        }
    }
}

// --- 4. TIMER & PHASE UI LOGIC ---

const phaseElement = document.getElementById('phase');
const arrowElement = document.getElementById('arrow');
const timerElement = document.getElementById('timer');
const timerBar = document.getElementById('timer-bar');

const phases = [
    { type: "", direction: "/Assets/Other/LeftBanning.gif" },
    { type: "", direction: "/Assets/Other/RightBanning.gif" },
    { type: "", direction: "/Assets/Other/LeftBanning.gif" },
    { type: "", direction: "/Assets/Other/RightBanning.gif" },
    { type: "", direction: "/Assets/Other/LeftPicking.gif" },
    { type: "", direction: "/Assets/Other/RightPicking.gif" },
    { type: "", direction: "/Assets/Other/LeftPicking.gif" },
    { type: "", direction: "/Assets/Other/RightPicking.gif" },
    { type: "", direction: "/Assets/Other/RightBanning.gif" },
    { type: "", direction: "/Assets/Other/LeftBanning.gif" },
    { type: "", direction: "/Assets/Other/RightPicking.gif" },
    { type: "", direction: "/Assets/Other/LeftPicking.gif" },
    { type: "", direction: "/Assets/Other/RightPicking.gif" },
    { type: "", direction: "/Assets/Other/Adjustment.gif" }
];

const phasesActiveBoxes = [
    ["ban-left-1"],
    ["ban-right-1"],
    ["ban-left-2"],
    ["ban-right-2"],
    ["pick-left-1"],
    ["pick-right-1", "pick-right-2"],
    ["pick-left-2", "pick-left-3"],
    ["pick-right-3"],
    ["ban-right-3"],
    ["ban-left-3"],
    ["pick-right-4"],
    ["pick-left-4", "pick-left-5"],
    ["pick-right-5"],
    []
];

function updateGameLogic(data) {
    let currentPhaseIndex = parseInt(data.current_phase) || 0;
    let serverTimer = parseInt(data.timer) || 60;
    let isRunning = data.timer_running;

    // A. Update Timer Lokal & Animasi Bar
    if (!currentDraftData || currentDraftData.timer !== data.timer || currentDraftData.timer_running !== isRunning || currentDraftData.current_phase !== data.current_phase) {
        startLocalCountdown(serverTimer, isRunning);
        
        if (isRunning) {
            animateTimerBar(serverTimer); 
        } else {
            // Jika timer stop, reset bar ke penuh dengan smooth
            if(timerAnimationTimeout) clearTimeout(timerAnimationTimeout);
            timerBar.style.transition = 'width 0.5s ease';
            timerBar.style.width = '100%';
        }
    }

    // B. Update Info Phase
    if (currentPhaseIndex < phases.length) {
        const currentPhase = phases[currentPhaseIndex];
        phaseElement.textContent = currentPhase.type;
        arrowElement.src = currentPhase.direction;
    } else {
        phaseElement.textContent = "All Phases Completed";
        arrowElement.src = "";
    }

    // C. Update Border Box (Active State)
    document.querySelectorAll(".box").forEach(box => {
        // Hapus class active, CSS transition akan menangani fade out
        box.classList.remove("active-ban", "active-pick");
    });

    if (currentPhaseIndex < phasesActiveBoxes.length) {
        phasesActiveBoxes[currentPhaseIndex].forEach(boxId => {
            const phaseBox = document.getElementById(boxId);
            if (phaseBox) {
                const isBanPhase = (currentPhaseIndex < 4) || (currentPhaseIndex >= 8 && currentPhaseIndex <= 9);
                // Tambahkan class active, CSS transition akan menangani fade in
                phaseBox.classList.add(isBanPhase ? "active-ban" : "active-pick");
            }
        });
    }
}

function startLocalCountdown(startTime, isRunning) {
    clearInterval(timerCountdownInterval);
    localTimerValue = startTime;
    timerElement.textContent = String(localTimerValue).padStart(2, '0');

    if (isRunning) {
        timerCountdownInterval = setInterval(() => {
            if (localTimerValue > 0) {
                localTimerValue--;
                timerElement.textContent = String(localTimerValue).padStart(2, '0');
            } else {
                clearInterval(timerCountdownInterval);
            }
        }, 1000);
    }
}

// --- FUNGSI BARU: Animasi Timer dengan Efek Refill ---
function animateTimerBar(duration) {
    // 1. Bersihkan timeout lama agar animasi tidak tabrakan
    if (timerAnimationTimeout) clearTimeout(timerAnimationTimeout);

    // 2. Animasi Refill (Isi Ulang) - Durasi 0.5 detik
    // Kita set width ke 100% dulu dengan transisi halus
    timerBar.style.transition = "width 0.5s cubic-bezier(0.25, 1, 0.5, 1)";
    timerBar.style.width = "100%";
    
    // 3. Animasi Drain (Berkurang) - Dimulai setelah Refill selesai
    timerAnimationTimeout = setTimeout(() => {
        // Force Reflow untuk memastikan CSS update
        void timerBar.offsetWidth; 

        // Hitung durasi drain. Kurangi 0.5s karena sudah terpakai untuk refill (opsional, tergantung preferensi visual)
        // Disini kita biarkan linear sesuai sisa waktu agar akurat secara visual
        timerBar.style.transition = `width ${duration}s linear`;
        
        // Targetkan ke 0%
        timerBar.style.width = "0%";
    }, 500); // Tunggu 500ms (sesuai durasi transisi refill)
}