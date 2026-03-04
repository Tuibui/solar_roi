# ═══════════════════════════════════════════════════════════════════════════════
# SunScope — Solar ROI Calculator
# Academic Presentation Poster
# ═══════════════════════════════════════════════════════════════════════════════
#
# Paper size : A0 Landscape (1189 × 841 mm / 46.8 × 33.1 in)
# Orientation: Landscape (wider than tall)
# Tool       : PowerPoint / Illustrator / LaTeX (baposter) / Canva
# Reading    : Left → Right across 4 columns
#
# Professional poster conventions:
#   - Clean column grid (4 columns, equal width ~270 mm each)
#   - Minimal text, maximum figures and diagrams
#   - Numbered sections with subtle dividers
#   - High-contrast color palette for readability at 2 m distance
#   - Title readable at 5 m; body text readable at 1.5 m
# ═══════════════════════════════════════════════════════════════════════════════


<!-- ================================================================== -->
<!--                        HEADER BANNER                               -->
<!--  Full-width banner — navy gradient — left: logos, center: title    -->
<!-- ================================================================== -->

# SunScope: Interactive 3D Solar ROI Calculation Platform
## Rooftop Solar Investment Analysis with Real-Time Shading Simulation on Photorealistic 3D Tiles

**○ Tui Bui**¹  
¹ Department of Computer Science, National Institute of Technology, Niihama College, Japan

> Logo bar: [Kosen LOGO] ―――― [☀ SunScope LOGO] ―――― [CesiumJS LOGO] ―――― [Google 3D Tiles LOGO]


---


<!-- ================================================================== -->
<!--                    COLUMN 1  (left)                                 -->
<!-- ================================================================== -->

## 1. Introduction

### Research Background

Global solar PV capacity surpassed **1.6 TW** in 2024, yet most
homeowners and installers still rely on **2D satellite images** and
manual site surveys to estimate rooftop solar viability.

### Problem Statement

| # | Problem | Impact |
|---|---------|--------|
| 1 | **Flat imagery** | Cannot measure roof tilt, orientation, or true area |
| 2 | **No shading data** | Surrounding buildings block sunlight — ignored by existing tools |
| 3 | **Expensive surveys** | On-site expert visits cost ¥50,000+ and take days |
| 4 | **Fragmented workflow** | Separate tools for design, shading, sizing, and finance |

### Objective

Design and implement **SunScope** — a **single web platform** that
allows users to:

1. **Trace rooftops** on photorealistic 3D building models
2. **Simulate shading** via physics-based ray casting against real geometry
3. **Select equipment** from a searchable product catalog (300+ panels, 120+ inverters, 80+ batteries)
4. **Calculate 25-year ROI** using scientific irradiance data (PVGIS)

> All from a browser — **no installation, no cost, no site visit.**

### NAPROCK PROCON 2026 — Themed Section Fit

**Theme:** "Solving Environmental Issues Using ICT" (Hanoi, Mar 8–9, 2026)

| Rubric Criterion | Evidence in SunScope |
|------------------|----------------------|
| Originality | First web tool that traces roofs on **Google Photorealistic 3D Tiles** with async ray-cast shading |
| Usefulness | Quantifies solar ROI to accelerate clean-energy adoption by homeowners and installers |
| Usability | Single-page workflow, undo/redo tracing, catalog search, clear 6-step guided flow |
| Technical skills | CesiumJS + Three.js 3D editing, ray-based shading solver, Flask/SQL back end, PVGIS integration |
| Manual creation ability | Draft **operation manual + program source list** prepared for submission (English) |
| Presentation skills | English poster + live demo; concise 3-minute walkthrough aligned to contest format |

**Demo readiness & compliance**
- Fits booth constraint: laptop + optional tablet within **240×180×210 cm**, <500 W power draw; setup <40 minutes.
- Works offline if venue Wi‑Fi degrades: cached 3D tiles + sample rooftops + local PVGIS responses.
- Submission package: English slides, operation manual, program source list (GitHub), and source archive ready for upload.


