// Variabel global
let selected1 = null;
let selected2 = null;
let allHeroes = [];
let currentPhaseIndex = 0;
let correctionMode = false;
let currentDraftData = {}; // Menyimpan state lokal dari data server

// Urutan dropdown
const dropdownOrder = [
    { dropdown: 'dropdowns-11', phase: 0, display: ['ban-left-1'] },
    { dropdown: 'dropdowns-16', phase: 1, display: ['ban-right-1'] },
    { dropdown: 'dropdowns-12', phase: 2, display: ['ban-left-2'] },
    { dropdown: 'dropdowns-17', phase: 3, display: ['ban-right-2'] },
    { dropdown: 'dropdowns-1', phase: 4, display: ['pick-left-1'] },
    { dropdown: ['dropdowns-6', 'dropdowns-7'], phase: 5, display: ['pick-right-1', 'pick-right-2'] },
    { dropdown: ['dropdowns-2', 'dropdowns-3'], phase: 6, display: ['pick-left-2', 'pick-left-3'] },
    { dropdown: 'dropdowns-8', phase: 7, display: ['pick-right-3'] },
    { dropdown: 'dropdowns-18', phase: 9, display: ['ban-right-3'] },
    { dropdown: 'dropdowns-13', phase: 8, display: ['ban-left-3'] },
    { dropdown: 'dropdowns-9', phase: 10, display: ['pick-right-4'] },
    { dropdown: ['dropdowns-4', 'dropdowns-5'], phase: 11, display: ['pick-left-4', 'pick-left-5'] },
    { dropdown: 'dropdowns-10', phase: 12, display: ['pick-right-5'] },
    { dropdown: 'dropdowns-10', phase: 12, display: ['pick-right-5'] } // Phase dummy akhir
];

// --- FUNGSI SINKRONISASI KE MATCHDATA (UPDATE, SWAP, RESET) ---

function getMatchDataLocation(dropdownIndex) {
    if (dropdownIndex >= 1 && dropdownIndex <= 5) return { team: 'blueteam', idx: dropdownIndex - 1, field: 'hero' };
    if (dropdownIndex >= 6 && dropdownIndex <= 10) return { team: 'redteam', idx: dropdownIndex - 6, field: 'hero' };
    if (dropdownIndex >= 11 && dropdownIndex <= 15) return { team: 'blueteam', idx: dropdownIndex - 11, field: 'banhero' };
    if (dropdownIndex >= 16 && dropdownIndex <= 20) return { team: 'redteam', idx: dropdownIndex - 16, field: 'banhero' };
    return null;
}

async function updateMatchDataHero(dropdownIndex, heroValue) {
    try {
        const loc = getMatchDataLocation(dropdownIndex);
        if (!loc) return;

        const response = await fetch('/api/matchdata');
        const data = await response.json();

        if (data.teamdata && data.teamdata[loc.team] && data.teamdata[loc.team].playerlist[loc.idx]) {
            data.teamdata[loc.team].playerlist[loc.idx][loc.field] = heroValue;
        }

        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error("Error updating matchdata hero:", error);
    }
}

async function swapMatchDataHeroes(index1, index2) {
    try {
        const loc1 = getMatchDataLocation(index1);
        const loc2 = getMatchDataLocation(index2);
        
        if (!loc1 || !loc2) return;

        const response = await fetch('/api/matchdata');
        const data = await response.json();

        let val1 = "", val2 = "";
        
        if (data.teamdata[loc1.team].playerlist[loc1.idx]) {
            val1 = data.teamdata[loc1.team].playerlist[loc1.idx][loc1.field];
        }
        if (data.teamdata[loc2.team].playerlist[loc2.idx]) {
            val2 = data.teamdata[loc2.team].playerlist[loc2.idx][loc2.field];
        }

        if (data.teamdata[loc1.team].playerlist[loc1.idx]) {
            data.teamdata[loc1.team].playerlist[loc1.idx][loc1.field] = val2;
        }
        if (data.teamdata[loc2.team].playerlist[loc2.idx]) {
            data.teamdata[loc2.team].playerlist[loc2.idx][loc2.field] = val1;
        }

        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

    } catch (error) {
        console.error("Error swapping matchdata heroes:", error);
    }
}

