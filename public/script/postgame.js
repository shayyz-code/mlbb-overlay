// Variabel global untuk menyimpan status data terakhir (Dirty Check)
let lastDataState = "";

// Fungsi untuk mendapatkan path gambar
function getImagePath(name, type) {
    if (!name || name === "idle" || name === "") return "";
    
    if (type === 'item') {
        return `Assets/Itemandspell/${name}.png`;
    } else if (type === 'spell') {
        return `Assets/Itemandspell/${name}.png`;
    } else if (type === 'hero') {
        return `Assets/HeroPick/${name}.png`;
    }
    return "";
}

// Fungsi helper untuk menangani Logo (Termasuk Fallback jika error)
function setTeamLogo(imgElementId, logoPath) {
    const imgElement = document.getElementById(imgElementId);
    const fallbackLogo = "Assets/Other/nologo.png";

    if (!imgElement) return;

    if (!logoPath || logoPath === "") {
        imgElement.src = fallbackLogo;
        return;
    }

    imgElement.src = logoPath;

    imgElement.onerror = function() {
        this.onerror = null;
        this.src = fallbackLogo;
    };
}

// Fungsi Baru: Format Gold (XX.XXk jika > 9999)
function formatGold(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return "0";

    // Jika lebih dari 9999, bagi 1000 dan ambil 2 desimal + "k"
    if (num > 9999) {
        return (num / 1000).toFixed(2) + "k";
    }
    
    // Jika di bawah 9999, tampilkan angka asli
    return num;
}

// Fungsi utama untuk render data
function renderMatchData(data) {
    if (!data || !data.teamdata) return;

    const blueteam = data.teamdata.blueteam;
    const redteam = data.teamdata.redteam;

    // 1. Update Game Info Global
    document.getElementById("gametime").innerText = data.game_duration || "00:00";
    
    // UPDATE: Menambahkan text "GAME" sebelum angka
    document.getElementById("gamenumber").innerText = "GAME " + (data.game_number || "1");

    // 2. Update Nama Tim & Logo
    document.getElementById("name-box-1").innerText = blueteam.teamname || "Team Blue";
    document.getElementById("name-box-8").innerText = redteam.teamname || "Team Red";
    
    setTeamLogo("displayImage1", blueteam.logo);
    setTeamLogo("displayImage2", redteam.logo);

    // 3. Logic Win / Lose
    updateWinLose(data.winmatches);

    // 4. Render Statistik Tim (Gold dengan Format Baru)
    renderTeamStats(blueteam, "stats1"); 
    renderTeamStats(redteam, "stats2");  

    // 5. Render Daftar Pemain (Dengan Logic Urutan Baru)
    renderPlayerList(blueteam.playerlist, "team1");
    renderPlayerList(redteam.playerlist, "team2");

    // 6. Render Gambar Hero Besar
    renderHeroCards(blueteam.playerlist, 1, 3);
    renderHeroCards(redteam.playerlist, 6, 10);

    // 7. Render Ban Hero
    renderBans(blueteam.playerlist, 11);
    renderBans(redteam.playerlist, 16);
}

// Fungsi Logic Win/Lose
function updateWinLose(winStatus) {
    const blueBox = document.getElementById("blue");
    const redBox = document.getElementById("red");
    
    let blueText = "NONE";
    let redText = "NONE";

    if (winStatus === "blue") {
        blueText = "WIN";
        redText = "LOSE";
    } else if (winStatus === "red") {
        blueText = "LOSE";
        redText = "WIN";
    }

    if (blueBox.innerText !== blueText) blueBox.innerHTML = `<div class="winlose">${blueText}</div>`;
    if (redBox.innerText !== redText) redBox.innerHTML = `<div class="winlose">${redText}</div>`;
}

// Fungsi Render Statistik Tengah (TLT + Gold)
function renderTeamStats(teamData, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    // UPDATE: Menggunakan formatGold untuk index ke-0 (Total Gold)
    const statsValues = [
        formatGold(teamData.totalgold || 0), // Gold diformat
        teamData.turtle || 0,
        teamData.lord || 0,
        teamData.turret || 0
    ];

    statsValues.forEach(val => {
        const div = document.createElement("div");
        div.className = "tltinfo";
        div.innerHTML = `<div class="tltinfobox">${val}</div>`;
        container.appendChild(div);
    });
}