---

## 2. System Architecture

> ※ Architecture diagram (render as vector graphic on poster)

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT  (Browser)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  ┌─────────┐ │
│  │  CesiumJS   │  │  Three.js   │  │ Chart.js   │  │ Vanilla │ │
│  │  3D Globe   │  │  3D Editor  │  │ Charts     │  │   JS    │ │
│  │  + Raycaster│  │  + Gizmos   │  │            │  │ Modules │ │
│  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  └────┬────┘ │
└─────────┼────────────────┼───────────────┼───────────────┼──────┘
          │  REST API      │               │               │
          ▼                ▼               ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│                       SERVER  (Flask / Gunicorn)                 │
│  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Geometry  │  │ Irradiance│  │  Sizing  │  │   Catalog     │ │
│  │ + Trimesh │  │  + PVGIS  │  │  Engine  │  │   REST API    │ │
│  │ GLB Build │  │  API v5.2 │  │          │  │ 500+ products │ │
│  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └───────┬───────┘ │
└────────┼──────────────┼─────────────┼─────────────────┼─────────┘
         │              │             │                  │
         ▼              ▼             ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐
│  PostgreSQL  │ │  PVGIS API   │ │  Google Photorealistic       │
│  Database    │ │  (EU JRC)    │ │  3D Tiles API                │
└──────────────┘ └──────────────┘ └──────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| 3D Mapping | **CesiumJS 1.114** | Globe rendering, 3D Tiles streaming |
| 3D Tiles | **Google Photorealistic 3D Tiles** | Real building geometry worldwide |
| 3D Editor | **Three.js 0.161** | Panel placement, gizmos, GLB display |
| Charting | **Chart.js 4.4** | Financial projections & energy charts |
| Backend | **Flask 3.0 + SQLAlchemy** | REST API, business logic |
| 3D Mesh | **Trimesh** | Roof polygon → GLB solid model |
| Solar Data | **PVGIS API v5.2** | Monthly POA irradiation (free, no key) |
| Database | **PostgreSQL** (prod) / SQLite (dev) | Users, projects, equipment catalog |
| Hosting | **Render.com** | Web service + managed PostgreSQL |


---


<!-- ================================================================== -->
<!--                    COLUMN 2  (center-left)                          -->
<!-- ================================================================== -->

## 3. Methodology

### 3.1 Solar Irradiance Acquisition

Data sourced from **PVGIS** (Photovoltaic Geographical Information System,
European Commission Joint Research Centre).

- **Inputs:** latitude, longitude, tilt (°), azimuth (°)
- **Output:** monthly plane-of-array irradiation $H_m$ (kWh/m²)

$$H_{\text{annual}} = \sum_{m=1}^{12} H_m$$

$$\text{PSH} = \frac{H_{\text{annual}}}{365} \quad \text{[Peak Sun Hours / day]}$$

### 3.2 Shading Simulation (Ray Casting)

> ※ Insert ray-casting concept diagram

For $N$ uniformly sampled roof points, at 3 representative solar hours
per month (**09:00, 12:00, 15:00 JST**):

1. Compute sun direction vector from **Cesium solar ephemeris**
2. Offset sample point **+0.5 m** along roof normal (avoid self-hit)
3. Fire async ray via `scene.pickFromRayMostDetailed()`
4. Ray hits **Google 3D Tile** at distance > 2 m → **shaded**

$$\eta_{\text{shading}} = 1 - \frac{N_{\text{shaded}}}{N_{\text{total}}} \quad \text{per month}$$

| Parameter | Value |
|-----------|-------|
| Sample points / roof | 100 (uniform grid) |
| Sun positions / month | 3 (09:00, 12:00, 15:00) |
| Ray offset | 0.5 m geodetic up |
| Min hit distance | 2.0 m |
| Tile preload | 2 camera angles, 2 s settle |

**Key innovation:** `pickFromRayMostDetailed` (async) forces
tile LOD loading along each ray path, solving the problem of
synchronous raycasting missing unloaded buildings.