// [BARU] Fungsi untuk mereset hero & ban di matchdatateam.json
async function resetMatchDataHeroes() {
    try {
        const response = await fetch('/api/matchdata');
        const data = await response.json();

        // Reset Blue Team
        if (data.teamdata.blueteam && data.teamdata.blueteam.playerlist) {
            data.teamdata.blueteam.playerlist.forEach(player => {
                player.hero = "";
                player.banhero = "";
            });
        }

        // Reset Red Team
        if (data.teamdata.redteam && data.teamdata.redteam.playerlist) {
            data.teamdata.redteam.playerlist.forEach(player => {
                player.hero = "";
                player.banhero = "";
            });
        }

        await fetch('/api/matchdata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        console.log("Match Data Heroes & Bans Reset Successfully");

    } catch (error) {
        console.error("Error resetting matchdata heroes:", error);
    }
}

// --- FUNGSI KOMUNIKASI SERVER (DRAFT) ---

async function fetchDraftData() {
    try {
        const response = await fetch('/api/matchdraft');
        const data = await response.json();
        currentDraftData = data.draftdata;
        applyServerDataToUI();
    } catch (error) {
        console.error("Gagal mengambil data draft:", error);
    }
}

async function saveDraftData() {
    try {
        await fetch('/api/matchdraft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftdata: currentDraftData })
        });
    } catch (error) {
        console.error("Gagal menyimpan data draft:", error);
    }
}

// --- HELPER MAPPING ---

function getJsonLocation(index) {
    if (index >= 1 && index <= 5) return { side: 'blueside', type: 'pick', idx: index - 1 };
    if (index >= 6 && index <= 10) return { side: 'redside', type: 'pick', idx: index - 6 };
    if (index >= 11 && index <= 15) return { side: 'blueside', type: 'ban', idx: index - 11 };
    if (index >= 16 && index <= 20) return { side: 'redside', type: 'ban', idx: index - 16 };
    return null;
}

function getHeroFromData(index) {
    const loc = getJsonLocation(index);
    if (!loc) return "";
    return currentDraftData[loc.side][loc.type][loc.idx].hero || "";
}

function setHeroToData(index, heroImg) {
    const loc = getJsonLocation(index);
    if (loc) {
        currentDraftData[loc.side][loc.type][loc.idx].hero = heroImg;
    }
}

// --- INITIALIZATION ---

async function loadHeroes() {
    try {
        const response = await fetch('/database/herolist.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error loading herolist.json:', error);
        return [];
    }
}

async function initializePage() {
    allHeroes = await loadHeroes();
    await fetchDraftData(); 

    // Setup Listeners
    for (let i = 1; i <= 20; i++) {
        const input = document.getElementById(`search-${i}`);
        const dropdown = document.getElementById(`dropdown-items-${i}`);
        if (input && dropdown) {
            input.addEventListener('input', () => filterDropdown(i));
            input.addEventListener('blur', () => hideDropdown(i));
        }
    }
    document.getElementById('correction').addEventListener('click', toggleCorrectionMode);
    
    // WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}`);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'draftdata_update') {
            fetchDraftData();
        }
    };
}

document.addEventListener('DOMContentLoaded', initializePage);

// --- LOGIC UI & STATE ---

function applyServerDataToUI() {
    currentPhaseIndex = parseInt(currentDraftData.current_phase) || 0;
    
    for (let i = 1; i <= 20; i++) {
        const heroImg = getHeroFromData(i);
        const input = document.getElementById(`search-${i}`);
        if (input) {
            input.value = getHeroName(heroImg);
        }
    }
    updateDropdownState();
}

function updateDropdownState() {
    for (let i = 1; i <= 20; i++) {
        const input = document.getElementById(`search-${i}`);
        if (input) input.disabled = !correctionMode;
    }

    if (!correctionMode && currentPhaseIndex < dropdownOrder.length) {
        const currentPhase = dropdownOrder[currentPhaseIndex];
        const dropdowns = Array.isArray(currentPhase.dropdown) ? currentPhase.dropdown : [currentPhase.dropdown];
        dropdowns.forEach(dropdownId => {
            const input = document.getElementById(`search-${dropdownId.split('-')[1]}`);
            if (input) input.disabled = false;
        });
    }
    
    const correctionButton = document.getElementById('correction');
    correctionButton.textContent = correctionMode ? 'Exit Correction' : 'Correction';
}

function toggleCorrectionMode() {
    correctionMode = !correctionMode;
    updateDropdownState();
}

function filterDropdown(index) {
    let input = document.getElementById(`search-${index}`);
    let dropdown = document.getElementById(`dropdown-items-${index}`);
    let searchText = input.value.toLowerCase();

    if (allHeroes.length === 0) return;
    dropdown.innerHTML = "";

    if (searchText.length > 0) {
        const filteredHeroes = allHeroes.filter(hero => hero.name.toLowerCase().includes(searchText));
        if (filteredHeroes.length > 0) {
            dropdown.style.display = "block";
            filteredHeroes.forEach(hero => {
                let option = document.createElement("div");
                option.textContent = hero.name;
                option.onclick = async function() {
                    setHeroToData(index, hero.img); // Simpan Image untuk Draft
                    input.value = hero.name;
                    dropdown.style.display = "none";
                    
                    await updateMatchDataHero(index, hero.name); // Simpan Nama untuk Match Data

                    if (!correctionMode && isCurrentPhaseDropdown(index)) {
                        checkPhaseCompletion(); 
                    } else {
                        await saveDraftData();
                    }
                };
                dropdown.appendChild(option);
            });
        } else {
            dropdown.style.display = "none";
        }
    } else {
        dropdown.style.display = "none";
    }
}

