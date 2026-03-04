# ═══════════════════════════════════════════════════════════════════════════════
# SunScope — Solar ROI Calculator
# Academic Presentation Poster (Japanese Conference Format)
# ═══════════════════════════════════════════════════════════════════════════════
#
# Paper size: A1 Portrait (594 × 841 mm)
# Tool: PowerPoint / Canva / Gamma.app / LaTeX (baposter)
# Color: Dark navy (#0a1628) + Solar orange (#f59e0b) + White
#
# Japanese academic poster conventions:
#   - Read top-left → bottom-right (Z-pattern)
#   - Numbered sections with clear borders
#   - Heavy use of figures/tables, concise text
#   - Conclusion section should stand out
#   - Acknowledgments section at the end
# ═══════════════════════════════════════════════════════════════════════════════


<!-- ================================================================== -->
<!--                        HEADER BANNER                               -->
<!--  Background: navy gradient, 3 logos                                -->
<!-- ================================================================== -->

# SunScope: Interactive 3D Solar ROI Calculation Platform
## — Rooftop Solar Investment Analysis with Real-Time 3D Shading Simulation —

**○ Tui Bui**¹  
¹ National Institute of Technology, Niihama College

> Logo placement: [Kosen Logo] ——— [SunScope Logo] ——— [CesiumJS Logo]


---

<!-- ================================================================== -->
<!--                  1. RESEARCH BACKGROUND & PURPOSE                  -->
<!-- ================================================================== -->

## 1. Research Background & Purpose

### Background

Solar energy adoption is accelerating worldwide, yet homeowners and
installers still lack accessible tools to **accurately estimate the
return on investment (ROI)** for specific rooftop installations.

### Problems with Existing Tools

| Problem | Description |
|---------|-------------|
| **2D satellite images only** | Cannot accurately assess roof tilt and orientation |
| **No shading analysis** | Ignores obstruction from surrounding buildings |
| **Costly site surveys** | Requires on-site expert measurement |

### Purpose of This Research

Develop **SunScope**, a web-based platform that allows users to:
1. **Trace roofs** directly on photorealistic 3D building tiles
2. **Simulate shading** using physics-based ray casting
3. **Calculate 25-year ROI** with scientific solar irradiance data


---

<!-- ================================================================== -->
<!--                    2. SYSTEM ARCHITECTURE                          -->
<!-- ================================================================== -->

## 2. System Architecture

> ※ Place architecture diagram here