### 3.3 PV System Sizing

$$P_{\text{target}} = \frac{E_{\text{daytime}}}{\text{PSH} \times \text{PR}}$$

| Symbol | Meaning | Default |
|--------|---------|---------|
| $E_{\text{daytime}}$ | Daily daytime load | from appliance schedules |
| PSH | Peak Sun Hours | from PVGIS |
| PR | Performance Ratio | 0.80 |

Panel count derived from roof area constraint:
$$N_{\text{panels}} = \min\!\left(\left\lceil \frac{P_{\text{target}}}{P_{\text{panel}}}\right\rceil,\; \left\lfloor \frac{A_{\text{roof}}}{A_{\text{panel}}}\right\rfloor\right)$$

### 3.4 Financial Model (25-Year DCF)

$$E_y = E_{\text{annual}} \times (1 - d)^{y} \qquad d = 0.7\%\text{/year}$$

$$\text{Savings}_y = E_y \times \eta_{\text{self}} \times T_{\text{tariff}} + E_y \times (1 - \eta_{\text{self}}) \times T_{\text{export}}$$

$$\text{NPV} = -\text{CAPEX} + \sum_{y=1}^{25} \frac{CF_y}{(1 + r)^y} \qquad r = 6\%$$

$$\text{LCOE} = \frac{\displaystyle\sum_{y=0}^{25} \frac{C_y}{(1+r)^y}}{\displaystyle\sum_{y=1}^{25} \frac{E_y}{(1+r)^y}} \quad \text{[currency/kWh]}$$

### Financial Parameters

| Parameter | Value |
|-----------|-------|
| System losses | 14% (PR = 0.86) |
| Panel degradation | 0.7% / year |
| O&M cost | 1% of CAPEX / year |
| Discount rate | 6% |
| Inverter replacement | Year 12 @ 80% cost |
| Battery replacement | Year 10 @ 80% cost |
| BOS factor | 1.2× (20% overhead) |


---


<!-- ================================================================== -->
<!--                    COLUMN 3  (center-right)                         -->
<!-- ================================================================== -->

## 4. Key Features

> ※ Layout as 2×4 card grid with icon + screenshot thumbnail per card

### 🗺️  3D Interactive Roof Drawing
Draw roof polygons directly on **Google Photorealistic 3D Tiles**.
Point-and-click tracing with undo/redo. Multi-roof support.

### ☀️  Async Ray-Cast Shading
**`pickFromRayMostDetailed`** against real 3D building geometry.
Monthly shading ratios with heatmap scatter visualization.

### 📐  CAD-Style Panel Placement
SolidWorks-inspired split-view: **ghost preview**, rotation,
**TransformControls gizmo**, panel browser with live cost display.

### 🔋  Equipment Catalog Database
**300 solar panels** (7 brands), **120 inverters** (6 brands),
**80 batteries** (6 brands). Searchable and filterable via REST API.

### ⚡  Automatic System Sizing
Auto-recommend panel count, inverter, and battery based on
roof area, consumption profile, irradiance, and shading factor.

### 📊  25-Year Financial Projection
NPV, IRR, payback period, LCOE — multi-currency (USD, EUR, JPY, THB)
with configurable tariff, grid export, and degradation.

### 🌳  Project Tree & Management
SolidWorks FeatureManager-style hierarchical tree. User auth,
project CRUD, capture snapshots, per-project appliance schedules.

### 📈  Real-Time Progress Tracking
Horizontal progress bar with live elapsed timer during
shading computation. Phase labels for each analysis stage.


---

## 5. User Workflow

> ※ Horizontal 6-step arrow diagram with numbered screenshots below

