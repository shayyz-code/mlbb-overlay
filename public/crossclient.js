async function getServerIp() {
  try {
    const response = await fetch('/serverip.txt', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch serverip.txt: ${response.statusText}`);
    const ip = (await response.text()).trim();
    if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      throw new Error('Invalid or empty IP in serverip.txt');
    }
    return ip;
  } catch (error) {
    console.error('Error fetching server IP:', error);
    return 'localhost';
  }
}

(async () => {
  const serverIp = await getServerIp();
  console.log(`Attempting WebSocket connection to ws://${serverIp}:3000`);
  const ws = new WebSocket(`ws://${serverIp}:3000`);

  const timerKeys = ['timer', 'timerRunning', 'resetTimerBar', 'currentPhaseIndex', 'updateTime'];
  const mvpKeys = ['mvpData', 'selectedMvp', 'mvpUpdateTime'];

  function triggerUpdateUI(changedData, isFullUpdate) {
    const isTimerUpdate = !isFullUpdate && Object.keys(changedData).some(key => timerKeys.includes(key));
    const isImageUpdate = !isFullUpdate && Object.keys(changedData).some(key => key === 'logo1' || key === 'logo2' || key.toLowerCase().includes('image'));
    const isMvpUpdate = !isFullUpdate && Object.keys(changedData).some(key => mvpKeys.includes(key));

    if (isFullUpdate) {
      window.loadImages?.();
      window.updateDisplay?.();
      window.updateUI?.();
      window.updateMvpDisplay?.();
      console.log('Full UI update triggered');
      return;
    }

    if (isImageUpdate) {
      window.loadImages?.();
      console.log('Image update triggered:', { changedData });
    }
    if (isTimerUpdate) {
      window.updateUI?.();
      console.log('Timer update triggered:', { changedData });
    }
    if (isMvpUpdate) {
      window.updateMvpDisplay?.();
      console.log('MVP update triggered:', { changedData });
    }
    
    if (!isTimerUpdate && !isImageUpdate && !isMvpUpdate) {
      window.updateDisplay?.();
      console.log('General display update triggered:', { changedData });
    }
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const changedData = {};

      if (msg.type === 'init' || msg.type === 'update') {
        // ==================== PERUBAHAN DIMULAI DI SINI ====================
        const isLiveUpdate = msg.type === 'update'; // Tandai jika ini adalah update langsung, bukan inisialisasi
        const action = isLiveUpdate ? 'delta' : 'init data';
        
        for (const [key, value] of Object.entries(msg.data)) {
          const oldValue = localStorage.getItem(key);

          if (value === null) {
            localStorage.removeItem(key);
          } else {
            localStorage.setItem(key, value);
          }
          changedData[key] = value;
          
          // KUNCI PERBAIKAN:
          // Hanya picu event 'storage' secara manual JIKA ini adalah 'update' langsung.
          // Saat 'init' (refresh halaman), kita tidak ingin memicu event agar tidak memulai ulang animasi.
          // Halaman akan membaca state dari localStorage saat pertama kali dimuat.
          if (isLiveUpdate) {
            window.dispatchEvent(new StorageEvent('storage', {
              key: key,
              newValue: value === null ? null : String(value), // newValue harus string atau null
              oldValue: oldValue,
              storageArea: localStorage,
              url: window.location.href,
            }));
          }
        }
        // ===================== AKHIR DARI PERUBAHAN ======================
        
        console.log(`localStorage updated with ${action}:`, { ...localStorage });
        triggerUpdateUI(changedData, msg.type === 'init');

      } else if (msg.type === 'clear') {
        localStorage.clear();
        console.log('localStorage cleared');
        
        // Tetap picu event 'clear' agar halaman bisa me-reset dirinya
        window.dispatchEvent(new StorageEvent('storage', {
          key: null,
          newValue: null,
          oldValue: null,
          storageArea: localStorage,
          url: window.location.href,
        }));
        
        triggerUpdateUI({}, true);
      }
    } catch (e) {
      console.error('Error processing message:', e);
    }
  };

  ws.onopen = () => {
    console.log(`Connected to WebSocket server at ws://${serverIp}:3000`);
  };

  ws.onerror = (error) => console.error('WebSocket error:', error);
  ws.onclose = () => console.log('WebSocket connection closed');
})();