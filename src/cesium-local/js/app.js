Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1MTIzMTg3Ny05MWFiLTRiNmMtOTEzZS0wMGQzMjRjYjJjZWYiLCJpZCI6MzY1MjY5LCJpYXQiOjE3Njg3MTc3MDV9.k1WwQT5FSOc4GumluujUXoPVMs5YCWv929td7VTjtO0"

let viewer;

// Drawing state
let drawing = false;
let positions = [];
let polylineEntity = null;
let drawingPoints = [];

// Roof boundaries storage
let boundaries = [];
let polygonEntities = [];

// History for undo/redo
let history = [];
let historyIndex = -1;

const STATE_KEY = "cesium_state";
const API_BASE = window.location.port === "8000" ? "" : "http://localhost:8000";

// =============================
// UI helpers
// =============================
function showOverlay(msg = "Generating model…") {
  document.getElementById("overlayMsg").textContent = msg;
  document.getElementById("overlay").style.display = "flex";
}
function hideOverlay() {
  document.getElementById("overlay").style.display = "none";
}
function setStatus(msg, color = "#0f0") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.style.color = color;
}

// =============================
// History Management
// =============================
function updateHistoryButtons() {
  document.getElementById('btnUndo').disabled = (historyIndex < 0);
  document.getElementById('btnRedo').disabled = (historyIndex >= history.length - 1);
}

function saveToHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push({
    boundaries: boundaries.map(b => b.map(p => ({x: p.x, y: p.y, z: p.z})))
  });
  historyIndex++;
  updateHistoryButtons();
  setStatus(`Saved (${historyIndex + 1}/${history.length})`);
}

function restoreFromHistory(state) {
  polygonEntities.forEach(e => viewer.entities.remove(e));
  polygonEntities = [];
  boundaries = [];

  state.boundaries.forEach(b => {
    const pos = b.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
    const poly = viewer.entities.add({
      polygon: {
        hierarchy: pos,
        material: Cesium.Color.CYAN.withAlpha(0.4),
        outline: true,
        outlineColor: Cesium.Color.CYAN,
        outlineWidth: 2
      }
    });
    boundaries.push(pos);
    polygonEntities.push(poly);
  });
}

window.undo = () => {
  if (historyIndex < 0) return;
  historyIndex--;
  if (historyIndex < 0) {
    polygonEntities.forEach(e => viewer.entities.remove(e));
    polygonEntities = [];
    boundaries = [];
    setStatus("Undo to empty state", "#ff0");
  } else {
    restoreFromHistory(history[historyIndex]);
    setStatus(`Undo (${historyIndex + 1}/${history.length})`, "#ff0");
  }
  updateHistoryButtons();
};

window.redo = () => {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreFromHistory(history[historyIndex]);
  updateHistoryButtons();
  setStatus(`Redo (${historyIndex + 1}/${history.length})`, "#ff0");
};

// =============================
// State Management
// =============================
function saveState() {
  const cam = viewer.camera;
  const state = {
    camera: {
      position: { x: cam.positionWC.x, y: cam.positionWC.y, z: cam.positionWC.z },
      direction: { x: cam.directionWC.x, y: cam.directionWC.y, z: cam.directionWC.z },
      up: { x: cam.upWC.x, y: cam.upWC.y, z: cam.upWC.z }
    },
    boundaries: boundaries.map(b => b.map(p => ({ x:p.x, y:p.y, z:p.z }))),
    history: history,
    historyIndex: historyIndex
  };
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function restoreState() {
  const raw = sessionStorage.getItem(STATE_KEY);
  if (!raw) return;
  const state = JSON.parse(raw);

  viewer.camera.setView({
    destination: new Cesium.Cartesian3(state.camera.position.x, state.camera.position.y, state.camera.position.z),
    orientation: {
      direction: new Cesium.Cartesian3(state.camera.direction.x, state.camera.direction.y, state.camera.direction.z),
      up: new Cesium.Cartesian3(state.camera.up.x, state.camera.up.y, state.camera.up.z)
    }
  });

  if (state.history) {
    history = state.history;
    historyIndex = state.historyIndex || -1;
  }

  state.boundaries.forEach(b => {
    const pos = b.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
    const poly = viewer.entities.add({
      polygon: {
        hierarchy: pos,
        material: Cesium.Color.CYAN.withAlpha(0.4),
        outline: true,
        outlineColor: Cesium.Color.CYAN,
        outlineWidth: 2
      }
    });
    boundaries.push(pos);
    polygonEntities.push(poly);
  });

  updateHistoryButtons();
  setStatus("State restored");
}

// =============================
// Init
// =============================
window.addEventListener("DOMContentLoaded", async () => {
  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false  // Search is on welcome page
  });

  try {
    const tiles = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(tiles);
  } catch(e) {
    console.error("Failed to load 3D tiles:", e);
  }

  const params = new URLSearchParams(location.search);

  if (params.get("return") === "true") {
    setTimeout(restoreState, 500);
  } else if (params.get("fromWelcome") === "true") {
    // Set camera directly to location from welcome page
    const destData = localStorage.getItem('solar_destination');
    if (destData) {
      const dest = JSON.parse(destData);

      let destination;
      if (dest.type === 'rectangle') {
        destination = new Cesium.Rectangle(dest.west, dest.south, dest.east, dest.north);
      } else {
        destination = Cesium.Cartesian3.fromDegrees(dest.lon, dest.lat, dest.height || 1000);
      }

      // Set camera directly - user sees city immediately
      viewer.camera.setView({ destination: destination });
    }
  }

  setupEventHandlers();
  setupShortcuts();
  checkAPIHealth();
  setStatus("Ready — Draw Roof Mode");
});