```
  ①            ②             ③              ④              ⑤             ⑥
┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐
│ LOCATE │─▸│  DRAW  │─▸│ ANALYZE  │─▸│  SELECT  │─▸│   SIZE   │─▸│  ROI   │
│Building│  │ Roofs  │  │ Shading  │  │Equipment │  │  System  │  │ Report │
└────────┘  └────────┘  └──────────┘  └──────────┘  └──────────┘  └────────┘
 Search by    Trace        3D model,     Browse        Auto or       25-year
 address on   polygons     ray-cast      panels,       manual        cashflow
 3D globe     on tiles     per month     inverters,    sizing        NPV, IRR
                                         batteries
```

| Step | User Action | System Response |
|------|-------------|-----------------|
| ① Locate | Type address or navigate globe | Fly to 3D photorealistic view |
| ② Draw | Click vertices on roof surface | Polygon + area/tilt/azimuth computed |
| ③ Analyze | Press "Analyze" button | GLB model + shading heatmap generated |
| ④ Select | Browse catalog, pick equipment | Items added to project tree |
| ⑤ Size | Enter bill / appliance schedule | Optimal kWp + panel count recommended |
| ⑥ Report | View results page | Charts, financial metrics, comparison |


---


<!-- ================================================================== -->
<!--                    COLUMN 4  (right)                                -->
<!-- ================================================================== -->

## 6. Results & Demonstration

> ※ Place 4 key screenshots (each ~220 × 165 mm):
>
> **Fig. 1:** 3D roof polygon drawing on Google Tiles (Cesium globe view)
> **Fig. 2:** Split-view — Three.js 3D model with placed solar panels
> **Fig. 3:** Shading heatmap overlay — green (sun) → red (shade) scatter
> **Fig. 4:** Financial dashboard — 25-year cashflow chart + metrics

### Sample Analysis: Residential Rooftop — Niihama, Ehime, Japan

| Metric | Value |
|--------|-------|
| Roof area | ~45 m² (2 planes) |
| System capacity | 5.0 kWp |
| Annual production | ~5,800 kWh/year |
| Peak Sun Hours | 3.8 hrs/day |
| Shading factor | 0.85 (15% loss) |
| Monthly savings | ¥15,000 |
| Simple payback | 8.2 years |
| NPV (25-year) | ¥850,000 |
| IRR | 11.5% |
| LCOE | ¥8.5/kWh |

> ※ Values are illustrative. Results vary by location, geometry, and tariff.

### Equipment Catalog Summary

| Category | Count | Brands | Key Specs |
|----------|-------|--------|-----------|
| ☀️ Solar Panels | 300 | REC, JA Solar, Trina, LONGi, Jinko, Qcells, Canadian Solar | 380–550 W, 19.5–22.5% eff |
| ⚡ Inverters | 120 | Fronius, Huawei, SolarEdge, Sungrow, GoodWe, Growatt | 3–15 kW, 1φ/3φ, 96–98.5% eff |
| 🔋 Batteries | 80 | Tesla, BYD, Sonnen, LG Energy, Pylontech, Huawei | 5–20 kWh, LiFePO4, 4000–8000 cycles |


---

## 7. Novel Contributions

| # | Contribution | Significance |
|---|-------------|--------------|
| 1 | **3D Roof Tracing on Photorealistic Tiles** | First web tool to draw roofs directly on Google 3D building models |
| 2 | **Async Ray-Cast Shading** | `pickFromRayMostDetailed` forces tile LOD loading — solves invisible-building problem |
| 3 | **Integrated Equipment Catalog** | 500+ real products (panels, inverters, batteries) with filterable REST API |
| 4 | **End-to-End Pipeline** | Single platform: 3D drawing → mesh → shading → sizing → 25-year ROI |
| 5 | **Free & Browser-Based** | No software install, no API cost (PVGIS is free), works on any modern browser |
| 6 | **CAD-Quality UX** | SolidWorks-inspired tree, ghost panel preview, gizmo-based 3D editing |


---

## 8. Future Work

