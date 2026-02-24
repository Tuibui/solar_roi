# Solar ROI Calculator — Database Guide

---

## Overview

The app uses **SQLAlchemy** as the ORM and **Flask-Migrate** (Alembic) for schema migrations.

| Environment | Database | Config |
|---|---|---|
| Development | SQLite (`backend/solar.db`) | Default, no setup needed |
| Production | PostgreSQL | Set `DATABASE_URL` env var |

---

## Schema

### `users` table

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key, auto-increment |
| username | VARCHAR(80) | Unique, not null |
| email | VARCHAR(120) | Unique, not null |
| password_hash | VARCHAR(256) | Werkzeug `generate_password_hash` |
| created_at | DATETIME | Auto-set on insert |
| updated_at | DATETIME | Auto-set on insert, auto-updated |

### `projects` table

| Column | Type | Default | Notes |
|---|---|---|---|
| id | INTEGER | — | Primary key |
| user_id | INTEGER | — | FK → users.id (cascade delete) |
| name | VARCHAR(200) | — | Project name |
| latitude | FLOAT | NULL | Location |
| longitude | FLOAT | NULL | Location |
| address | VARCHAR(500) | NULL | Human-readable address |
| shading_method | VARCHAR(20) | 'ratio' | 'ratio' or 'level' |
| shading_ratio | FLOAT | 0.8 | 0.0–1.0 usable area fraction |
| shading_level | VARCHAR(20) | NULL | 'low', 'medium', 'high' |
| monthly_kwh | FLOAT | NULL | Electricity bill in kWh/month |
| annual_kwh | FLOAT | NULL | Electricity bill in kWh/year |
| tariff_price | FLOAT | 4.5 | Price per kWh |
| tariff_currency | VARCHAR(10) | 'THB' | Currency code |
| grid_export_allowed | BOOLEAN | True | Can sell power back to grid |
| grid_export_price | FLOAT | NULL | Feed-in tariff (price/kWh) |
| system_type | VARCHAR(20) | 'auto' | 'auto', 'ongrid', 'hybrid' |
| selected_roof_index | INTEGER | 0 | Which roof to calculate for |
| capture_image_path | VARCHAR(300) | NULL | Path to map screenshot |
| capture_model_path | VARCHAR(300) | NULL | Path to 3D model screenshot |
| inverters_json | TEXT | NULL | JSON array of inverter objects |
| batteries_json | TEXT | NULL | JSON array of battery objects |
| created_at | DATETIME | — | Auto-set |
| updated_at | DATETIME | — | Auto-updated |

### `roofs` table

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| project_id | INTEGER | FK → projects.id (cascade delete) |
| index | INTEGER | Roof plane index within project (0-based) |
| tilt | FLOAT | Degrees from horizontal (computed) |
| azimuth | FLOAT | Degrees from North (computed) |
| area | FLOAT | Square meters (computed) |
| panel_width | FLOAT | Panel width in meters |
| panel_height | FLOAT | Panel height in meters |
| panel_area | FLOAT | Panel area in m² |
| color_name | VARCHAR(20) | Color label ('blue', 'red', etc.) |
| is_flat | BOOLEAN | True if roof tilt < threshold |
| needs_user_input | BOOLEAN | True if azimuth could not be determined |
| user_tilt | FLOAT | User-overridden tilt (NULL = use computed) |
| user_azimuth | FLOAT | User-overridden azimuth (NULL = use computed) |
| polygon_json | TEXT | JSON array of {lat, lon, height} objects |
| created_at | DATETIME | Auto-set |

**Note:** `polygon_json` stores the original lat/lon/height coordinates from the Cesium drawing. The backend converts these to ECEF coordinates when building the GLB model.

### `appliances` table

| Column | Type | Default | Notes |
|---|---|---|---|
| id | INTEGER | — | Primary key |
| project_id | INTEGER | — | FK → projects.id (cascade delete) |
| name | VARCHAR(100) | — | Appliance name |
| power | FLOAT | — | Watts |
| quantity | INTEGER | 1 | Count |
| usage_start | VARCHAR(5) | '06:00' | HH:MM format |
| usage_end | VARCHAR(5) | '22:00' | HH:MM format |
| created_at | DATETIME | — | Auto-set |

