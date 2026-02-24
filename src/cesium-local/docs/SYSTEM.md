# Solar ROI Calculator — System Architecture

> **Audience:** Developer taking over this project. Read this document first.
> **Last updated:** 2025

---

## Overview

Solar ROI Calculator is a web application that lets users:
1. Search for any address on a 3D map (powered by Google Maps Photorealistic 3D Tiles)
2. Draw roof polygons on top of the building
3. Place solar panels on those polygons
4. Compute real solar irradiation data from the PVGIS API (European Commission)
5. Calculate ROI, payback period, bill savings, and export a PDF report

**Tech Stack:**

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ORM | Flask-SQLAlchemy + Flask-Migrate (Alembic) |
| Frontend | HTML + Vanilla JS |
| 3D Map | CesiumJS + Google Photorealistic 3D Tiles |
| 3D Model | Three.js (loads GLB files from backend) |
| Charts | Chart.js |
| Solar Data | PVGIS API (European Commission, free, no key needed) |

---

## Directory Structure

```
cesium-local/
├── backend/                    # Flask application package
│   ├── __init__.py             # App factory: create_app()
│   ├── config.py               # All config vars (reads from .env)
│   ├── extensions.py           # db, migrate instances
│   ├── models.py               # SQLAlchemy models: User, Project, Roof, Appliance
│   ├── irradiation.py          # PVGIS API integration
│   ├── sizing.py               # PV system sizing calculations (pure Python)
│   ├── server.py               # Dev entrypoint (calls create_app)
│   ├── routes/
│   │   ├── __init__.py         # register_blueprints()
│   │   ├── auth.py             # /api/auth/register, /api/auth/login
│   │   ├── projects.py         # /api/projects CRUD + model/irradiation/sizing
│   │   ├── system.py           # /api/analyze, /api/roof-info, /health
│   │   └── pages.py            # HTML page routes (/, /calculate)
│   ├── services/
│   │   ├── geometry.py         # ECEF/ENU math, tilt/azimuth, mesh analysis
│   │   ├── mesh_builder.py     # GLB file generation from roof polygons
│   │   └── storage.py          # roof_stats.json read/write
│   ├── static/                 # Backend-generated files (gitignored)
│   │   ├── roof_model.glb      # Fresh-analysis 3D model (overwritten each time)
│   │   ├── roof_stats.json     # Fresh-analysis stats cache
│   │   └── project_N_roof_model_lite.glb   # Per-project GLB cache
│   ├── migrations/             # Flask-Migrate (Alembic) migration scripts
│   ├── requirements.txt
│   └── venv/                   # Python virtual environment (gitignored)
│
├── static/                     # Frontend static assets (served by Flask)
│   ├── css/
│   │   ├── base.css            # Global styles, variables, layout
│   │   ├── split-view.css      # Split map + 3D view styles
│   │   └── wizard.css          # Wizard sidebar styles
│   ├── js/
│   │   ├── app/
│   │   │   ├── main.js         # App entry point, orchestrator
│   │   │   ├── wizard.js       # Wizard state machine (step 1-5)
│   │   │   ├── draw.js         # Cesium polygon drawing (boundaries[])
│   │   │   ├── map.js          # CesiumJS viewer init
│   │   │   ├── panel-placer.js # Solar panel placement on 3D model
│   │   │   ├── project-tree.js # Left sidebar: project/roof/panel tree
│   │   │   ├── inputs.js       # Appliance inputs, bill input
│   │   │   ├── shading-controller.js  # Shading orchestration
│   │   │   ├── shading-engine.js      # Shading ray-cast calculations
│   │   │   ├── shading-visualizer.js  # Scatter plot rendering
│   │   │   ├── roof-sampler.js        # Sample points on roof surface
│   │   │   ├── api.js          # fetch() wrappers for backend endpoints
│   │   │   └── search.js       # Google Maps address search
│   │   └── shared/
│   │       └── utils.js        # Shared utility functions
│   ├── images/                 # Logo images
│   ├── captures/               # User screenshots (gitignored)
│   └── models/                 # (unused folder)
│
├── templates/
│   ├── app.html                # Main app page (3D map + wizard)
│   ├── calculate.html          # Results/ROI page
│   ├── login.html              # Login page
│   └── register.html           # Registration page
│
├── docs/                       # This documentation
│   ├── SYSTEM.md               # (this file) Architecture overview
│   ├── DATABASE.md             # DB schema + migration guide
│   ├── API.md                  # API endpoint reference
│   └── DEPLOYMENT.md           # Hosting guide
│
├── .env.example                # Template for environment variables
├── .gitignore
└── PROJECT_STATE.md            # Session-by-session development log
```