function isCurrentPhaseDropdown(index) {
    if (currentPhaseIndex >= dropdownOrder.length) return false;
    const currentPhase = dropdownOrder[currentPhaseIndex];
    const dropdowns = Array.isArray(currentPhase.dropdown) ? currentPhase.dropdown : [currentPhase.dropdown];
    return dropdowns.includes(`dropdowns-${index}`);
}

async function checkPhaseCompletion() {
    if (currentPhaseIndex >= dropdownOrder.length) {
        await saveDraftData();
        return;
    }

    const currentPhase = dropdownOrder[currentPhaseIndex];
    const dropdowns = Array.isArray(currentPhase.dropdown) ? currentPhase.dropdown : [currentPhase.dropdown];
    
    const allFilled = dropdowns.every(dropdownId => {
        const idx = parseInt(dropdownId.split('-')[1]);
        return getHeroFromData(idx) !== "";
    });

    if (allFilled) {
        handleControlAction("nextPhase"); 
    } else {
        await saveDraftData(); 
    }
}

function hideDropdown(index) {
    setTimeout(() => {
        const dropdown = document.getElementById(`dropdown-items-${index}`);
        if (dropdown && !dropdown.contains(document.activeElement)) {
            dropdown.style.display = 'none';
        }
    }, 200);
}

// --- SWAP LOGIC ---

async function swapHeroes() {
    if (selected1 !== null && selected2 !== null) {
        let hero1 = getHeroFromData(selected1);
        let hero2 = getHeroFromData(selected2);

        setHeroToData(selected1, hero2);
        setHeroToData(selected2, hero1);

        document.getElementById(`search-${selected1}`).value = getHeroName(hero2);
        document.getElementById(`search-${selected2}`).value = getHeroName(hero1);

        await swapMatchDataHeroes(selected1, selected2);

        resetSelection();
        await saveDraftData();
    }
}

function getHeroName(imgSrc) {
    if (!imgSrc) return "";
    let hero = allHeroes.find(h => h.img === imgSrc);
    return hero ? hero.name : "";
}

function selectDropdown(index) {
    let button = document.querySelector(`#dropdowns-${index} .swap-button`);
    if (selected1 === null) {
        selected1 = index;
        button.classList.add("selected");
    } else if (selected2 === null && selected1 !== index) {
        selected2 = index;
        button.classList.add("selected");
        swapHeroes();
    } else {
        resetSelection();
    }
}

function resetSelection() {
    if (selected1 !== null) {
        let btn = document.querySelector(`#dropdowns-${selected1} .swap-button`);
        if(btn) btn.classList.remove("selected");
    }
    if (selected2 !== null) {
        let btn = document.querySelector(`#dropdowns-${selected2} .swap-button`);
        if(btn) btn.classList.remove("selected");
    }
    selected1 = null;
    selected2 = null;
}

// --- CONTROLS ---

async function handleControlAction(action) {
    if (action === "start") {
        currentDraftData.timer_running = true;
    } else if (action === "stop") {
        currentDraftData.timer_running = false;
    } else if (action === "nextPhase") {
        if (currentPhaseIndex < dropdownOrder.length) {
            currentDraftData.current_phase = currentPhaseIndex + 1;
            currentDraftData.timer = "60"; 
            currentDraftData.timer_running = true;
        }
    } else if (action === "reset") {
        currentDraftData.current_phase = 0;
        currentDraftData.timer = "60";
        currentDraftData.timer_running = false;
        correctionMode = false;
        
        // Reset Draft Data (Gambar)
        const empty = [ { "hero": "" }, { "hero": "" }, { "hero": "" }, { "hero": "" }, { "hero": "" } ];
        currentDraftData.blueside.ban = JSON.parse(JSON.stringify(empty));
        currentDraftData.blueside.pick = JSON.parse(JSON.stringify(empty));
        currentDraftData.redside.ban = JSON.parse(JSON.stringify(empty));
        currentDraftData.redside.pick = JSON.parse(JSON.stringify(empty));
        
        // [BARU] Reset Match Data (Nama) di matchdatateam.json
        await resetMatchDataHeroes();
        
        resetSelection();
    }
    
    await saveDraftData();
}

document.getElementById('start').addEventListener('click', () => handleControlAction("start"));
document.getElementById('stop').addEventListener('click', () => handleControlAction("stop"));
document.getElementById('nextPhase').addEventListener('click', () => handleControlAction("nextPhase"));
document.getElementById('reset').addEventListener('click', () => handleControlAction("reset"));