```
┌──────────┐    ┌───────────────┐    ┌───────────┐    ┌────────────┐
│  USER    │───▸│  FRONTEND     │───▸│  BACKEND  │───▸│  DATABASE  │
│ Browser  │    │ CesiumJS      │    │ Flask     │    │ PostgreSQL │
│          │◂───│ Three.js      │◂───│ Python    │    │            │
│          │    │ Chart.js      │    │ Trimesh   │    │            │
└──────────┘    └──────┬────────┘    └─────┬─────┘    └────────────┘
                       │                   │
                       ▼                   ▼
                ┌──────────────┐   ┌───────────────┐
                │ Google 3D   │   │  PVGIS API    │
                │ Tiles API   │   │ (EU Commission)│
                └──────────────┘   └───────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **3D Mapping** | CesiumJS + Google Photorealistic 3D Tiles |
| **3D Modeling** | Three.js (display) + Trimesh (GLB generation) |
| **Frontend** | Vanilla JavaScript, Chart.js |
| **Backend** | Python 3, Flask 3.0, SQLAlchemy, Gunicorn |
| **Database** | PostgreSQL (production) / SQLite (development) |
| **Solar Data** | PVGIS API v5.2 (European Commission — free) |
| **Hosting** | Render.com (Web Service + PostgreSQL) |


---

<!-- ================================================================== -->
<!--                    3. KEY FEATURES                                  -->
<!-- ================================================================== -->

## 3. Key Features

> ※ Layout as 2×3 grid cards with icons and screenshot thumbnails

### 🗺️ 3D Interactive Roof Drawing
Draw roof polygons directly on **Google Photorealistic 3D Tiles**.
Trace real building geometry with point-and-click.
Supports up to 6 roofs per analysis.

### ☀️ Physics-Based Shading Analysis
**Ray casting** against actual 3D building geometry.
Monthly shading ratios (12 months × multiple sun positions).
Accurate sun position via Cesium solar ephemeris.

### 📐 CAD-Style Panel Placement
**SolidWorks-inspired** interface:
ghost placement, rotation gizmo, grid snap.
Precise panel positioning on each roof surface.

### 📊 25-Year Financial Model
Complete ROI analysis:
**NPV**, **IRR**, **Payback Period**, **LCOE**
Includes degradation, replacement costs, and discount rate.

### ⚡ Automatic System Sizing
Auto-recommend optimal panel count, inverter, and battery
based on roof area, electricity consumption, and shading.

### 💾 Project Management
User authentication, project save/load.
Compare multiple scenarios for different configurations.


---

<!-- ================================================================== -->
<!--                    4. METHODOLOGY                                   -->
<!-- ================================================================== -->

## 4. Methodology

### 4.1 Solar Irradiance Data

Obtained from the **PVGIS API** (Photovoltaic Geographical Information
System) by the European Commission.

- **Input:** Latitude, longitude, tilt angle, azimuth
- **Output:** Monthly plane-of-array irradiation H_m (kWh/m²)

$$
H_{annual} = \sum_{m=1}^{12} H_m
$$

$$
PSH = \frac{H_{annual}}{365} \quad \text{[Peak Sun Hours per day]}
$$

### 4.2 PV System Sizing

$$
P_{target} = \frac{E_{daytime}}{PSH \times PR}
$$

| Symbol | Meaning | Value |
|--------|---------|-------|
| E_daytime | Daily daytime consumption | kWh/day |
| PSH | Peak Sun Hours | hours/day |
| PR | Performance Ratio | **0.86** (14% losses) |

### 4.3 Annual Energy Output

$$
E_{annual} = \sum_{m=1}^{12} E_m \quad \text{[kWh/year]}
$$

System loss = 14% (wiring, inverter, temperature, mismatch)

### 4.4 Shading Simulation

> ※ Place ray-casting concept diagram here

For each sample point on the roof surface:

1. Compute **sun position** (azimuth + elevation) at representative hours
2. Cast a **ray from roof point toward the sun**
3. Ray intersects **3D building** → point is **shaded**
4. Aggregate result:

$$
\eta_{shading} = 1 - \frac{N_{shaded}}{N_{total}}
$$

### 4.5 Financial Model (25-Year)

$$
\text{Savings}_y = E_y \times \eta_{self} \times T_{tariff} + E_y \times (1 - \eta_{self}) \times T_{export}
$$

$$
E_y = E_{annual} \times (1 - d)^y \quad (d = 0.7\%\text{/year degradation})
$$

$$
NPV = -CAPEX + \sum_{y=1}^{25} \frac{CF_y}{(1 + r)^y} \quad (r = 6\%\text{ discount rate})
$$

$$
LCOE = \frac{\sum_{y=0}^{25} \frac{C_y}{(1+r)^y}}{\sum_{y=1}^{25} \frac{E_y}{(1+r)^y}} \quad \text{[currency/kWh]}
$$

### Calculation Parameters

| Parameter | Value |
|-----------|-------|
| System losses | 14% (PR = 0.86) |
| Panel degradation | 0.7%/year |
| O&M cost | 1% of CAPEX/year |
| Discount rate | 6% |
| Inverter replacement | Year 12 (80% of original cost) |
| Battery replacement | Year 10 (80% of original cost) |
| BOS factor | 1.2× (20% overhead) |


---

<!-- ================================================================== -->
<!--                    5. USER WORKFLOW                                  -->
<!-- ================================================================== -->

## 5. User Workflow

> ※ Horizontal arrow flow with numbered screenshots

```
   ①             ②              ③             ④             ⑤