| Priority | Enhancement | Expected Impact |
|----------|-------------|-----------------|
| High | **AI roof auto-detection** | Deep learning segmentation eliminates manual tracing |
| High | **PDF report export** | Professional downloadable report for customers |
| Medium | **TMY data integration** | Typical Meteorological Year → ±5% better accuracy |
| Medium | **Sensitivity analysis** | User-adjustable degradation, discount rate, O&M |
| Low | **Mobile responsive UI** | Tablet/phone support for field use |
| Low | **Multi-language** | Japanese, Thai, English interface switching |

### Current Limitations

| Limitation | Mitigation |
|------------|------------|
| PVGIS geographic coverage | Some equatorial/polar regions lack data |
| Google 3D Tile LOD quality | Shading accuracy ∝ model resolution |
| Free hosting cold start | ~30 s first-load on Render free tier |


---

## 9. Conclusion

**SunScope** demonstrates that a **browser-based platform** can deliver
professional-grade rooftop solar analysis by integrating:

- ✅ **Photorealistic 3D mapping** — CesiumJS + Google 3D Tiles
- ✅ **Physics-based shading** — async ray casting against real buildings
- ✅ **Scientific irradiance data** — PVGIS v5.2 (European Commission)
- ✅ **Equipment catalog** — 500+ products (panels, inverters, batteries)
- ✅ **25-year financial modeling** — NPV, IRR, LCOE, payback period

The platform empowers **homeowners and solar professionals** to make
data-driven investment decisions with **scientific accuracy and
visual confidence** — entirely from a web browser.

> 🌐 **Live Demo:** https://sunscope.onrender.com
> 💻 **Source Code:** https://github.com/Tuibui/solar_roi


---

## 10. References

[1] European Commission JRC, "PVGIS — Photovoltaic Geographical Information System," https://re.jrc.ec.europa.eu/pvg_tools/  
[2] Cesium GS Inc., "CesiumJS — Open-source 3D Geospatial Platform," https://cesium.com/cesiumjs/  
[3] Google, "Photorealistic 3D Tiles — Map Tiles API," https://developers.google.com/maps/documentation/tile/3d-tiles  
[4] Three.js Contributors, "Three.js — JavaScript 3D Library," https://threejs.org/  
[5] pvlib Contributors, "pvlib python — PV System Simulation," https://pvlib-python.readthedocs.io/  
[6] Trimesh Contributors, "Trimesh — Python Triangular Mesh Library," https://trimesh.org/  
[7] METI Japan, "Feed-in Tariff / Feed-in Premium (FIT/FIP)," https://www.enecho.meti.go.jp/  
[8] IEA, "Renewables 2024 — Global Status Report," https://www.iea.org/reports/renewables-2024


---

## Acknowledgments

The author thanks the faculty of National Institute of Technology,
Niihama College for their guidance. Thanks to the CesiumJS, PVGIS,
and open-source communities for the tools and data enabling this work.

> ※ QR Code → https://sunscope.onrender.com


---


<!-- ================================================================== -->
<!--                    POSTER DESIGN SPECIFICATIONS                     -->
<!-- ================================================================== -->

# A0 Landscape Poster — Design Specifications

## Dimensions

| Property | Value |
|----------|-------|
| Paper size | **A0 Landscape** |
| Width × Height | **1189 × 841 mm** (46.8 × 33.1 in) |
| Margins | 25 mm all sides |
| Column count | **4 equal columns** (~270 mm each) |
| Column gap | 15 mm |
| Safe print area | 1139 × 791 mm |

## Column Layout Map

