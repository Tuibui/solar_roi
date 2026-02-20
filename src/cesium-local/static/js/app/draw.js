// Draw Module - Roof drawing functionality

let drawing = false;
let drawModeEnabled = false;
let positions = [];
let polylineEntity = null;
let drawingPoints = [];
let boundaries = [];
let polygonEntities = [];

// History for undo/redo (now includes single points)
let drawHistory = [];
let drawHistoryIndex = -1;

function setupEventHandlers() {
  const viewer = getViewer();
  if (!viewer) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((e) => {
    if (!drawing || !drawModeEnabled) return;

    // Only allow clicks on 3D tiles (buildings/roofs), not empty terrain
    const picked = viewer.scene.pick(e.position);
    if (!picked) return;

    let p = viewer.scene.pickPosition(e.position);
    if (!p) return;

    if (positions.length >= 3 &&
        Cesium.Cartesian3.distance(p, positions[0]) < 1.5) {
      finishBoundary();
      return;
    }

    // Add point
    positions.push(p);
    saveDrawHistory();

    const pointMarker = viewer.entities.add({
      position: p,
      point: {
        pixelSize: 10,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2
      }
    });
    drawingPoints.push(pointMarker);
    
    updateDrawButtons();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function setupShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); undoDrawPoint(); }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); redoDrawPoint(); }
    if (e.key.toLowerCase() === "d") toggleDrawMode();
    if (e.key === "Escape") cancelDrawing();
  });
}

// History for single point undo/redo
function saveDrawHistory() {
  drawHistory = drawHistory.slice(0, drawHistoryIndex + 1);
  drawHistory.push({
    positions: positions.slice(),
    drawingPoints: drawingPoints.slice()
  });
  drawHistoryIndex++;
}

function undoDrawPoint() {
  const viewer = getViewer();
  if (drawHistoryIndex < 0) return;
  
  drawHistoryIndex--;
  
  if (drawHistoryIndex < 0) {
    // Remove last point
    if (drawingPoints.length > 0) {
      const lastPoint = drawingPoints.pop();
      viewer.entities.remove(lastPoint);
      positions.pop();
    }
  } else {
    // Restore from history
    const state = drawHistory[drawHistoryIndex];
    
    // Remove extra points
    while (drawingPoints.length > state.drawingPoints.length) {
      const point = drawingPoints.pop();
      viewer.entities.remove(point);
    }
    positions = state.positions.slice();
  }
  
  updateDrawButtons();
  setStatus(`Undo point (${drawingPoints.length})`, "#ff0");
}

function redoDrawPoint() {
  if (drawHistoryIndex >= drawHistory.length - 1) return;
  
  drawHistoryIndex++;
  const state = drawHistory[drawHistoryIndex];
  
  const viewer = getViewer();
  
  // Restore point
  if (state.drawingPoints.length > drawingPoints.length) {
    const lastStatePoint = state.drawingPoints[state.drawingPoints.length - 1];
    const newPoint = viewer.entities.add({
      position: lastStatePoint.position.getValue(),
      point: {
        pixelSize: 10,
        color: Cesium.Color.YELLOW,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2
      }
    });
    drawingPoints.push(newPoint);
    positions.push(state.positions[state.positions.length - 1]);
  }
  
  updateDrawButtons();
  setStatus(`Redo point (${drawingPoints.length})`, "#ff0");
}

function updateDrawButtons() {
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) btnUndo.disabled = drawingPoints.length === 0;
  if (btnRedo) btnRedo.disabled = drawHistoryIndex >= drawHistory.length - 1;
}

function toggleDrawMode() {
  if (drawModeEnabled) {
    cancelDrawing();
    drawModeEnabled = false;
    document.getElementById('btnDrawRoof').classList.remove('active');
    setStatus("Draw mode off");
  } else {
    drawModeEnabled = true;
    document.getElementById('btnDrawRoof').classList.add('active');
    startNewRoof();
  }
}

function startNewRoof() {
  const viewer = getViewer();
  positions = [];
  drawingPoints = [];
  drawHistory = [];
  drawHistoryIndex = -1;
  drawing = true;

  polylineEntity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => positions, false),
      width: 3,
      material: Cesium.Color.YELLOW
    }
  });

  setStatus("Drawing...", "#ff0");
  updateDrawButtons();
}

function cancelDrawing() {
  const viewer = getViewer();
  drawing = false;
  drawModeEnabled = false;
  document.getElementById('btnDrawRoof').classList.remove('active');
  if (polylineEntity && viewer) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  drawingPoints.forEach(p => viewer.entities.remove(p));
  drawingPoints = [];
  positions = [];
  drawHistory = [];
  drawHistoryIndex = -1;
  updateDrawButtons();
}

function finishBoundary() {
  const viewer = getViewer();
  const colorIndex = boundaries.length % ROOF_COLORS.length;
  const roofColor = ROOF_COLORS[colorIndex];

  const poly = viewer.entities.add({
    polygon: {
      hierarchy: positions.slice(),
      material: roofColor.cesium.withAlpha(0.4),
      classificationType: Cesium.ClassificationType.CESIUM_3D_TILE
    }
  });

  boundaries.push(positions.slice());
  polygonEntities.push(poly);
  
  // Update roof count display
  updateRoofCount();
  
  console.group(`Roof ${boundaries.length} (${roofColor.name}) drawn`);
  const points = positions.map(p => [p.x, p.y, p.z]);
  console.info(`Points (${points.length}):`, points);
  console.groupEnd();

  if (polylineEntity) {
    viewer.entities.remove(polylineEntity);
    polylineEntity = null;
  }
  drawingPoints.forEach(p => viewer.entities.remove(p));
  drawingPoints = [];
  positions = [];
  drawHistory = [];
  drawHistoryIndex = -1;

  setStatus(`Roof ${boundaries.length} (${roofColor.name}) added`);
  updateDrawButtons();

  if (drawModeEnabled) {
    startNewRoof();
  }
}

function updateRoofCount() {
  const countEl = document.getElementById('roofsCount');
  if (countEl) {
    countEl.textContent = boundaries.length;
  }
}

function undo() {
  const viewer = getViewer();
  if (boundaries.length === 0) return;
  
  const lastPoly = polygonEntities.pop();
  if (lastPoly) viewer.entities.remove(lastPoly);
  boundaries.pop();
  updateRoofCount();
  setStatus(`Undo roof (${boundaries.length})`, "#ff0");
}

function redo() {
  // Redo for complete roofs - would need full history
  setStatus("Redo not implemented for roofs", "#ff0");
}

function getBoundaries() {
  return boundaries;
}

function resetBoundaries() {
  const viewer = getViewer();
  cancelDrawing();
  boundaries = [];
  polygonEntities.forEach(e => viewer.entities.remove(e));
  polygonEntities = [];
  updateRoofCount();
  sessionStorage.removeItem(CONFIG.STATE_KEY);
  setStatus("Reset");
}
