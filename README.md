# Solar ROI Calculator (SunScope)

A web application for calculating the return on investment of rooftop solar panel installations using interactive 3D mapping.

## Features

- **3D Roof Drawing** - Draw roof polygons directly on Google Photorealistic 3D Tiles via CesiumJS
- **Panel Placement** - Place and arrange solar panels on roofs with a 3D CAD-style interface (ghost placement, rotate, move gizmo)
- **Shading Analysis** - Ray-cast shading simulation against Google 3D tiles
- **Solar Irradiance Data** - PVGIS API integration (European Commission, free, no key needed)
- **ROI Calculations** - Payback period, annual savings, cumulative cashflow charts
- **Equipment Catalogs** - Inverter and battery selection from demo catalogs
- **User Auth** - Register / login with per-user project storage (SQLite dev / PostgreSQL prod)

## Project Structure

```
solar_roi/
├── src/
│   ├── cesium-local/              # Main web application
│   │   ├── backend/               # Python Flask server
│   │   │   ├── __init__.py        # App factory
│   │   │   ├── config.py          # Config (env vars, paths)
│   │   │   ├── extensions.py      # SQLAlchemy, Migrate instances
│   │   │   ├── models.py          # Database models
│   │   │   ├── irradiation.py     # Solar irradiation calculations
│   │   │   ├── sizing.py          # System sizing logic
│   │   │   ├── routes/            # Flask route blueprints
│   │   │   │   ├── auth.py        # Login / register / logout
│   │   │   │   ├── pages.py       # HTML page routes
│   │   │   │   ├── projects.py    # Project CRUD API
│   │   │   │   └── system.py      # System / health endpoints
│   │   │   ├── services/          # Business logic
│   │   │   │   ├── geometry.py    # Roof geometry calculations
│   │   │   │   ├── mesh_builder.py # GLB model generation (Trimesh)
│   │   │   │   └── storage.py     # File storage helpers
│   │   │   ├── requirements.txt   # Python dependencies
│   │   │   └── solar.db           # SQLite dev database
│   │   ├── templates/             # HTML templates (Jinja2)
│   │   │   ├── app.html           # Main workspace (3D map + split view)
│   │   │   ├── calculate.html     # ROI results + charts
│   │   │   ├── login.html         # Login page
│   │   │   └── register.html      # Registration page
│   │   ├── static/
│   │   │   ├── js/
│   │   │   │   ├── app/           # Application JS modules
│   │   │   │   │   ├── main.js        # UI controllers + state (UIState)
│   │   │   │   │   ├── map.js         # CesiumJS init + Google tiles
│   │   │   │   │   ├── draw.js        # Roof drawing + undo/redo
│   │   │   │   │   ├── search.js      # Address search
│   │   │   │   │   ├── wizard.js      # Workflow state management
│   │   │   │   │   ├── project-tree.js # SolidWorks-style feature tree
│   │   │   │   │   ├── panel-placer.js # Panel placement state machine
│   │   │   │   │   ├── inputs.js      # Input handlers
│   │   │   │   │   ├── api.js         # Backend API calls
│   │   │   │   │   ├── shading-engine.js     # Ray-cast shading engine
│   │   │   │   │   ├── shading-controller.js # Monthly shading orchestrator
│   │   │   │   │   ├── shading-visualizer.js # Heatmap visualization
│   │   │   │   │   └── roof-sampler.js       # Roof surface sampling
│   │   │   │   └── shared/        # Shared utilities
│   │   │   │       ├── config.js
│   │   │   │       └── utils.js
│   │   │   ├── css/               # Stylesheets
│   │   │   │   ├── base.css       # Variables + resets
│   │   │   │   ├── app.css        # App-specific styles
│   │   │   │   ├── split-view.css # Split layout + tree + dock
│   │   │   │   ├── wizard.css     # Wizard UI
│   │   │   │   ├── calculate.css  # Results page
│   │   │   │   └── auth.css       # Login/register pages
│   │   │   └── models/            # GLB panel assets
│   │   ├── migrations/            # Flask-Migrate (Alembic) migrations
│   │   ├── docs/                  # Documentation
│   │   │   ├── API.md             # API endpoint reference
│   │   │   ├── DATABASE.md        # Schema + migration guide
│   │   │   ├── DEPLOYMENT.md      # Hosting guide
│   │   │   └── SYSTEM.md          # Architecture overview
│   │   ├── .env.example           # Environment variable template
│   │   └── Build/                 # CesiumJS library
│   ├── cal_fix.py                 # Solar calculation utilities
│   └── solar_data_inputs/         # Solar irradiance CSV data
│       ├── GHI.csv
│       ├── DNI.csv
│       ├── DHI.csv
│       └── ...
├── PROJECT_STATE.md               # Detailed session-by-session dev log
├── CALCULATIONS.md                # Solar calculation methodology
└── README.md
```

## Quick Start (Development)

```bash
cd src/cesium-local

# Create virtual environment
python3 -m venv backend/venv
source backend/venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — add GOOGLE_MAPS_API_KEY (required) and CESIUM_ION_TOKEN

# Run database migrations
flask --app backend db upgrade

# Start the server
flask --app backend run --debug
# → http://localhost:5000
```

## Documentation

| File | Contents |
|---|---|
| [src/cesium-local/docs/SYSTEM.md](src/cesium-local/docs/SYSTEM.md) | Architecture overview, modules, data flow |
| [src/cesium-local/docs/DATABASE.md](src/cesium-local/docs/DATABASE.md) | Schema, migrations, SQLite → PostgreSQL |
| [src/cesium-local/docs/API.md](src/cesium-local/docs/API.md) | Complete API endpoint reference |
| [src/cesium-local/docs/DEPLOYMENT.md](src/cesium-local/docs/DEPLOYMENT.md) | Gunicorn, Nginx, Docker, Render |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Dev session log, known issues, UI state |
| [CALCULATIONS.md](CALCULATIONS.md) | Solar calculation methodology |

## Tech Stack

- **Backend:** Python / Flask / SQLAlchemy / Flask-Migrate
- **Frontend:** Vanilla JS / CesiumJS / Three.js / Chart.js
- **3D Pipeline:** Draw on CesiumJS → Flask generates GLB (Trimesh) → Three.js displays
- **Solar data:** PVGIS API (European Commission, free, no API key needed)
- **Maps:** Google Maps JavaScript API + Photorealistic 3D Tiles
- **Database:** SQLite (dev) / PostgreSQL (prod)
