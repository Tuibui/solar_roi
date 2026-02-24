# Solar ROI Calculator — API Reference

All endpoints return JSON. Base URL is the Flask server root (e.g., `http://localhost:5000`).

---

## Authentication

### Register

**POST** `/api/auth/register`

```json
// Request body
{
  "username": "john",
  "email": "john@example.com",
  "password": "secret123"
}

// Response 201
{
  "success": true,
  "user": {
    "id": 1,
    "username": "john",
    "email": "john@example.com",
    "created_at": "2025-01-01T00:00:00"
  }
}

// Error 400
{ "error": "Username or email already exists" }
```

---

### Login

**POST** `/api/auth/login`

Accepts either `username` or `email` in the `username` field.

```json
// Request body
{
  "username": "john",   // or email address
  "password": "secret123"
}

// Response 200
{
  "success": true,
  "message": "Login successful",
  "user": { "id": 1, "username": "john", ... }
}

// Error 401
{ "error": "Invalid username or password" }
```

---

### Get User

**GET** `/api/users/{user_id}`

```json
// Response 200
{
  "id": 1,
  "username": "john",
  "email": "john@example.com",
  "created_at": "2025-01-01T00:00:00"
}
```

---

## Projects

### List Projects

**GET** `/api/projects?user_id={user_id}`

Returns all projects for a user, ordered by most recently updated first.

```json
// Response 200
{
  "projects": [
    {
      "id": 42,
      "name": "My House",
      "location": { "lat": 13.7563, "lon": 100.5018, "address": "Bangkok" },
      "shading": { "method": "ratio", "ratio": 0.8, "level": null },
      "bill": { "monthly_kwh": 300, "annual_kwh": 3600 },
      "tariff": { "price": 4.5, "currency": "THB" },
      "grid_export": { "allowed": true, "price": 2.2 },
      "system": { "type": "auto" },
      "selected_roof_index": 0,
      "capture_image_path": "/static/captures/project_42_roof.png",
      "capture_model_path": "/static/captures/project_42_model.png",
      "inverters": [],
      "batteries": [],
      "roofs": [ ... ],
      "appliances": [ ... ],
      "created_at": "2025-01-01T10:00:00",
      "updated_at": "2025-01-02T15:30:00"
    }
  ]
}
```

---

### Get Project

**GET** `/api/projects/{project_id}`

Returns full project with roofs and appliances.

```json
// Response 200 — same shape as single item in list above

// Error 404
{ "error": "Project not found" }
```

---

### Create Project

**POST** `/api/projects`

```json
// Request body (all fields except user_id and name are optional)
{
  "user_id": 1,
  "name": "My House",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "address": "Bangkok, Thailand",
  "shading_method": "ratio",
  "shading_ratio": 0.8,
  "shading_level": null,
  "monthly_kwh": 300,
  "annual_kwh": 3600,
  "tariff_price": 4.5,
  "tariff_currency": "THB",
  "grid_export_allowed": true,
  "grid_export_price": 2.2,
  "system_type": "auto",
  "selected_roof_index": 0,
  "capture_image": "data:image/png;base64,...",   // optional screenshot
  "capture_model_image": "data:image/png;base64,...",
  "inverters": [],
  "batteries": [],
  "roofs": [
    {
      "index": 0,
      "tilt": 15.5,
      "azimuth": 180.0,
      "area": 45.2,
      "panel_width": 1.134,
      "panel_height": 1.762,
      "panel_area": 2.0,
      "color_name": "blue",
      "is_flat": false,
      "needs_user_input": false,
      "user_tilt": null,
      "user_azimuth": null,
      "polygon": [
        {"lat": 13.7563, "lon": 100.5018, "height": 15.3},
        {"lat": 13.7564, "lon": 100.5019, "height": 15.3},
        {"lat": 13.7565, "lon": 100.5018, "height": 15.5}
      ]
    }
  ],
  "appliances": [
    {
      "name": "Air Conditioner",
      "power": 1200,
      "quantity": 2,
      "usage_start": "08:00",
      "usage_end": "22:00"
    }
  ]
}

// Response 201
{
  "success": true,
  "project": { ... }   // full project object
}
```

---

### Update Project

**PUT** `/api/projects/{project_id}`

Send only the fields you want to update. If `roofs` or `appliances` are included, they **replace** all existing records for that project.

```json
// Request body — all fields are optional
{
  "name": "Updated Name",
  "tariff_price": 4.72,
  "roofs": [ ... ],       // replaces all existing roofs
  "appliances": [ ... ]   // replaces all existing appliances
}

// Response 200
{
  "success": true,
  "project": { ... }
}
```

---

### Delete Project

