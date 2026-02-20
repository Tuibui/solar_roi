# Solar ROI

A web-based 3D visualization tool for evaluating solar panel installation potential on building roofs.

## Features

- **3D Roof Visualization** - Interactive roof boundary drawing using CesiumJS with Google Photorealistic 3D Tiles
- **Roof Analysis** - Automatic calculation of tilt angle and azimuth (compass direction)
- **3D Model Export** - Generate GLB models for detailed roof inspection
- **Solar Data Calculation** - NASA POWER API integration for location-based solar irradiance estimates

## Project Structure

```
solar/
├── src/
│   ├── cesium-local/          # Main web application
│   │   ├── index.html         # Main entry point
│   │   ├── display.html       # 3D model viewer
│   │   ├── analyze.html       # Analysis page
│   │   ├── js/                # Frontend JavaScript
│   │   ├── backend/           # Python Flask server
│   │   │   ├── server.py      # API endpoints
│   │   │   └── venv/          # Python virtual environment
│   │   └── Build/             # CesiumJS library
│   ├── cal.py                 # Solar irradiance calculations
│   ├── cal_fix.py             # Solar calculation utilities
│   ├── dataset/               # Roof images
│   ├── dataset_grid/          # Satellite/street view images
│   ├── image_set/             # Additional images
│   └── solar_data_inputs/     # NASA solar data (CSV)
└── README.md
```

## Quick Start

1. **Start the backend server:**
   ```bash
   cd src/cesium-local/backend
   source venv/bin/activate
   python server.py
   ```

2. **Open in browser:**
   - Navigate to `src/cesium-local/index.html`
   - Or serve with a local web server

## Tech Stack

- **Frontend:** CesiumJS, JavaScript, Google Model Viewer
- **Backend:** Python, Flask, NumPy, Trimesh
- **APIs:** Google Maps, NASA POWER, Cesium Ion
