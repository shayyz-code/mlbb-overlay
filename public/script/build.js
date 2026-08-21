function fetchData() {
    // Mengambil data dari file JSON yang memuat struktur teamdata
    fetch('/database/matchdatateam.json')
        .then(response => response.json())
        .then(data => {
            // --- LOGIKA BLUE TEAM ---
            const bluePlayers = data.teamdata.blueteam.playerlist;

            // Loop untuk 5 pemain Blue Team
            for (let i = 0; i < 5; i++) {
                const playerData = bluePlayers[i];

                // 1. Update Gambar Hero (Blue Side: ID image-display-1 sampai 5)
                const heroImg = document.getElementById(`image-display-${i + 1}`);
                // Jika hero kosong/string kosong, gunakan 'idle' atau gambar default
                const heroName = playerData.hero ? playerData.hero : 'idle';
                if (heroImg) {
                    heroImg.src = `Assets/HeroPick/${heroName}.png`;
                }

                // 2. Update Item List
                const playerDiv = document.getElementById(`blueside${i + 1}`);
                if (playerDiv) {
                    // Loop item 1 sampai 6 (sesuai array itemlist index 0-5)
                    for (let j = 0; j < 6; j++) {
                        // HTML ID menggunakan item1 s/d item6, sedangkan array index 0 s/d 5
                        const itemDiv = playerDiv.querySelector(`#item${j + 1}`);
                        // Ambil nama item dari array itemlist
                        const itemName = playerData.itemlist[j];
                        
                        if (itemDiv) {
                            // Set background image
                            const finalItemName = itemName ? itemName : 'idle';
                            itemDiv.style.backgroundImage = `url('Assets/Itemandspell/${finalItemName}.png')`;
                        }
                    }
                }
            }

            // --- LOGIKA RED TEAM ---
            const redPlayers = data.teamdata.redteam.playerlist;

            // Loop untuk 5 pemain Red Team
            for (let i = 0; i < 5; i++) {
                const playerData = redPlayers[i];

                // 1. Update Gambar Hero (Red Side: ID image-display-6 sampai 10)
                const heroImg = document.getElementById(`image-display-${i + 6}`);
                const heroName = playerData.hero ? playerData.hero : 'idle';
                if (heroImg) {
                    heroImg.src = `Assets/HeroPick/${heroName}.png`;
                }

                // 2. Update Item List
                const playerDiv = document.getElementById(`redside${i + 1}`);
                if (playerDiv) {
                    for (let j = 0; j < 6; j++) {
                        const itemDiv = playerDiv.querySelector(`#item${j + 1}`);
                        const itemName = playerData.itemlist[j];
                        
                        if (itemDiv) {
                            const finalItemName = itemName ? itemName : 'idle';
                            itemDiv.style.backgroundImage = `url('Assets/Itemandspell/${finalItemName}.png')`;
                        }
                    }
                }
            }
        })
        .catch(error => console.error('Error loading JSON:', error));
}

// Fetch data immediately on load
fetchData();

// Fetch data every 3 seconds for real-time updates
setInterval(fetchData, 3000);