**DELETE** `/api/projects/{project_id}`

Cascades to delete all roofs and appliances.

```json
// Response 200
{
  "success": true,
  "message": "Project deleted"
}
```

---

## Roofs

### Get Roofs for Project

**GET** `/api/projects/{project_id}/roofs`

```json
// Response 200
{
  "roofs": [
    {
      "id": 5,
      "index": 0,
      "tilt": 15.5,
      "azimuth": 180.0,
      "area": 45.2,
      "panel_width": 1.134,
      "panel_height": 1.762,
      "panel_area": 2.0,
      "color_name": "blue",
      "is_flat": false,
      "needs_user_input": false,
      "user_tilt": null,
      "user_azimuth": null,
      "polygon": [ ... ]
    }
  ]
}
```

---

### Update Roof (user overrides)

**PUT** `/api/roofs/{roof_id}`

Used to save user-entered tilt/azimuth when the automatic detection fails.

```json
// Request body
{
  "user_tilt": 20.0,
  "user_azimuth": 195.0
}

// Response 200
{
  "success": true,
  "roof": { ... }
}
```

---

## Appliances

### Get Appliances for Project

**GET** `/api/projects/{project_id}/appliances`

```json
// Response 200
{
  "appliances": [
    {
      "id": 10,
      "name": "Air Conditioner",
      "power": 1200,
      "hours": 14.0,     // computed from usage_start/end
      "quantity": 2,
      "usage_start": "08:00",
      "usage_end": "22:00"
    }
  ]
}
```

---

### Add Appliance

**POST** `/api/projects/{project_id}/appliances`

```json
// Request body
{
  "name": "Air Conditioner",
  "power": 1200,
  "quantity": 2,
  "usage_start": "08:00",
  "usage_end": "22:00"
}

// Response 201
{
  "success": true,
  "appliance": { ... }
}
```

---

### Delete Appliance

**DELETE** `/api/appliances/{appliance_id}`

```json
// Response 200
{
  "success": true,
  "message": "Appliance deleted"
}
```

---

## 3D Model

### Get Project Model (GLB)

**GET** `/api/projects/{project_id}/model`

Generates (or serves cached) a GLB 3D model file from the project's roof polygons.

**Query parameters:**

| Param | Values | Default | Description |
|---|---|---|---|
| `lite` | `0` or `1` | `0` | Lite mode: faster generation, no panel geometry |
| `refresh` | `0` or `1` | `0` | Force regeneration even if cached file exists |

```
// Response: binary GLB file
// Content-Type: model/gltf-binary

// Error 400
{ "error": "Project has no roofs" }
{ "error": "No valid roof polygons for model" }

// Error 500
{ "error": "..." }
```

**Caching:** The GLB is cached at `backend/static/project_{id}_roof_model_lite.glb`. Pass `?refresh=1` to force regeneration after editing roof polygons.

---

## Solar Calculations

### Get Irradiation Data

**GET** `/api/projects/{project_id}/irradiation`

Fetches monthly POA (Plane of Array) irradiation from PVGIS for the project location.

**Query parameters:**

| Param | Values | Default | Description |
|---|---|---|---|
| `roof_indices` | `all` or `0,1,2` | `all` | Which roofs to include |

```json
// Response 200
{
  "success": true,
  "data_source": "PVGIS",
  "aggregation_method": "area_weighted_average",
  "roof_indices": "all",
  "roof_count": 2,
  "selected_count": 2,
  "location": { "lat": 13.7563, "lon": 100.5018 },
  "monthly_kwh_m2": [100.5, 110.2, 130.8, ...],   // 12 values
  "annual_kwh_m2": 1450.3,
  "daily_avg_kwh_m2": 3.973,
  "total_energy_monthly_kwh": [4522.5, ...],
  "total_energy_annual_kwh": 65513.5,
  "total_area_m2": 45.2,
  "per_roof": [
    {
      "index": 0,
      "tilt": 15.5,
      "azimuth": 180.0,
      "area": 45.2,
      "monthly": [...],
      "annual": 1450.3,
      "daily_avg": 3.973,
      "error": null
    }
  ]
}

// Error 502 — PVGIS API error
{ "error": "PVGIS API error: ..." }
```

---

### Get PV Output

**GET** `/api/projects/{project_id}/pvoutput`

Computes monthly energy output for a given system size using PVGIS PVcalc.

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `system_kwp` | float | Yes | Total system size in kWp |
| `roof_indices` | string | No | `all` or comma-separated indices |
| `loss` | float | No | System losses in % (default: 14.0) |

