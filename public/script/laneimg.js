// Variabel untuk menyimpan data terakhir (Dirty Checking)
        let lastDataString = "";

        async function checkForUpdates() {
            try {
                // 1. Cek file JSON dengan timestamp anti-cache
                const response = await fetch('database/matchdatateam.json?t=' + new Date().getTime());
                if (!response.ok) return;
                
                const data = await response.json();

                // 2. Konversi data objek ke string untuk perbandingan
                const currentDataString = JSON.stringify(data);

                // 3. LOGIC PENTING: Jika data sama persis, return (hemat resource/kedipan)
                if (currentDataString === lastDataString) {
                    return; 
                }

                // Jika data beda, simpan dan render ulang
                lastDataString = currentDataString;
                console.log("Perubahan terdeteksi! Mengupdate gambar...");

                renderLanes(data);

            } catch (error) {
                console.error("Gagal membaca data:", error);
            }
        }

        function renderLanes(data) {
            
            // Fungsi helper untuk update satu gambar
            function updateImage(elementId, player) {
                const imgElement = document.getElementById(elementId);
                
                // Jika elemen HTML tidak ditemukan di index.html, skip agar tidak error
                if (!imgElement) return;

                // Reset handler error agar bersih setiap kali update
                imgElement.onerror = null;

                // LOGIC UTAMA: Cek apakah data lane valid
                // Valid = object player ada, properti lane ada, tidak "none", tidak kosong
                if (player && player.lane && player.lane !== "none" && player.lane !== "") {
                    
                    const laneName = player.lane.toLowerCase(); // Paksa huruf kecil
                    
                    // 1. TAMPILKAN ELEMEN
                    // Kita reset display ke block/inline-block dan opacity 1
                    imgElement.style.display = 'block'; 
                    imgElement.style.opacity = '1';
                    
                    // Set source gambar sesuai nama lane (misal: gold.png)
                    imgElement.src = `Assets/lane/${laneName}.png`;
                    
                    // Error Handling:
                    // Jika file gambar (misal: roam.png) tidak ditemukan di folder,
                    // maka sembunyikan elemennya (daripada muncul ikon gambar rusak)
                    imgElement.onerror = function() {
                        this.style.display = 'none';
                        this.style.opacity = '0';
                        this.onerror = null; // Mencegah loop
                    };

                } else {
                    // 2. SEMBUNYIKAN ELEMEN
                    // Jika data JSON = "none" atau kosong
                    imgElement.style.display = 'none';
                    imgElement.style.opacity = '0';
                    
                    // Opsional: kosongkan src
                    imgElement.src = ""; 
                }
            }

            // Loop Blue Team
            if (data.teamdata?.blueteam?.playerlist) {
                data.teamdata.blueteam.playerlist.forEach((player, i) => {
                    updateImage(`player-lane-${i + 1}-blue`, player);
                });
            }

            // Loop Red Team
            if (data.teamdata?.redteam?.playerlist) {
                data.teamdata.redteam.playerlist.forEach((player, i) => {
                    updateImage(`player-lane-${i + 1}-red`, player);
                });
            }
        }

        // Jalankan pengecekan pertama kali saat halaman dimuat
        checkForUpdates();

        // Cek file setiap 500ms (setengah detik)
        setInterval(checkForUpdates, 500);