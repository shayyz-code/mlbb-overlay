let saveState = 0; // 0 = Standby, 1 = Menunggu Konfirmasi
    let resetTimer = null; // Timer untuk mengembalikan tombol jika tidak jadi diklik

    async function handleSaveDraft(btn) {
        if (saveState === 0) {
            // === KLIK PERTAMA (Minta Konfirmasi) ===
            saveState = 1;
            btn.innerText = "ARE U SURE?";
            
            // Ubah warna jadi Merah (Warning)
            btn.style.borderColor = "#FF4444"; 
            btn.style.color = "#FF4444";

            // Pasang timer: Jika dalam 3 detik tidak diklik lagi, kembalikan ke awal
            resetTimer = setTimeout(() => {
                resetSaveButton(btn);
            }, 3000);

        } else if (saveState === 1) {
            // === KLIK KEDUA (Eksekusi Save) ===
            clearTimeout(resetTimer); // Batalkan timer reset
            
            try {
                // Panggil API Server
                await fetch('/api/archive-draft', { method: 'POST' });
                
                // Ubah tampilan jadi Sukses
                btn.innerText = "SAVED!";
                btn.style.backgroundColor = "#00FF8C"; // Background Hijau
                btn.style.color = "#000000";           // Teks Hitam
                btn.style.borderColor = "#00FF8C";

                // Kembalikan ke tombol semula setelah 2 detik
                setTimeout(() => {
                    resetSaveButton(btn);
                }, 2000);
                
                console.log("Draft Saved Successfully.");

            } catch (e) {
                console.error("Gagal menyimpan:", e);
                resetSaveButton(btn); // Reset jika error
            }
        }
    }

    function resetSaveButton(btn) {
        saveState = 0;
        btn.innerText = "SAVE TO PREVIOUS";
        
        // Reset Style ke warna asli (Hijau Neon tanpa background)
        btn.style.backgroundColor = "transparent";
        btn.style.borderColor = "#00FF8C";
        btn.style.color = "#00FF8C";
    }

    // --- FUNGSI LAINNYA ---
    
    async function controlAnalyzer(action) {
        try {
            await fetch('/api/analyzer-control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
        } catch (e) { console.error(e); }
    }