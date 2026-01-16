Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3YmEyZTc0NC1kNTljLTQxMDUtOTkwZi01YTBmYTAwOWUxYjUiLCJpZCI6MzY1MjY5LCJpYXQiOjE3Njg0ODMxMjV9.TQ5y4FVMCAnPegH1jZwlEsdmcZATDVAyHlmzlWUrkKU"

let viewer;
let client;

let drawing = false;
let positions = [];
let polylineEntity = null;

let boundaries = [];
let polygonEntities = [];

const STATE_KEY = "cesium_state";

// History stacks for undo/redo (store serialized boundaries)
let historyStack = [];
let redoStack = [];

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
// State
// =============================
function saveState() {
  const cam = viewer.camera;
  const state = {
    camera: {
      position: cam.positionWC,
      direction: cam.directionWC,
      up: cam.upWC
    },
    boundaries: boundaries.map(b => b.map(p => ({ x:p.x, y:p.y, z:p.z })))
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

  // clear existing
  boundaries = [];
  polygonEntities.forEach(e=>viewer.entities.remove(e));
  polygonEntities = [];

  state.boundaries.forEach(b => {
    const pos = b.map(p => new Cesium.Cartesian3(p.x,p.y,p.z));
    const poly = viewer.entities.add({
      polygon:{
        hierarchy: pos,
        material: Cesium.Color.CYAN.withAlpha(0.4),
        outline:true
      }
    });
    boundaries.push(pos);
    polygonEntities.push(poly);
  });

  // reset history to this restored state
  pushHistory();
}




// =============================
// History (undo/redo)
// =============================
function serializeBoundaries(bnds) {
  return bnds.map(b => b.map(p => ({x:p.x,y:p.y,z:p.z})));
}

function applySerializedBoundaries(serialized) {
  // remove current entities
  polygonEntities.forEach(e=>viewer.entities.remove(e));
  polygonEntities = [];
  boundaries = [];

  serialized.forEach(b => {
    const pos = b.map(p => new Cesium.Cartesian3(p.x,p.y,p.z));
    const poly = viewer.entities.add({
      polygon:{
        hierarchy: pos,
        material: Cesium.Color.CYAN.withAlpha(0.4),
        outline:true
      }
    });
    boundaries.push(pos);
    polygonEntities.push(poly);
  });
}

function pushHistory() {
  // push current snapshot to history and clear redo
  const snap = serializeBoundaries(boundaries);
  historyStack.push(JSON.stringify(snap));
  // limit history size to avoid memory bloat
  if (historyStack.length > 50) historyStack.shift();
  redoStack = [];
}

function undo() {
  if (historyStack.length <= 1) {
    // nothing to undo (history[0] is initial state)
    return;
  }
  // move current to redo
  const current = historyStack.pop();
  redoStack.push(current);
  const prev = historyStack[historyStack.length - 1];
  applySerializedBoundaries(JSON.parse(prev));
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  historyStack.push(next);
  applySerializedBoundaries(JSON.parse(next));
}

// =============================
// Init
// =============================
window.addEventListener("DOMContentLoaded", async () => {
  viewer = new Cesium.Viewer("cesiumContainer", {
    animation:false,
    timeline:false,
    baseLayerPicker:false
  });

  try {
    const tiles = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(tiles);
  } catch {}

  if (new URLSearchParams(location.search).get("return") === "true") {
    setTimeout(restoreState, 500);
  } else {
    // initial empty snapshot
    pushHistory();
  }

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((e)=>{
    if (!drawing) return;
    const p = viewer.scene.pickPosition(e.position);
    if (!p) return;

    if (positions.length>=3 &&
        Cesium.Cartesian3.distance(p,positions[0])<1.5){
      finishBoundary();
      return;
    }
    positions.push(p);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  client = new Paho.Client("localhost",9001,"web_"+Math.random());
  client.onMessageArrived = (msg)=>{
    const data = JSON.parse(msg.payloadString);
    if (msg.destinationName==="solar/response/analyze"){
      hideOverlay();
      saveState();
      location.href=`/display.html?file=${data.file}&t=${Date.now()}`;
    }
  };
  client.connect({
    onSuccess(){
      client.subscribe("solar/response/analyze");
    }
  });
});

// =============================
// Draw
// =============================
window.startDrawBoundary = ()=>{
  drawing=true;
  positions=[];
  polylineEntity = viewer.entities.add({
    polyline:{
      positions:new Cesium.CallbackProperty(()=>positions,false),
      width:3,
      material:Cesium.Color.YELLOW
    }
  });
};

function finishBoundary(){
  drawing=false;
  const poly = viewer.entities.add({
    polygon:{
      hierarchy:positions.slice(),
      material:Cesium.Color.CYAN.withAlpha(0.4),
      outline:true
    }
  });
  boundaries.push(positions.slice());
  polygonEntities.push(poly);
  viewer.entities.remove(polylineEntity);
  polylineEntity=null;
  positions=[];
  // push to history after a new region is finalized
  pushHistory();
}

window.analyzeBoundary = ()=>{
  if (!boundaries.length) return alert("draw first");
  showOverlay();
  saveState();
  const sets = boundaries.map(b=>b.map(p=>[p.x,p.y,p.z]));
  const msg = new Paho.Message(JSON.stringify({sets}));
  msg.destinationName="solar/request/analyze";
  client.send(msg);
};

window.resetBoundaries = ()=>{
  boundaries=[];
  positions=[];
  polygonEntities.forEach(e=>viewer.entities.remove(e));
  polygonEntities=[];
  sessionStorage.removeItem(STATE_KEY);
  // push empty state to history
  pushHistory();
};

