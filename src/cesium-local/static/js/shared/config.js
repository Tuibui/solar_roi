// Global Configuration
const CONFIG = {
  // Always use current origin — on Render, frontend & backend are the same service
  API_BASE: window.location.origin,
  CESIUM_TOKEN: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3ZjlhYmYzYy01NjEzLTQwYzQtODZhZS1iODkzNzY0Yzc5ZTUiLCJpZCI6MzY1MjY5LCJpYXQiOjE3NzEwNjg1NDJ9.hdXdQ2lEfBO7KZGgWCIT-CQeXvswa5Jt218h1vQuIGY",
  STATE_KEY: "cesium_state"
};

// Roof colors matching backend palette
const ROOF_COLORS = [
  { name: "Red", cesium: Cesium.Color.RED },
  { name: "Green", cesium: Cesium.Color.LIME },
  { name: "Blue", cesium: Cesium.Color.BLUE },
  { name: "Yellow", cesium: Cesium.Color.YELLOW },
  { name: "Magenta", cesium: Cesium.Color.MAGENTA },
  { name: "Cyan", cesium: Cesium.Color.CYAN }
];

// Preset appliances
const PRESET_APPLIANCES = {
  'led': { name: 'LED Light', watts: 10 },
  'fan': { name: 'Ceiling Fan', watts: 75 },
  'fridge': { name: 'Refrigerator', watts: 150 },
  'tv': { name: 'TV', watts: 120 },
  'laptop': { name: 'Laptop', watts: 65 },
  'desktop': { name: 'Desktop PC', watts: 250 },
  'ac': { name: 'Air Conditioner 9000BTU', watts: 900 },
  'washing': { name: 'Washing Machine', watts: 500 },
  'microwave': { name: 'Microwave', watts: 1000 },
  'pump': { name: 'Water Pump', watts: 750 }
};