// =============================
// Location Navigation
// =============================
function flyToCoordinates(lon, lat, name, altitude = 500) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-45),
      roll: 0
    },
    duration: 2,
    complete: () => {
      setStatus("Viewing: " + name, "#0f0");
    }
  });
}

window.detectMyLocation = () => {
  if (!navigator.geolocation) {
    setStatus("Geolocation not supported", "#f55");
    return;
  }

  setStatus("Detecting your exact location...", "#ff0");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 150), // Close zoom to see house
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0
        },
        duration: 2
      });
      setStatus(`Your house: ${lat.toFixed(5)}, ${lon.toFixed(5)}`, "#0f0");
    },
    (err) => {
      setStatus("Location access denied - use manual navigation", "#f55");
      console.error("Geolocation error:", err);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
};

window.goToWelcome = () => {
  window.location.href = "/welcome.html";
};

// =============================
// API Health Check
// =============================
async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    console.log("✅ Backend API connected:", data);
  } catch(err) {
    console.error("❌ Backend API not reachable:", err);
    setStatus("Backend not reachable", "#f55");
  }
}

// =============================
// Event Handlers
// =============================
function setupEventHandlers() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((e) => {
    if (!drawing) return;
    let p = viewer.scene.pickPosition(e.position);
    if (!p) return;

    if (positions.length >= 3 &&
        Cesium.Cartesian3.distance(p, positions[0]) < 1.5) {
      finishBoundary();
      return;
    }

    positions.push(p);

    const pointMarker = viewer.entities.add({
      position: p,
      point: {
        pixelSize: 15,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3
      }
    });
    drawingPoints.push(pointMarker);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function setupShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    if (e.key.toLowerCase() === "t") viewTop();
    if (e.key.toLowerCase() === "f") viewFront();
  });
}

// =============================
// Draw Functions (roof-only)
// =============================
window.startDrawBoundary = () => {
  cancelDrawing();
  drawing = true;
  positions = [];
  drawingPoints = [];

  polylineEntity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => positions, false),
      width: 3,
      material: Cesium.Color.YELLOW
    }
  });

  setStatus("Drawing roof…", "#ff0");
};

function cancelDrawing() {
  drawing = false;
  if (polylineEntity) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  drawingPoints.forEach(p => viewer.entities.remove(p));
  drawingPoints = [];
  positions = [];
}

function finishBoundary() {
  drawing = false;

  const poly = viewer.entities.add({
    polygon: {
      hierarchy: positions.slice(),
      material: Cesium.Color.CYAN.withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.CYAN,
      outlineWidth: 2
    }
  });

  boundaries.push(positions.slice());
  polygonEntities.push(poly);

  if (polylineEntity) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  drawingPoints.forEach(p => viewer.entities.remove(p));
  drawingPoints = [];
  positions = [];
  saveToHistory();

  setStatus(`Roof added — total: ${boundaries.length}`);
}

// =============================
// Analyze - HTTP POST (roof-only)
// =============================
window.analyzeBoundary = async () => {
  if (!boundaries.length) {
    alert("Draw at least one roof first");
    return;
  }

  showOverlay("Sending roof data to backend…");
  setStatus("Analyzing…", "#ff0");
  saveState();

  const roofs = boundaries.map(b => b.map(p => [p.x, p.y, p.z]));
  console.log("Sending", roofs.length, "roof(s) to backend");

  try {
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roofs })
    });

    const data = await response.json();
    hideOverlay();

    if (!response.ok) {
      alert("Error: " + (data.error || "Unknown error"));
      setStatus("Analyze failed", "#f55");
      return;
    }

    console.log("✅ Model generated:", data);
    setStatus("Model generated — opening viewer");
    location.href = `/display.html?file=${data.file}&t=${Date.now()}`;

  } catch(err) {
    hideOverlay();
    console.error("❌ API Error:", err);
    alert("Failed to connect to backend server.\nMake sure Python server is running on port 8000.");
    setStatus("Backend error", "#f55");
  }
};

window.resetBoundaries = () => {
  cancelDrawing();
  boundaries = [];
  polygonEntities.forEach(e => viewer.entities.remove(e));
  polygonEntities = [];
  history = [];
  historyIndex = -1;
  updateHistoryButtons();
  sessionStorage.removeItem(STATE_KEY);
  setStatus("Reset — Ready");
  console.log("Reset all boundaries and history");
};

// =============================
// View helpers
// =============================
function getRoofBoundingSphere() {
  if (!boundaries.length) return null;
  const pts = [];
  boundaries.forEach(b => b.forEach(p => pts.push(p)));
  return Cesium.BoundingSphere.fromPoints(pts);
}

window.zoomToRoofs = () => {
  const bs = getRoofBoundingSphere();
  if (!bs) return;
  viewer.camera.flyToBoundingSphere(bs, { duration: 0.8 });
};

window.viewTop = () => {
  const bs = getRoofBoundingSphere();
  if (bs) viewer.camera.flyToBoundingSphere(bs, { duration: 0.6 });
  viewer.camera.setView({
    destination: viewer.camera.position,
    orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 }
  });
};

window.viewFront = () => {
  const bs = getRoofBoundingSphere();
  if (bs) viewer.camera.flyToBoundingSphere(bs, { duration: 0.6 });
  viewer.camera.setView({
    destination: viewer.camera.position,
    orientation: { heading: 0, pitch: 0, roll: 0 }
  });
};

