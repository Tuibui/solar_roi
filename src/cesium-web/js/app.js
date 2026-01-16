// Grant CesiumJS access to your ion assets
Cesium.Ion.defaultAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0MWY4YWEzZC02OTI0LTRiZDctODc0OC1iYWE5ZDdiMjdmNTkiLCJpZCI6MzY1MjY5LCJpYXQiOjE3NjQ1MjA0OTV9.w8J63dbPhcq59f9ESVTXfp7qKFFu3Sy8Ef8Gi2TXnDg";

const viewer = new Cesium.Viewer("cesiumContainer", {
  // This is a global 3D Tiles tileset so disable the
  // globe to prevent it from interfering with the data
  globe: false,
  // Disabling the globe means we need to manually
  // re-enable the atmosphere
  skyAtmosphere: new Cesium.SkyAtmosphere(),
  // 2D and Columbus View are not currently supported
  // for global 3D Tiles tilesets
  sceneModePicker: false,
  // Imagery layers are not currently supported for
  // global 3D Tiles tilesets
  baseLayerPicker: false,
  // Use the Google geocoder instead of Bing
  geocoder: Cesium.IonGeocodeProviderType.GOOGLE,
});

try {
  const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207);
  viewer.scene.primitives.add(tileset);
} catch (error) {
  console.log(error);
}