```json
// Response 200
{
  "success": true,
  "data_source": "PVGIS_PVcalc",
  "roof_indices": "all",
  "location": { "lat": 13.7563, "lon": 100.5018 },
  "system_kwp": 5.0,
  "loss": 14.0,
  "monthly_kwh": [380.5, 420.2, ...],   // 12 values
  "annual_kwh": 5850.0
}
```

---

### Get System Sizing

**GET** `/api/projects/{project_id}/sizing`

Recommends a PV system size based on appliances and irradiation. Combines irradiation + consumption calculation.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `roof_indices` | string | `all` or comma-separated indices |

```json
// Response 200
{
  "success": true,
  "roof_indices": "all",
  "location": { "lat": 13.7563, "lon": 100.5018 },
  "consumption": {
    "total_daily_kwh": 18.5,
    "daytime_kwh": 12.3,
    "nighttime_kwh": 6.2,
    "appliances": [ ... ]
  },
  "irradiation": {
    "daily_avg_kwh_m2": 3.973,
    "annual_kwh_m2": 1450.3,
    "total_area_m2": 45.2
  },
  "sizing": {
    "target_kwp": 3.58,
    "performance_ratio": 0.86,
    "panel_watt": 450,
    "panel_count": 8,
    "system_kwp": 3.6,
    "panel_dimensions": { "width_m": 1.134, "height_m": 1.762, "area_m2": 2.0 },
    "total_panel_area_m2": 16.0,
    "available_roof_area_m2": 36.16,
    "fits_on_roof": true,
    "daily_production_kwh": 12.35,
    "annual_production_kwh": 4508,
    "surplus_daily_kwh": 0.05,
    "self_consumption_ratio": 1.0,
    "self_consumption_note": "System sized to cover ~100% of daytime demand"
  },
  "per_roof": [ ... ]
}
```

---

## System Endpoints

### Fresh Roof Analysis

**POST** `/api/analyze`

Called immediately after user draws roof polygons in the Cesium viewer. Generates `roof_model.glb` and `roof_stats.json`.

```json
// Request body
{
  "roofs": [
    // Array of ECEF point arrays
    [
      {"x": 6271000.5, "y": 1050000.3, "z": 1500000.8},
      ...
    ]
  ],
  "params": {
    "join_threshold": 0.5,
    "roof_thickness": 0.25
  }
}

// Response 200
{
  "success": true,
  "file": "roof_model.glb",
  "stats": {
    "roofs": [
      {
        "index": 0,
        "tilt": 15.5,
        "azimuth": 180.0,
        "area": 45.2,
        "is_flat": false,
        "needs_user_input": false,
        "color": "#3498db",
        "color_name": "blue"
      }
    ]
  }
}
```

---

### Get Roof Info (latest analysis)

**GET** `/api/roof-info`

Returns the cached `roof_stats.json` from the most recent `/api/analyze` call.

```json
// Response 200 — same shape as stats in /api/analyze response

// Error 404
{ "error": "No analysis data available. Please analyze a roof first." }
```

---

### Update Roof (session override)

**POST** `/api/update-roof`

Saves user-entered tilt/azimuth into the current `roof_stats.json` (not persisted to DB).

```json
// Request body
{
  "index": 0,
  "tilt": 20.0,
  "azimuth": 195.0
}

// Response 200
{
  "success": true,
  "stats": { ... }   // full updated stats
}
```

---

### Detect Location

**GET** `/api/detect-location`

Detects approximate location from the server's IP address.

```json
// Response 200
{
  "success": true,
  "lat": 13.7563,
  "lon": 100.5018,
  "city": "Bangkok",
  "country": "TH",
  "address": "Bangkok, TH"
}

// Error 400
{ "success": false, "error": "Could not detect location" }
```

---

### Health Check

**GET** `/health`

```json
{ "status": "ok" }
```

---

### Model Status

**GET** `/api/status`

Checks if the temporary `roof_model.glb` file exists.

```json
// Response 200
{
  "model_exists": true,
  "model_file": "roof_model.glb"
}
```

---

## Static File Serving

### Backend-generated files

**GET** `/backend/static/{filename}`

Serves files from `backend/static/` — used for `roof_model.glb` and per-project GLB files.

```
GET /backend/static/roof_model.glb
GET /backend/static/project_42_roof_model_lite.glb
```

### Frontend static files

**GET** `/static/{path}`

Standard Flask static serving from `static/` directory.

```
GET /static/css/base.css
GET /static/js/app/main.js
GET /static/captures/project_42_roof.png
```

---

## HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (missing/invalid parameters) |
| 401 | Unauthorized (wrong credentials) |
| 404 | Not found |
| 500 | Internal server error |
| 502 | PVGIS API error (upstream failure) |
