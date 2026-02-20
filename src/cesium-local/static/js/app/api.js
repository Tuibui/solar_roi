// API Module - Backend communication

let roofDataCache = null;

async function detectLocation() {
  const btn = document.querySelector('.detect-btn');
  const errorEl = document.getElementById('detectError');
  const selectedEl = document.getElementById('detectSelected');

  btn.disabled = true;
  btn.textContent = 'Detecting...';
  errorEl.style.display = 'none';
  selectedEl.style.display = 'none';

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/detect-location`);
    const data = await res.json();

    if (data.success) {
      const destination = {
        type: 'cartesian',
        lon: data.lon,
        lat: data.lat,
        height: 500,
        name: data.address
      };

      selectedEl.style.display = 'block';
      selectedEl.innerHTML = `<strong>Detected:</strong> ${data.address}<br><small style="color:#666">${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}</small>`;

      btn.disabled = false;
      btn.textContent = 'Detect My Location';
      return destination;
    } else {
      errorEl.style.display = 'block';
      errorEl.textContent = data.error || 'Could not detect location';
    }
  } catch (e) {
    errorEl.style.display = 'block';
    errorEl.textContent = 'Failed to connect to server';
    console.error(e);
  }

  btn.disabled = false;
  btn.textContent = 'Detect My Location';
  return null;
}

async function analyzeRoofs(boundaries) {
  if (!boundaries.length) {
    alert("Draw at least one roof first");
    return null;
  }

  setStatus("Analyzing...", "#ff0");

  const roofs = boundaries.map(b => b.map(p => [p.x, p.y, p.z]));
  console.group("Analyze payload");
  console.info("Roof count:", roofs.length);
  roofs.forEach((roof, index) => {
    console.info(`Roof ${index + 1} (${roof.length} points):`, roof);
  });
  console.groupEnd();

  try {
    const response = await fetch(`${CONFIG.API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roofs })
    });

    const data = await response.json();

    if (!response.ok) {
      hideOverlay();
      alert("Error: " + (data.error || "Unknown error"));
      setStatus("Failed", "#f55");
      return null;
    }

    setStatus("Analysis complete");
    return data;

  } catch(err) {
    console.error("API Error:", err);
    alert("Backend connection failed");
    setStatus("Error", "#f55");
    return null;
  }
}

async function loadRoofData() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/roof-info`);
    if (!res.ok) throw new Error("No data");
    const data = await res.json();
    roofDataCache = data.roofs || [];
    return data;
  } catch(e) {
    console.error("Failed to load roof data:", e);
    roofDataCache = [];
    return null;
  }
}

async function updateRoofValues(roofIndex, tilt, azimuth) {
  const payload = {
    index: roofIndex,
    tilt: tilt,
    azimuth: azimuth
  };

  try {
    const res = await fetch(`${CONFIG.API_BASE}/api/update-roof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error("Failed to update roof:", err);
    return { error: err.message };
  }
}

function getRoofDataCache() {
  return roofDataCache;
}

function setRoofDataCache(data) {
  roofDataCache = data;
}

window.clearSolarCache = async function clearSolarCache() {
  try {
    localStorage.clear();
  } catch (e) {
    console.warn("Failed to clear localStorage:", e);
  }
  try {
    sessionStorage.clear();
  } catch (e) {
    console.warn("Failed to clear sessionStorage:", e);
  }
  if (window.caches && caches.keys) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    } catch (e) {
      console.warn("Failed to clear CacheStorage:", e);
    }
  }
  roofDataCache = null;
  console.info("Solar cache cleared. Reloading...");
  window.location.reload();
};