```
←─────────────────── 1189 mm (A0 Landscape) ──────────────────────→

┌─────────────────────────────────────────────────────────────────────┐  ↑
│                       HEADER BANNER (full width)                   │  │
│   [Kosen Logo]   SunScope: Interactive 3D Solar ROI ...    [Logos] │  100mm
│   Tui Bui — NIT Niihama College, Japan                            │  │
├────────────┬────────────┬─────────────┬────────────────────────────┤  ↓
│            │            │             │                            │
│ COL 1      │ COL 2      │ COL 3       │ COL 4                     │
│            │            │             │                            │
│ 1. Intro   │ 3. Method  │ 4. Features │ 6. Results                │
│   Problem  │  3.1 PVGIS │   (card     │   Screenshots (×4)        │
│   Objective│  3.2 Shade │    grid)    │   Sample metrics table    │
│            │  3.3 Sizing│             │   Equipment summary       │
│ 2. Arch    │  3.4 Finance│ 5. Workflow │                           │
│   Diagram  │   Params   │   6-step    │ 7. Contributions          │
│   Stack    │            │   diagram   │ 8. Future work            │
│   Table    │            │             │ 9. Conclusion             │
│            │            │             │ 10. References            │
│            │            │             │ Acknowledgments + QR      │
│            │            │             │                            │
├────────────┴────────────┴─────────────┴────────────────────────────┤
│                      FOOTER BAR  (optional)                        │
│   Live Demo: sunscope.onrender.com    GitHub: Tuibui/solar_roi    │
└─────────────────────────────────────────────────────────────────────┘
```

## Typography (readable at 1.5 m distance)

| Element | Size | Weight | Font |
|---------|------|--------|------|
| Poster title | **72–84 pt** | Bold | Montserrat / Noto Sans |
| Subtitle | 36–42 pt | Regular | Montserrat |
| Author line | 28–32 pt | Regular | Noto Sans |
| Section heading (##) | **36–42 pt** | Bold | Montserrat |
| Subsection (###) | 24–28 pt | Semi-Bold | Noto Sans |
| Body text | **20–24 pt** | Regular | Noto Sans |
| Table text | 18–20 pt | Regular | Noto Sans |
| Captions | 16–18 pt | Italic | Noto Sans |
| Equations | 22–26 pt | — | Latin Modern Math |
| References | 14–16 pt | Regular | Noto Sans |

## Color Palette

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| Primary BG | Dark Navy | `#0a1628` | Header, footer, section accents |
| Card BG | White | `#ffffff` | Content card backgrounds |
| Poster BG | Light Gray | `#f1f5f9` | Between cards (subtle grid) |
| Accent 1 | Solar Orange | `#f59e0b` | Icons, highlights, section numbers |
| Accent 2 | Blue | `#3b82f6` | Links, architecture diagram |
| Success | Emerald | `#10b981` | Positive values, checkmarks |
| Danger | Red | `#ef4444` | Shading loss indicators |
| Text (dark) | Slate 900 | `#0f172a` | Body text on white |
| Text (light) | White | `#ffffff` | Text on navy background |

## Figure & Screenshot Placement

| Figure | Section | Location | Size (mm) | Content |
|--------|---------|----------|-----------|---------|
| Fig. 1 | Col 4, top | Results | 240 × 170 | 3D roof drawing on Cesium globe |
| Fig. 2 | Col 4 | Results | 240 × 170 | Split-view: 3D model + panels |
| Fig. 3 | Col 4 | Results | 240 × 170 | Shading heatmap (green→red) |
| Fig. 4 | Col 4 | Results | 240 × 170 | 25-year cashflow chart |
| Diagram 1 | Col 1 | Architecture | 250 × 180 | System architecture (vector) |
| Diagram 2 | Col 2 | Methodology | 250 × 120 | Ray-casting concept |
| Diagram 3 | Col 3 | Workflow | 250 × 80 | 6-step arrow flow |

## QR Code

| Property | Value |
|----------|-------|
| Position | Column 4, bottom-right |
| Size | 60 × 60 mm |
| URL | https://sunscope.onrender.com |
| Label | "Scan to try live demo" |

## Print Checklist

- [ ] Export as PDF (300 DPI minimum, 150 DPI acceptable)
- [ ] Embed all fonts
- [ ] Convert text to outlines if using unusual fonts
- [ ] CMYK color mode for professional printing
- [ ] 3 mm bleed on all edges
- [ ] Check contrast ratio ≥ 4.5:1 (WCAG AA)
- [ ] Test readability: title at 5 m, body at 1.5 m
- [ ] Verify QR code scans correctly at printed size
