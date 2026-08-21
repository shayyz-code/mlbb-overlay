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
  const alwaysUpdateKeys = ['currentVideo', 'logo1', 'logo2']; // Tambahkan logo1 dan logo2
  let previousStorage = { ...localStorage };

  const originalSetItem = localStorage.setItem;
  const originalRemoveItem = localStorage.removeItem;
  const originalClear = localStorage.clear;

  localStorage.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    sendStorageDelta(key, value);
  };

  localStorage.removeItem = function(key) {
    originalRemoveItem.call(this, key);
    sendStorageDelta(key, null);
  };

  localStorage.clear = function() {
    originalClear.call(this);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'clear' }));
      previousStorage = {};
      console.log('localStorage cleared and sent to server');
    } else {
      console.warn('WebSocket not open, cannot send clear');
    }
  };

  function sendStorageDelta(key, value) {
    const delta = {};
    if (value === null) {
      if (key in previousStorage) {
        delta[key] = null;
        delete previousStorage[key];
      }
    } else if (alwaysUpdateKeys.includes(key) || previousStorage[key] !== value) {
      delta[key] = value;
      previousStorage[key] = value;
    }

    for (const timerKey of timerKeys) {
      const currentValue = localStorage.getItem(timerKey);
      if (currentValue !== previousStorage[timerKey]) {
        delta[timerKey] = currentValue;
        previousStorage[timerKey] = currentValue;
      }
    }

    if (Object.keys(delta).length && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'update', data: delta }));
      console.log('Sent delta update:', delta);
    }
  }

  ws.onopen = () => {
    console.log(`Connected to WebSocket server at ws://${serverIp}:3000`);
    const currentData = { ...localStorage };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'init', data: currentData }));
      previousStorage = currentData;
      console.log('Sent current localStorage data:', currentData);
    }
  };

  ws.onerror = (error) => console.error('WebSocket error:', error);
  ws.onclose = () => console.log('WebSocket connection closed');
})();