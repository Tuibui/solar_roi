Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3YmEyZTc0NC1kNTljLTQxMDUtOTkwZi01YTBmYTAwOWUxYjUiLCJpZCI6MzY1MjY5LCJpYXQiOjE3Njg0ODMxMjV9.TQ5y4FVMCAnPegH1jZwlEsdmcZATDVAyHlmzlWUrkKU";

let viewer;

// Drawing state
let drawMode = 'base'; // 'base' or 'roof'
let drawing = false;
let positions = [];
let polylineEntity = null;

// Boundaries storage
let boundaries = [];
let polygonEntities = [];

// History for undo/redo
let history = [];
let historyIndex = -1;

const STATE_KEY = "cesium_state";
const API_BASE = "http://localhost:8000";

// =============================
// Overlay
// =============================
function showOverlay() {
  document.getElementById("overlay").style.display = "flex";
}
function hideOverlay() {
  document.getElementById("overlay").style.display = "none";
}

// =============================
// Mode Management
// =============================
window.setMode = (mode) => {
  drawMode = mode;
  document.getElementById('btnBase').classList.toggle('active', mode === 'base');
  document.getElementById('btnRoof').classList.toggle('active', mode === 'roof');
  document.getElementById('status').textContent = mode === 'base' ? 'Base Mode' : 'Roof Mode';
};

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
    boundaries: boundaries.map(b => ({
      positions: b.positions.map(p => ({x: p.x, y: p.y, z: p.z})),
      mode: b.mode
    }))
  });
  
  historyIndex++;
  updateHistoryButtons();
  console.log(`Saved to history (${historyIndex + 1}/${history.length})`);
}

function restoreFromHistory(state) {
  polygonEntities.forEach(e => viewer.entities.remove(e));
  polygonEntities = [];
  boundaries = [];
  
  state.boundaries.forEach(b => {
    const pos = b.positions.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
    const color = b.mode === 'base' ? Cesium.Color.ORANGE : Cesium.Color.CYAN;
    const poly = viewer.entities.add({
      polygon: {
        hierarchy: pos,
        material: color.withAlpha(0.4),
        outline: true,
        outlineColor: color,
        outlineWidth: 2
      }
    });
    boundaries.push({ positions: pos, mode: b.mode });
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
  } else {
    restoreFromHistory(history[historyIndex]);
  }
  
  updateHistoryButtons();
  console.log(`Undo (${historyIndex + 1}/${history.length})`);
};

window.redo = () => {
  if (historyIndex >= history.length - 1) return;
  
  historyIndex++;
  restoreFromHistory(history[historyIndex]);
  updateHistoryButtons();
  console.log(`Redo (${historyIndex + 1}/${history.length})`);
};

// =============================
// State Management
// =============================
function saveState() {
  const cam = viewer.camera;
  const state = {
    camera: {
      position: cam.positionWC,
      direction: cam.directionWC,
      up: cam.upWC
    },
    boundaries: boundaries.map(b => ({
      positions: b.positions.map(p => ({ x:p.x, y:p.y, z:p.z })),
      mode: b.mode
    })),
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
    destination: state.camera.position,
    orientation: {
      direction: state.camera.direction,
      up: state.camera.up
    }
  });

  if (state.history) {
    history = state.history;
    historyIndex = state.historyIndex || -1;
  }

  state.boundaries.forEach(b => {
    const pos = b.positions.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
    const color = b.mode === 'base' ? Cesium.Color.ORANGE : Cesium.Color.CYAN;
    const poly = viewer.entities.add({
      polygon: {
        hierarchy: pos,
        material: color.withAlpha(0.4),
        outline: true,
        outlineColor: color
      }
    });
    boundaries.push({ positions: pos, mode: b.mode });
    polygonEntities.push(poly);
  });
  
  updateHistoryButtons();
}

// =============================
// Ground Height Helper
// =============================
function getGroundHeight(cartesian) {
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const height = viewer.scene.globe.getHeight(cartographic);
  return height || 0;
}