**Computed property `hours`:** Automatically calculated from `usage_start` and `usage_end`, handles midnight wrap-around.

---

## Entity Relationships

```
users (1) ──< projects (N)
               │
               ├──< roofs (N)
               └──< appliances (N)
```

All relationships use `cascade='all, delete-orphan'` — deleting a project deletes all its roofs and appliances automatically.

---

## Setting Up the Database

### Development (SQLite)

No setup needed. The database file is created automatically at `backend/solar.db` on first run.

```bash
cd cesium-local
source backend/venv/bin/activate
flask --app backend run --debug
# solar.db is auto-created via db.create_all() in create_app()
```

### Production (PostgreSQL)

**Step 1: Install PostgreSQL and create a database**

```bash
# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE solar_roi;
CREATE USER solar_user WITH PASSWORD 'your-strong-password';
GRANT ALL PRIVILEGES ON DATABASE solar_roi TO solar_user;
\q
```

**Step 2: Set environment variable**

In your `.env` file:
```
DATABASE_URL=postgresql://solar_user:your-strong-password@localhost:5432/solar_roi
```

Or in your hosting platform's environment variables (Render, Railway, Heroku, etc.).

**Step 3: Run migrations**

```bash
cd cesium-local
source backend/venv/bin/activate
export FLASK_APP=backend

# First time only — creates migrations/ folder
flask db init

# Generate migration from current models
flask db migrate -m "initial schema"

# Apply to database
flask db upgrade
```

---

## Migrations Workflow

Flask-Migrate (Alembic) tracks schema changes through Python migration scripts.

### When you change a model

1. Edit `backend/models.py` (add/remove/change a column)
2. Generate a migration:
   ```bash
   flask db migrate -m "add new_column to projects"
   ```
3. Review the generated file in `migrations/versions/`
4. Apply it:
   ```bash
   flask db upgrade
   ```

### Common migration commands

```bash
# See current migration status
flask db current

# See all migration history
flask db history

# Upgrade to latest
flask db upgrade

# Downgrade one step (undo last migration)
flask db downgrade

# Downgrade to a specific revision
flask db downgrade <revision_id>
```

### Migrating from SQLite to PostgreSQL

If you have data in the SQLite dev database that you want to move to PostgreSQL:

```bash
# 1. Export from SQLite
sqlite3 backend/solar.db .dump > dump.sql

# 2. Clean up SQL (SQLite has some incompatible syntax)
# The easiest approach for small datasets: export as CSV and re-import

# 3. Or use a tool like pgloader:
pgloader sqlite:///backend/solar.db postgresql://solar_user:pass@localhost/solar_roi
```

For a fresh start in production, just run `flask db upgrade` to create empty tables and register users normally through the UI.

---

## Backup

### SQLite (development)

```bash
# Simple file copy
cp backend/solar.db backend/solar.db.backup-$(date +%Y%m%d)
```

### PostgreSQL (production)

```bash
# Backup
pg_dump -U solar_user solar_roi > backup-$(date +%Y%m%d).sql

# Restore
psql -U solar_user solar_roi < backup-20250101.sql
```

---

## Data Format Notes

### `polygon_json` field

Each roof's polygon is stored as a JSON array. Points use lat/lon/height (WGS-84):

```json
[
  {"lat": 13.7563, "lon": 100.5018, "height": 15.3},
  {"lat": 13.7564, "lon": 100.5019, "height": 15.3},
  {"lat": 13.7565, "lon": 100.5018, "height": 15.5}
]
```

**Historical note:** Early versions stored points as ECEF `{x, y, z}` objects. The route `GET /api/projects/{id}/model` handles both formats transparently.

### `inverters_json` / `batteries_json` fields

Stored as JSON arrays of equipment objects from the UI. Example:
```json
[
  {"brand": "Fronius", "model": "Symo 5.0-3", "power_kw": 5.0}
]
```

---

## Reset Development Database

If you need a clean slate during development:

```bash
rm backend/solar.db
flask --app backend run --debug
# db.create_all() recreates all tables on startup
```
