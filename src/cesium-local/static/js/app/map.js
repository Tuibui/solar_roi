// Map Module - Cesium viewer initialization and camera controls

let viewer = null;
let osmBuildings = null;
let osmBuildingsReady = null;
let googleTiles = null;

async function initMap() {
  Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_TOKEN;

  viewer = new Cesium.Viewer("wizardCesiumContainer", {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false
  });

  // Fine zoom control
  const controller = viewer.scene.screenSpaceCameraController;
  controller.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH
  ];
  controller._zoomFactor = 1;

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 20, 30000000)
  });

  // Load Google 3D tiles
  try {
    googleTiles = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(googleTiles);
  } catch(e) {
    console.error("Failed to load 3D tiles:", e);
  }

  return viewer;
}

function getViewer() {
  return viewer;
}

async function ensureOsmBuildings() {
  if (!viewer) return null;
  if (osmBuildingsReady) return osmBuildingsReady;

  osmBuildingsReady = (async () => {
    if (osmBuildings) return osmBuildings;
    try {
      if (typeof Cesium.createOsmBuildings === 'function') {
        osmBuildings = await Cesium.createOsmBuildings();
      } else {
        osmBuildings = await Cesium.Cesium3DTileset.fromIonAssetId(96188, {
          show: true
        });
        await osmBuildings.readyPromise;
      }

      viewer.scene.primitives.add(osmBuildings);
      osmBuildings.style = new Cesium.Cesium3DTileStyle({
        color: 'rgba(255, 255, 255, 0.01)'
      });

      return osmBuildings;
    } catch (e) {
      console.warn('Failed to load OSM buildings:', e);
      osmBuildings = null;
      return null;
    }
  })();

  return osmBuildingsReady;
}

function getOsmBuildings() {
  return osmBuildings;
}

function getGoogleTiles() {
  return googleTiles;
}

// Fly to location
function flyToLocation(destination, name) {
  if (!viewer) return;

  let dest;
  if (destination.type === 'rectangle') {
    dest = new Cesium.Rectangle(
      destination.west,
      destination.south,
      destination.east,
      destination.north
    );
  } else {
    dest = Cesium.Cartesian3.fromDegrees(
      destination.lon,
      destination.lat,
      destination.height || 500
    );
  }

  viewer.camera.flyTo({
    destination: dest,
    duration: 2,
    complete: () => {
      setStatus("Viewing: " + name.substring(0, 20), "#0f0");
    }
  });
}

// Get bounding sphere for roofs
function getRoofBoundingSphere(boundaries) {
  if (!boundaries.length) return null;
  const pts = [];
  boundaries.forEach(b => b.forEach(p => pts.push(p)));
  return Cesium.BoundingSphere.fromPoints(pts);
}

function zoomToRoofs(boundaries) {
  const bs = getRoofBoundingSphere(boundaries);
  if (!bs || !viewer) return;
  viewer.camera.flyToBoundingSphere(bs, { duration: 0.8 });
}