┌────────┐   ┌────────┐   ┌─────────┐   ┌────────┐   ┌────────┐
│ LOCATE │──▸│  DRAW  │──▸│ ANALYZE │──▸│  SIZE  │──▸│  ROI   │
│Building│   │ Roofs  │   │ Shading │   │ System │   │ Report │
└────────┘   └────────┘   └─────────┘   └────────┘   └────────┘
 Search any    Click to     Generate      Auto-pick    25-year
 address on    trace roof   3D model,     panels,      cashflow,
 3D globe      polygons     ray-cast      inverter,    NPV, IRR,
               on 3D tiles  shading       battery      payback
```

### Step Details

| Step | Description |
|------|-------------|
| ① Locate | Search any address worldwide; fly to 3D photorealistic view |
| ② Draw | Trace roof boundaries with click-to-add-point (Undo/Redo supported) |
| ③ Analyze | Backend computes tilt, azimuth, area; generates 3D GLB model |
| ④ Size | Enter electricity bill; system auto-sizes optimal configuration |
| ⑤ Report | View 25-year ROI chart, payback period, and financial metrics |


---

<!-- ================================================================== -->
<!--                    6. RESULTS                                       -->
<!-- ================================================================== -->

## 6. Results & Demonstration

> ※ Place 3 key screenshots:
> - Screenshot 1: 3D roof drawing on Cesium globe
> - Screenshot 2: Split-view with 3D model + shading heatmap
> - Screenshot 3: ROI report with charts

### Sample Output (Residential Home — Niihama, Japan)

| Metric | Value |
|--------|-------|
| Roof area | ~45 m² |
| System capacity | 5.0 kWp |
| Annual production | ~5,800 kWh/year |
| Peak Sun Hours | 3.8 hrs/day |
| Shading ratio (usable area) | 85% |
| Monthly savings | ¥15,000/month |
| Simple payback | 8.2 years |
| NPV (25-year) | ¥850,000 |
| IRR | 11.5% |
| LCOE | ¥8.5/kWh |

> ※ Values are illustrative. Actual results depend on location,
> roof geometry, electricity tariff, and equipment selection.


---

<!-- ================================================================== -->
<!--                    7. NOVEL CONTRIBUTIONS                           -->
<!-- ================================================================== -->

## 7. Novel Contributions

| # | Contribution | Description |
|---|-------------|-------------|
| 1 | **3D Interactive Roof Tracing** | First web tool to draw roofs on Google Photorealistic 3D Tiles |
| 2 | **Physics-Based 3D Shading** | Ray-cast against real building geometry, not heuristic estimates |
| 3 | **End-to-End Integration** | 3D drawing → mesh generation → solar analysis → financial ROI |
| 4 | **Free & Accessible** | No cost for solar data (PVGIS); runs in any modern browser |
| 5 | **CAD-Quality UX** | SolidWorks-inspired project tree, gizmo-based panel placement |


---

<!-- ================================================================== -->
<!--                    8. FUTURE WORK                                   -->
<!-- ================================================================== -->

## 8. Future Work & Limitations

### Planned Improvements

- **AI roof auto-detection** — Deep learning for automatic boundary extraction
- **Real product database** — Integration with actual panel/inverter catalogs
- **PDF export** — Professional downloadable report for customers
- **Mobile optimization** — Responsive design for tablet/phone
- **TMY data** — Typical Meteorological Year for ±5% better accuracy
- **Sensitivity analysis** — User-adjustable degradation, discount, O&M

### Current Limitations

| Limitation | Impact |
|------------|--------|
| PVGIS coverage only | Some regions have no solar data |
| Google 3D Tiles quality | Shading accuracy depends on model quality |
| Free hosting tier | Cold-start latency (~30 seconds) |


---

<!-- ================================================================== -->
<!--                    9. CONCLUSION                                    -->
<!-- ================================================================== -->

## 9. Conclusion

This research developed **SunScope**, a web-based solar ROI calculation
platform that integrates:

- ✅ **3D photorealistic mapping** (CesiumJS + Google 3D Tiles)
- ✅ **Physics-based shading simulation** (ray casting against real buildings)
- ✅ **Scientific solar irradiance data** (PVGIS, European Commission)
- ✅ **Complete 25-year financial modeling** (NPV, IRR, LCOE, payback)

The platform enables **homeowners and solar installers** to make
data-driven investment decisions with **scientific accuracy and
visual confidence**, using only a web browser.

> **Live Demo:** https://sunscope.onrender.com
> **Source Code:** https://github.com/Tuibui/solar_roi


---

<!-- ================================================================== -->
<!--                    10. REFERENCES                                   -->
<!-- ================================================================== -->

## 10. References

[1] PVGIS — Photovoltaic Geographical Information System, European Commission JRC. https://re.jrc.ec.europa.eu/pvg_tools/  
[2] CesiumJS — Open-source JavaScript library for 3D globes. https://cesium.com/cesiumjs/  
[3] Google Photorealistic 3D Tiles — Map Tiles API. https://developers.google.com/maps/documentation/tile/3d-tiles  
[4] Three.js — JavaScript 3D library. https://threejs.org/  
[5] pvlib — Open-source PV system simulation tools. https://pvlib-python.readthedocs.io/  
[6] Trimesh — Python library for triangular meshes. https://trimesh.org/  
[7] METI — Feed-in Tariff / Feed-in Premium (FIT/FIP). https://www.enecho.meti.go.jp/


---

<!-- ================================================================== -->
<!--                    ACKNOWLEDGMENTS                                  -->
<!-- ================================================================== -->

## Acknowledgments

The author would like to thank the faculty of National Institute of
Technology, Niihama College for their guidance and support.
Thanks also to the CesiumJS, PVGIS, and open-source communities
for providing the tools and data that made this research possible.


---

<!-- ================================================================== -->
<!--                    POSTER DESIGN GUIDE                              -->
<!-- ================================================================== -->

# Poster Design Guide

## Typography

| Element | Size | Style | Font |
|---------|------|-------|------|
| Title | 48–60pt | Bold | Noto Sans / Montserrat |
| Section heading | 28–32pt | Bold | Noto Sans |
| Body text | 16–18pt | Regular | Noto Sans |
| Captions | 12–14pt | Italic | Noto Sans |
| Equations | 18–20pt | — | Latin Modern |

## Color Palette

| Purpose | Color | Code |
|---------|-------|------|
| Main background | Dark Navy | `#0a1628` |
| Accent | Solar Orange | `#f59e0b` |
| Secondary | Blue | `#3b82f6` |
| Positive/Success | Green | `#10b981` |
| Text on dark | White | `#ffffff` |
| Text on light | Dark Gray | `#1e293b` |
| Card background | Light Gray | `#f8fafc` |

