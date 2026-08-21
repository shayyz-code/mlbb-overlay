        let timerInterval;
        let timerSeconds = 0;

        // Fungsi untuk mengonversi format MM:SS ke detik
        function timeToSeconds(timeStr) {
            const [minutes, seconds] = timeStr.split(':').map(Number);
            return minutes * 60 + seconds;
        }

        // Fungsi untuk mengonversi detik ke format MM:SS
        function secondsToTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        // Fungsi untuk memulai timer dari waktu awal + 3 detik
        function startTimer(initialTime) {
            if (timerInterval) {
                clearInterval(timerInterval); // Hentikan interval sebelumnya
            }
            timerSeconds = timeToSeconds(initialTime) + 2; // Tambah 3 detik
            document.getElementById('timer').textContent = `${secondsToTime(timerSeconds)}`;
            timerInterval = setInterval(() => {
                timerSeconds++;
                document.getElementById('timer').textContent = `${secondsToTime(timerSeconds)}`;
            }, 1000);
        }

        // Fungsi untuk mengambil data JSON dan memperbarui tampilan
        async function fetchGameData() {
            try {
                const response = await fetch('http://localhost:18099/json');
                const data = await response.json();

                // Objek untuk memetakan nama ke ID div
                const statMap = {
                    'Home Score': 'homescore',
                    'Away Score': 'awayscore',
                    'Blue Gold': 'bluegold',
                    'Red Gold': 'redgold',
                    'Blue Tower': 'bluetower',
                    'Red Tower': 'redtower',
                    'Blue Lord': 'bluelord',
                    'Red Lord': 'redlord'
                };

                // Perbarui nilai untuk elemen selain timer
                data.forEach(item => {
                    const divId = statMap[item.name];
                    if (divId) {
                        document.getElementById(divId).textContent = `${item.text}`;
                    }
                });

                // Ambil nilai timer hanya sekali saat pertama kali memuat
                if (!timerInterval) {
                    const timerData = data.find(item => item.name === 'timer');
                    if (timerData) {
                        startTimer(timerData.text);
                    }
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        }

        // Panggil fetchGameData pertama kali saat halaman dimuat
        fetchGameData();

        // Perbarui data setiap 1 detik (kecuali timer)
        setInterval(fetchGameData, 1000);