---

## Application Flow

### 1. Fresh Analysis (New Project)

```
User opens app.html
  → Searches address (Google Places API)
  → CesiumJS 3D map loads at that location
  → User draws roof polygons on 3D tiles (draw.js)
  → Clicks "Analyze Roof"

Frontend: POST /api/analyze
  → body: { roofs: [[{x,y,z}...], ...], params: {...} }
  → Backend: build_glb_from_roofs() generates roof_model.glb
  → Returns: { success, file, stats: { roofs: [{tilt, azimuth, area, ...}] } }

Frontend: showSplitView()
  → Left: CesiumJS map stays visible
  → Right: Three.js loads /backend/static/roof_model.glb
  → Shading scatter runs on all roofs (shading-controller.js)
  → User places panels (panel-placer.js)
  → Wizard collects: appliances, electricity bill, tariff, system settings

User clicks "Calculate"
  → Saves project: POST /api/projects (creates Project + Roofs + Appliances in DB)
  → Redirects to /calculate?project_id=N
```

### 2. Loading a Saved Project

```
User opens "My Projects" modal
  → GET /api/projects?user_id=N
  → User clicks a project card

Frontend: applyDatasetToWorkspace(dataset)
  → Restores wizard.roofs[] and boundaries[] (for Cesium polygon overlays)
  → Sets window.pendingScatter = { mode: 'all', ... }
  → Calls showSplitView()

initSplitViewer()
  → Primary URL: /api/projects/{pid}/model?lite=1
    (This API generates GLB on-demand from DB roof polygons, caches as project_{N}_roof_model_lite.glb)
  → After GLB loads, model-loaded callback checks window.pendingScatter
  → Runs shading for all roofs automatically
```

### 3. Calculate / Results Page

```
/calculate?project_id=N

Page loads → GET /api/projects/{N}
  → Fetches project + roofs + appliances

Computes ROI locally using JS:
  → Monthly solar production from /api/projects/{N}/pvoutput?system_kwp=X
  → Monthly bill baseline from tariff × monthly_kwh
  → Savings = avoided import + export revenue
  → Cumulative cashflow over 25 years
  → Payback year = where cumulative cashflow > 0

Renders 4 Chart.js charts:
  1. Cumulative Cashflow (line)
  2. Monthly Bill Comparison (bar, before/after)
  3. Monthly Energy (bar, self-consumed vs exported)
  4. Self-Consumption Ratio (doughnut)
```

---

## Key JavaScript Modules

### `main.js`
Central orchestrator. Exports functions used by all other modules. Key functions:

| Function | Purpose |
|---|---|
| `onAnalyzeRoof()` | Sends drawn polygons to /api/analyze, shows split view |
| `showSplitView()` | Splits screen into map + 3D viewer |
| `initSplitViewer()` | Loads GLB into Three.js, triggers shading |
| `applyDatasetToWorkspace()` | Restores saved project into workspace |
| `startPanelPlacement(data)` | Enters panel placement mode for a roof |
| `refreshLivePrice()` | Recalculates live price estimate in sidebar |
| `saveAndCalculate()` | POSTs project to DB, redirects to /calculate |

### `wizard.js`
Step-by-step sidebar UI (5 steps). Owns:
- `wizard.roofs[]` — array of roof objects with tilt, azimuth, area, panels[]
- `wizard.sessionData` — persisted to `localStorage` (project ID, location, step)
- `wizard.setRoofs(roofs)` — sets roof data and updates UI
- Step navigation: `goNext()`, `goPrev()`

### `draw.js`
Manages Cesium polygon drawing. Key state:
- `boundaries[]` — array of polygon point arrays (ECEF coordinates `{x,y,z}`)
- `polygonEntities[]` — Cesium entities displayed on the map
- `restoreBoundaries(polygons)` — repopulates boundaries + entities when loading saved project

### `panel-placer.js`
State machine for placing panels on the 3D roof model:

| State | Meaning |
|---|---|
| `IDLE` | No roof selected |
| `SKETCH` | User is placing panels on a specific roof face |
| `DONE` | Panels placed, review mode |