## Layout (A1 Portrait)

```
┌─────────────────────────────────────┐
│         HEADER BANNER               │  ← Navy gradient, logos, title
│    Title / Author / Affiliation     │
├──────────────────┬──────────────────┤
│ 1. Background &  │ 2. System        │  ← White cards, orange accents
│    Purpose       │    Architecture   │
├──────────────────┴──────────────────┤
│        3. Key Features (2×3 grid)   │  ← Icon cards with thumbnails
├──────────────────┬──────────────────┤
│ 4. Methodology   │ 5. Workflow      │  ← Formulas + step diagram
│    Equations      │    Screenshots   │
├──────────────────┴──────────────────┤
│       6. Results (Screenshots)      │  ← Large images + result table
├──────────────────┬──────────────────┤
│ 7. Contributions │ 8. Future Work   │
├──────────────────┴──────────────────┤
│ 9. Conclusion    │ 10. References   │  ← Navy footer
│                  │    Acknowledgments│
│                  │    QR Code → 📱   │
└─────────────────────────────────────┘
```

## Screenshot Placement Guide

| Section | Image Content | Size |
|---------|--------------|------|
| 3. Features | Small thumbnails per card | 80×60mm each |
| 5. Workflow | Step-by-step screenshots | 100×75mm each |
| 6. Results | 3D view + ROI chart | 150×110mm × 2 |

## QR Code

Bottom-right corner → https://sunscope.onrender.com
