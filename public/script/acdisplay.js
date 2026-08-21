const DEFAULT_LOGO = 'Assets/Other/transparent.png';

    // Fungsi update tampilan berdasarkan data JSON
    function updateDisplay(allData) {
        for (let i = 1; i <= 4; i++) {
            const data = allData[i.toString()];
            const container = document.getElementById(`schedule-${i}`);

            if (data && data.show) {
                // Tampilkan container
                container.style.display = 'flex'; // Atau 'block' sesuai CSS asli Anda

                // Update konten
                document.getElementById(`time-${i}`).textContent = data.time || '';
                
                const logo1Src = (data.logo1 && data.logo1.length > 100) ? data.logo1 : DEFAULT_LOGO;
                document.getElementById(`logo1-${i}`).src = logo1Src;
                
                document.getElementById(`team1-${i}`).textContent = data.team1 || '';
                document.getElementById(`score1-${i}`).textContent = data.score1 || '0';
                
                const logo2Src = (data.logo2 && data.logo2.length > 100) ? data.logo2 : DEFAULT_LOGO;
                document.getElementById(`logo2-${i}`).src = logo2Src;
                
                document.getElementById(`team2-${i}`).textContent = data.team2 || '';
                document.getElementById(`score2-${i}`).textContent = data.score2 || '0';
            } else {
                // Sembunyikan jika checkbox 'Show' dimatikan
                container.style.display = 'none';
            }
        }
    }

    // Load data awal via API
    async function initData() {
        try {
            const res = await fetch('/api/schedule');
            const data = await res.json();
            updateDisplay(data);
        } catch (e) { console.error(e); }
    }

    // Setup WebSocket untuk Realtime Update
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        // Cek tipe pesan dari server
        if (msg.type === 'schedule_update') {
            updateDisplay(msg.data);
        }
    };

    window.onload = initData;