// Fungsi Render List Pemain (MODIFIKASI: Urutan berbeda untuk Team 2)
function renderPlayerList(players, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    players.forEach(player => {
        const items = player.itemlist || ["idle", "idle", "idle", "idle", "idle", "idle"];
        const topItems = items.slice(0, 3);
        const botItems = items.slice(3, 6);

        // --- Bagian HTML dipisah ke variabel ---

        // 1. Level
        const levelHTML = `<div class="lvl">${player.level || "1"}</div>`;

        // 2. KDA & Gold
        const kdaGoldHTML = `
            <div class="kdagold">
                <div class="kda">${player.KDA || "0/0/0"}</div>
                <div class="kdatxt">KDA</div>
                <div class="gold">$${player.gold || "0"}</div>
                <div class="goldtxt">gold</div>
            </div>`;
        
        // 3. Spell
        const spellHTML = `
            <div class="spell">
                ${player.spell ? `<img src="${getImagePath(player.spell, 'spell')}" alt="${player.spell}">` : ''}
            </div>`;

        // 4. Item Frame
        const itemFrameHTML = `
            <div class="itemframe">
                <div class="items">
                    ${topItems.map(item => `
                        <div class="itemslot ${item === 'idle' ? 'empty' : ''}">
                            ${item !== 'idle' ? `<img src="${getImagePath(item, 'item')}" alt="${item}">` : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="items">
                    ${botItems.map(item => `
                        <div class="itemslot ${item === 'idle' ? 'empty' : ''}">
                            ${item !== 'idle' ? `<img src="${getImagePath(item, 'item')}" alt="${item}">` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>`;

        // --- Logic Penentuan Urutan ---
        let contentHTML = "";

        if (containerId === "team2") {
            // Urutan Team 2: Item > Spell > KDA > Level
            contentHTML = itemFrameHTML + spellHTML + kdaGoldHTML + levelHTML;
        } else {
            // Urutan Default (Team 1): Level > KDA > Spell > Item
            contentHTML = levelHTML + kdaGoldHTML + spellHTML + itemFrameHTML;
        }

        // --- Render ---
        const playerDiv = document.createElement("div");
        playerDiv.innerHTML = `<div class="boxsideinfo">${contentHTML}</div>`;
        container.appendChild(playerDiv);
    });
}

// Fungsi Render Hero Image Besar & Nickname
function renderHeroCards(players, startImgId, startNameId) {
    players.forEach((player, index) => {
        const imgElement = document.getElementById(`image-display-${startImgId + index}`);
        if (imgElement) imgElement.src = getImagePath(player.hero, 'hero');

        const nameElement = document.getElementById(`name-box-${startNameId + index}`);
        if (nameElement) nameElement.innerText = player.name || "";
    });
}

// Fungsi Render Ban Hero
function renderBans(players, startFrameId) {
    players.forEach((player, index) => {
        const banImgElement = document.getElementById(`image-display-${startFrameId + index}`);
        if (banImgElement) {
            if (player.banhero && player.banhero !== "") {
                banImgElement.src = getImagePath(player.banhero, 'hero');
                banImgElement.style.display = "block";
            } else {
                banImgElement.src = ""; 
            }
        }
    });
}

// Fungsi Fetch Data dengan Pengecekan Perubahan (Dirty Check)
function checkDataUpdate() {
    fetch("database/matchdatateam.json?t=" + new Date().getTime())
      .then(response => {
        if (!response.ok) throw new Error(`Gagal memuat JSON: ${response.status}`);
        return response.json();
      })
      .then(data => {
        const currentDataState = JSON.stringify(data);
        if (currentDataState !== lastDataState) {
            lastDataState = currentDataState;
            renderMatchData(data);
        }
      })
      .catch(error => {
        console.error("Error fetching data:", error);
      });
}

// Inisialisasi
checkDataUpdate();
setInterval(checkDataUpdate, 500);