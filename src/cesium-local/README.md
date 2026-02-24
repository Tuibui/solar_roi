# Solar ROI Calculator

A web application for calculating the return on investment of rooftop solar panel installations.

## What it does

1. Search any address on a Google Photorealistic 3D map
2. Draw roof polygons directly on the building
3. Place solar panels on the roof
4. Get real solar irradiation data (PVGIS, European Commission)
5. See ROI calculations: payback period, annual savings, cumulative cashflow
6. Export a PDF report

## Quick Start (Development)

```bash
cd cesium-local

# Create virtual environment
python3 -m venv backend/venv
source backend/venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Configure
cp .env.example .env
# Edit .env and add your GOOGLE_MAPS_API_KEY

# Run
flask --app backend run --debug
# → http://localhost:5000
```

## Documentation

| File | Contents |
|---|---|
| [docs/SYSTEM.md](docs/SYSTEM.md) | Architecture overview, all modules, data flow |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, migrations, SQLite→PostgreSQL guide |
| [docs/API.md](docs/API.md) | Complete API endpoint reference |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting guide (Gunicorn, Nginx, Docker, Render) |

## Tech Stack

- **Backend:** Python / Flask / SQLAlchemy / Flask-Migrate
- **Frontend:** Vanilla JS / CesiumJS / Three.js / Chart.js
- **Solar data:** PVGIS API (free, no key needed)
- **Maps:** Google Maps JavaScript API + Photorealistic 3D Tiles
- **Database:** SQLite (dev) / PostgreSQL (prod)

## Project Structure

```
cesium-local/
├── backend/          # Flask app (Python)
├── static/           # Frontend assets (CSS, JS, images)
├── templates/        # HTML templates (app, calculate, login, register)
├── docs/             # Documentation
├── .env.example      # Environment variable template
└── README.md         # This file
```