Key methods:
- `enterSketchForRoof(roofIndex)` — MUST be called before autoPlacePanels()
- `autoPlacePanels(count)` — fills roof face with N panels automatically
- `finishSketch()` — locks in placed panels, emits onFinish
- `onPanelsChanged` — callback fired whenever panels count changes (used for live price)

### `shading-controller.js`
Orchestrates the shading simulation:
- Calls `roof-sampler.js` to get sample points on each roof face
- Calls `shading-engine.js` to ray-cast against the 3D model
- Calls `shading-visualizer.js` to render colored scatter dots

**Important:** `window.pendingScatter` is a signal object checked after GLB loads:
```js
window.pendingScatter = {
  mode: 'all',           // 'all' = run for all roofs, 'single' = one roof
  waitForShading: true,
  finishOverlay: false,
  finalOnly: true
}
```

---

## Backend Modules

### `irradiation.py`
Calls PVGIS API (free, European Commission solar data):
- `compute_monthly_poa_irradiation(lat, lon, tilt, azimuth)` → monthly kWh/m²
- `compute_multi_roof_irradiation(lat, lon, roofs)` → area-weighted average across all roofs
- `compute_multi_roof_pv_output(lat, lon, roofs, total_kwp)` → monthly kWh output for a given system size
- Results are `@lru_cache`d to avoid repeated API calls during a session

**Azimuth convention:**
- App uses 0°=North, 90°=East, 180°=South, 270°=West (geographic)
- PVGIS uses 0°=South, -90°=East, 90°=West (must convert before sending)

### `sizing.py`
Pure Python, no Flask:
- `compute_daytime_consumption(appliances)` → how many kWh used during daylight hours
- `compute_system_sizing(daytime_kwh, peak_sun_hours, area)` → how many panels needed
- Panel specs built-in: 400W, 450W, 500W, 550W options

### `services/geometry.py`
Mathematical helpers:
- `latlon_to_ecef()` / `ecef_to_latlon()` — WGS-84 coordinate conversions
- `ecef_to_enu()` — ECEF to local East-North-Up coordinates
- `analyze_roof_ecef(vertices)` — computes tilt, azimuth, area from 3D polygon
- `correct_opposite_roofs(roofs)` — fixes symmetrical roof pairs that get wrong azimuths

### `services/mesh_builder.py`
Generates GLB (binary GLTF) 3D models using `trimesh`:
- `build_glb_from_roofs(roof_polygons, output_path)` — creates a solid roof model
- Used by both `/api/analyze` (fresh draw) and `/api/projects/{id}/model` (saved project)

---

## Authentication

Currently **no session management** — login returns a user dict which is stored in `localStorage`. The `user_id` is passed as a query parameter to `/api/projects`. This is **not secure** for production — a future improvement would add JWT tokens or Flask-Login sessions.

---

## Data Storage

### Fresh analysis (temporary)
- `backend/static/roof_model.glb` — overwritten each time user clicks "Analyze"
- `backend/static/roof_stats.json` — overwritten each time, contains roof array

### Saved projects (persistent)
- PostgreSQL / SQLite database (via SQLAlchemy)
- Roof polygons stored as JSON text in `roofs.polygon_json`
- Per-project GLB cached at `backend/static/project_{N}_roof_model_lite.glb`
- Capture screenshots at `static/captures/project_{N}_roof.png`

---

## External Services

| Service | Purpose | Key Required |
|---|---|---|
| Google Maps JavaScript API | Address search (Places), 3D Tiles | Yes — `GOOGLE_MAPS_API_KEY` |
| CesiumJS | 3D tile rendering engine | Optional — `CESIUM_ION_TOKEN` |
| PVGIS API | Solar irradiation data | No — completely free |

---

## Known Limitations / Future Work

1. **Authentication security** — user_id in query param is not safe for production; add JWT
2. **No rate limiting** — PVGIS requests are cached per-process but not across restarts
3. **Fresh-analysis state is shared** — `roof_model.glb` and `roof_stats.json` are global files; concurrent users overwrite each other. Fix: use per-session temp files
4. **Manual roof input** — if user's roof is flat or detection fails, user must enter tilt/azimuth manually
5. **No battery simulation** — battery economics not yet calculated despite "BATTERY" folder in UI
6. **No real inverter selection** — inverter folder UI exists but no actual sizing logic tied to it