function projectToGround(cartesian) {
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const groundHeight = getGroundHeight(cartesian);
  return Cesium.Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    groundHeight
  );
}

// =============================
// Init
// =============================
window.addEventListener("DOMContentLoaded", async () => {
  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    timeline: false,
    baseLayerPicker: false
  });

  try {
    const tiles = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(tiles);
  } catch(e) {
    console.error("Failed to load 3D tiles:", e);
  }

  if (new URLSearchParams(location.search).get("return") === "true") {
    setTimeout(restoreState, 500);
  }

  setupEventHandlers();
  checkAPIHealth();
});

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
  }
}

// =============================
// Event Handlers
// =============================
function setupEventHandlers() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  // Left click for polygon drawing
  handler.setInputAction((e) => {
    if (!drawing) return;
    
    let p = viewer.scene.pickPosition(e.position);
    if (!p) return;

    // Base mode: project to ground
    if (drawMode === 'base') {
      p = projectToGround(p);
    }

    // Check if closing polygon (click near start)
    if (positions.length >= 3 &&
        Cesium.Cartesian3.distance(p, positions[0]) < 1.5) {
      finishBoundary();
      return;
    }
    
    positions.push(p);
    
    // Add visual point marker
    const color = drawMode === 'base' ? Cesium.Color.ORANGE : Cesium.Color.YELLOW;
    const pointMarker = viewer.entities.add({
      position: p,
      point: {
        pixelSize: 15,
        color: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3
      }
    });
    drawingPoints.push(pointMarker);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// =============================
// Draw Functions
// =============================
let drawingPoints = []; // Visual point markers

window.startDrawBoundary = () => {
  // Reset any previous drawing
  cancelDrawing();
  
  drawing = true;
  positions = [];
  drawingPoints = [];
  
  const color = drawMode === 'base' ? Cesium.Color.ORANGE : Cesium.Color.YELLOW;
  
  polylineEntity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => positions, false),
      width: 3,
      material: color
    }
  });
  
  console.log("Started polygon drawing in", drawMode, "mode");
};

function cancelDrawing() {
  drawing = false;
  
  if (polylineEntity) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  
  // Remove drawing point markers
  drawingPoints.forEach(p => viewer.entities.remove(p));
  drawingPoints = [];
  
  positions = [];
}

function finishBoundary() {
  drawing = false;
  
  const color = drawMode === 'base' ? Cesium.Color.ORANGE : Cesium.Color.CYAN;
  
  const poly = viewer.entities.add({
    polygon: {
      hierarchy: positions.slice(),
      material: color.withAlpha(0.4),
      outline: true,
      outlineColor: color,
      outlineWidth: 2
    }
  });
  
  boundaries.push({ positions: positions.slice(), mode: drawMode });
  polygonEntities.push(poly);
  
  if (polylineEntity) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  
  // Remove drawing point markers
  drawingPoints.forEach(p => viewer.entities.remove(p));
  drawingPoints = [];
  
  positions = [];
  saveToHistory();
  
  console.log("Finished boundary in", drawMode, "mode. Total boundaries:", boundaries.length);
}

// =============================
// Analyze - HTTP POST
// =============================
window.analyzeBoundary = async () => {
  if (!boundaries.length) {
    alert("Draw at least one boundary first");
    return;
  }
  
  showOverlay();
  saveState();
  
  const sets = boundaries.map(b => ({
    positions: b.positions.map(p => [p.x, p.y, p.z]),
    mode: b.mode
  }));
  
  console.log("Sending", sets.length, "boundaries to backend");
  
  try {
    const response = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sets })
    });
    
    const data = await response.json();
    
    hideOverlay();
    
    if (!response.ok) {
      alert("Error: " + (data.error || "Unknown error"));
      return;
    }
    
    console.log("✅ Model generated:", data);
    location.href = `/display.html?file=${data.file}&t=${Date.now()}`;
    
  } catch(err) {
    hideOverlay();
    console.error("❌ API Error:", err);
    alert("Failed to connect to backend server.\nMake sure Python server is running on port 8000.");
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
  
  console.log("Reset all boundaries and history");
};
