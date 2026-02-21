# Solar ROI Calculator - Project State

> **Last Updated:** 2026-02-20 (Session 7)
> **Session Summary:** Redesigned panel placement to SolidWorks-style workflow: Select Plane → Sketch Mode (camera snap, locked rotation, ✓/✗ confirm), Install Panel dropdown (3 models), Undo/Redo

---

## 1. ARCHITECTURE OVERVIEW

### Tech Stack
- **Frontend:** CesiumJS (3D map), Three.js (3D models), vanilla JS
- **Backend:** Flask, SQLAlchemy, SQLite
- **3D Pipeline:** User draws on Cesium → Backend generates GLB → Three.js displays

### Key Directories
```
/templates/          # HTML pages
  - app.html        # Main map + split view
  - calculate.html  # Results page with charts
  - login.html      # Auth
/static/js/app/     # Frontend JS
  - draw.js         # Roof drawing + undo/redo (draws only on 3D tiles)
  - main.js         # UI controllers
  - map.js          # Cesium init + Google tiles + OSM buildings
  - search.js       # Address search (fixed suggestions bug)
  - wizard.js       # State management
  - panel-placer.js # SolidWorks-style panel placement (REWRITTEN Session 7)
  - shading-engine.js    # Shading ray cast engine (offscreen Cesium)
  - shading-controller.js # Monthly shading orchestrator
  - shading-visualizer.js # Heatmap visualization
  - roof-sampler.js      # Grid/uniform roof surface sampling
/static/css/        # Styles
  - base.css        # Base variables and resets
  - app.css         # App-specific styles (analyze button, cursor)
  - wizard.css      # Wizard UI + imports split-view.css
  - split-view.css  # Split view layout + CAD toolbar styles
/static/models/     # 3D model assets
  - solar_panel.glb     # Standard panel GLB (NEW Session 6)
  - solar_panel_72.glb  # 72-Cell panel GLB (NEW Session 6)
  - solar_panel_120.glb # 120-Cell panel GLB (NEW Session 6)
/backend/           # Flask API
  - services/mesh_builder.py  # GLB model generation (no panel mesh)
```

---

## 2. CURRENT LAYOUT (After Analyze)

### Split View Layout (app.html)
```
┌──────────────────────────────────┬──────────────────────┐
│ [⬡ Select Plane][⊞ Install ▾]  │ Project Details  [◀] │
│ [↩ Undo][↪ Redo]               │                      │
│  ┌─────────────────────────┐    │──────────────────────│
│  │ Roof│Tilt│Azim│Hgt│Area │    │ Appliances           │
│  │ 🔴#1│25.5│180 │2.8│45.2│    │ Monthly Electric Bill│
│  │ 🟢#2│30.0│ 90 │3.2│38.5│    │ Electricity Price    │
│  └─────────────────────────┘    │ Grid Export Price    │
│                          [✓][✗] │ Save Project         │
│         [3D ROOF MODEL]        │                      │
│      (base facing upward)      │                      │
│      (sketch mode: top-down)   │                      │
│  [Edit Roof]                   │                      │
│         [SKETCH MODE]          │                      │
└──────────────────────────────────┴──────────────────────┘
         ↑                                  ↑
    split-left (flex: 1)         split-right (400px, collapsible)
```

#### Sketch Mode Detail
```
┌──────────────────────────────────┐
│ [⬡ Select Plane][⊞ 72-Cell ▾]  │
│ [↩][↪]          ┌──────────┐   │
│                  │Std Panel │   │
│                  │72-Cell ✓ │   │
│                  │120-Cell  │   │
│                  └──────────┘   │
│                          [✓][✗] │   ← top-right confirm/cancel
│  ┌──────────────────────────┐   │
│  │ ████ selected face ████  │   │   ← blue highlight
│  │ [ghost panel follows     │   │
│  │  mouse on face, click    │   │
│  │  to place]               │   │
│  └──────────────────────────┘   │
│         [SKETCH MODE]           │   ← badge bottom-center
└──────────────────────────────────┘
```

### Map Page Layout (Before Analyze)
```
┌────────────────────────────────────────────────────┐
│ [Search] [Search] [Detect] | [Draw][Undo][Redo][Reset]│
│  (all buttons same 36px height, white background)  │
├────────────────────────────────────────────────────┤
│                                                    │
│                [CESIUM 3D MAP]                     │
│                (crosshair cursor)                  │
│         (only draws on 3D tiles/roofs)            │
│                                                    │
│                              [○] ← Analyze button │
│                              (bottom right)       │
└────────────────────────────────────────────────────┘
```

---

## 3. CRITICAL SETTINGS

### 3D Model Orientation
```javascript
// Roof: lay flat with base parallel to ground, facing UP
model.rotation.x = +Math.PI / 2;
```

### Height Scale Factor
- **Value:** `0.0712` (for roof info table display)
- **Usage:** `const height = (rawHeight * 0.0712).toFixed(2);`

### Drawing Guard (draw.js)
```javascript
// Only allow clicks on 3D tiles (buildings/roofs), not empty terrain
const picked = viewer.scene.pick(e.position);
if (!picked) return;
```

### Polygon Classification (draw.js)
```javascript
// Drape polygon on 3D tiles (no outline warning)
polygon: {
  hierarchy: positions.slice(),
  material: roofColor.cesium.withAlpha(0.4),
  classificationType: Cesium.ClassificationType.CESIUM_3D_TILE
}
```

### GLB Model - No Panel Mesh (mesh_builder.py)
```python
# Panel mesh excluded from 3D model (was causing black plate)
# Panel data still calculated and stored in stats
model = trimesh.util.concatenate(parts)
```

### GLB Transform Metadata (mesh_builder.py)
- `stats.mesh_transform` now includes:
  - `origin_ecef`
  - `rotation` (3x3)

### Shading Ray Casting (main.js) — FIXED Session 6
- Casts against **Google 3D photorealistic tiles** (complete coverage)
- **Excludes OSM buildings** (incomplete, was causing 0 results)
- Ray origin offset **0.5m upward** (geodetic surface normal) to avoid self-intersection
- Distance threshold **> 2.0m** to ignore own building hits
- Sample times: `08:00, 10:00, 12:00, 14:00, 16:00`
- Spacing default: `0.6m`
- Downsample cap: 300 points per roof
- Debug logs: `[Shading] 12:00 → X/Y points shaded`

### Ray Casting — Key Fix (Session 6)
```javascript
// pickFromRay 2nd param is objectsToExclude (NOT objectsToQuery!)
// WRONG: viewer.scene.pickFromRay(ray, [osmTileset]); ← excluded target!
// CORRECT: exclude Google tiles OR OSM, cast against the other
const excludeList = osmTileset ? [osmTileset] : [];
const result = viewer.scene.pickFromRay(ray, excludeList);
```

---

## 4. FEATURES IMPLEMENTED

### A. Unified Toolbar Row (UPDATED Session 3)
- **All controls in one row:** Search input + Search + Detect | Draw + Undo + Redo + Reset
- **Uniform height:** All elements 36px tall
- **White buttons:** Search and Detect have white background (not blue/green)
- **Toolbar divider:** 1px vertical separator between search and draw tools
- **Fixed width:** Search box uses `fit-content`, search input 220px fixed
- **No flex:** `flex-wrap: nowrap` prevents layout shifts

### B. Split View
- **File:** `static/css/split-view.css`
- **Left Panel:** 3D model viewer (flex: 1, expands to fill)
- **Right Panel:** Project Details form (400px, min: 280px, max: 400px)
- **Collapse:** Chevron button (◀) collapses right panel to 40px
- **Form inputs:** All full width with `.split-input-row` for price+currency
- **Responsive:** Mobile stacks vertically

### C. Roof Info Table (Top Left of 3D Viewer)
- **Columns:** Roof #, Tilt (°), Azimuth (°), Height (m), Area (m²)
- **Colors:** Each roof has different color indicator (🔴🟢🔵🟡🟣🩵)

### D. Address Search
- **Suggestions** close immediately after selection
- **Detect location** no longer shows "Location detected! Accuracy: Xm" message

### E. Drawing Improvements (Session 3)
- **Only draws on 3D tiles** - clicks on empty terrain/sky are ignored
- **Colored polygons** draped on roof tiles via `ClassificationType.CESIUM_3D_TILE`
- **No outline warning** - removed `outline: true` from polygon entities

### F. 3D Model Clean (Session 3)
- **Removed black panel plate** from GLB model (`mesh_builder.py`)
- Panel data (width, height, area) still calculated and stored in stats
- Only colored roof meshes rendered in 3D viewer

### G. Shading Visualization - Scatter Points (Session 5)
- Shading scatter is now a single `THREE.Points` per roof (scene-level)
- Green → Red gradient (low → high shading)
- Each roof uses a unique object name: `roof-scatter-<index>`
- Rendered after ray casting; optional timeout fallback draws base scatter

### H. SolidWorks-Style Panel Placement (REWRITTEN Session 7)
- **File:** `static/js/app/panel-placer.js` — State machine: IDLE → SELECT_PLANE → SKETCH
- **Panel models:** `static/models/solar_panel.glb`, `solar_panel_72.glb`, `solar_panel_120.glb`
- **Workflow:**
  1. Click **⬡ Select Plane** → cursor changes to crosshair, faces highlight on hover
  2. Click a roof face → **Sketch Mode** activates:
     - Camera animates to look straight down at face (500ms eased)
     - Orbit rotation locked (pan + zoom only)
     - Selected face highlighted in blue
     - Top-right: **✓ Finish** (green) + **✗ Cancel** (red) buttons appear
     - Bottom: **SKETCH MODE** badge
  3. Click **⊞ Install Panel ▾** dropdown → choose model
  4. Click on face to place panels (ghost follows cursor)
  5. **Undo/Redo** (toolbar buttons or Ctrl+Z/Ctrl+Shift+Z)
  6. **✓ Finish** → exits sketch, camera returns, panels stay
  7. **✗ Cancel** → exits sketch, reverts all session panels
- **Face detection:** Finds all coplanar triangles (dot product > 0.85) to form full face
- **Dark CAD toolbar:** rgba(40,40,40,0.92) with backdrop-blur
- **Lazy-loaded:** PanelPlacer created on first "Select Plane" click

---

## 5. KEY CODE SNIPPETS

### Unified Toolbar Row (app.html)
```html
<div class="map-controls-row">
  <div class="search-input-wrapper map-search">
    <input type="text" id="addressInput" ...>
  </div>
  <button class="btn-search-action" id="searchBtn">Search</button>
  <button class="btn-search-action btn-detect" id="btnDetectLocation">Detect</button>
  <div class="toolbar-divider"></div>
  <div id="wizardToolbar" class="map-toolbar">
    <button id="btnDrawRoof" ...>Draw</button>
    <button id="btnUndo" ...>Undo</button>
    <button id="btnRedo" ...>Redo</button>
    <button id="btnReset" ...>Reset</button>
  </div>
</div>
```

### CAD Toolbar (app.html — Session 7)
```html
<div class="cad-toolbar" id="cadToolbar">
  <button class="cad-btn" id="btnSelectPlane">⬡ Select Plane</button>
  <div class="cad-separator"></div>
  <div class="cad-dropdown-wrap">
    <button class="cad-btn" id="btnInstallPanel" disabled>⊞ Install Panel ▾</button>
    <div class="cad-dropdown" id="panelDropdown">
      <button class="cad-dropdown-item" data-panel="solar_panel">Standard Panel</button>
      <button class="cad-dropdown-item" data-panel="solar_panel_72">72-Cell Panel</button>
      <button class="cad-dropdown-item" data-panel="solar_panel_120">120-Cell Panel</button>
    </div>
  </div>
  <div class="cad-separator"></div>
  <button class="cad-btn" id="btnPlacerUndo" disabled>↩</button>
  <button class="cad-btn" id="btnPlacerRedo" disabled>↪</button>
</div>
<!-- Top-right sketch confirm -->
<div class="sketch-confirm-bar hidden" id="sketchConfirmBar">
  <button class="sketch-btn sketch-btn-ok" id="btnSketchFinish">✓</button>
  <button class="sketch-btn sketch-btn-cancel" id="btnSketchCancel">✗</button>
</div>
```

### Ray Casting - Correct Usage (main.js)
```javascript
async function castRay(viewer, osmTileset, pointEcef, sunDirection) {
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pointEcef, new Cesium.Cartesian3());
  const upOffset = Cesium.Cartesian3.multiplyByScalar(up, 0.5, new Cesium.Cartesian3());
  const origin = Cesium.Cartesian3.add(pointEcef, upOffset, new Cesium.Cartesian3());
  const ray = new Cesium.Ray(origin, sunDirection);
  const excludeList = osmTileset ? [osmTileset] : [];
  const result = viewer.scene.pickFromRay(ray, excludeList);
  if (!result || !result.object) return false;
  return result.distance > 2.0;
}
```

### Split View Toggle (main.js)
```javascript
btnCollapseRight.addEventListener('click', () => {
  splitRight.classList.toggle('collapsed');
  setTimeout(() => { if (splitViewer) splitViewer.resize(); }, 300);
});
```

---

## 6. FILES MODIFIED (Session 7 — SolidWorks Redesign)

### HTML
- `templates/app.html`
  - Replaced `.panel-toolbar-overlay` with `.cad-toolbar` (dark CAD-style)
  - Added `.sketch-confirm-bar` (✓/✗ top-right) and `.sketch-mode-badge`
  - Rewrote module script wiring: `ensurePanelPlacer()`, dropdown handlers, undo/redo, state callbacks

### CSS
- `static/css/split-view.css`
  - Replaced `.panel-toolbar-overlay` with `.cad-toolbar`, `.cad-btn`, `.cad-dropdown` styles
  - Added `.sketch-confirm-bar`, `.sketch-btn-ok/cancel`, `.sketch-mode-badge`

### JS (REWRITTEN)
- `static/js/app/panel-placer.js` — Complete SolidWorks-style state machine
  - States: `PlacerState.IDLE` → `SELECT_PLANE` → `SKETCH`
  - Face detection: `_findCoplanarFace()` with dot product > 0.85
  - Camera snap: animated 500ms eased transition
  - Undo/redo stack: `{action, panel}` entries
  - Multi-model: `loadPanelModel(key, url)`, `setActiveModel(key)`
  - Ghost panel: semi-transparent clone follows mouse on selected face

## 6b. FILES MODIFIED (Session 6 — Ray Casting Fix)

### JS (MODIFIED)
- `static/js/app/main.js`
  - Fixed `castRay()`: ray casts against Google 3D tiles, excludes OSM
  - Added geodetic UP offset (0.5m) to ray origin
  - Distance threshold changed to 2.0m
  - Removed `if (osm)` guards on shading compute
  - Added debug logging per sun hour
  - Exposed `window.splitViewerRef`
- `static/js/app/map.js`
  - Stored Google 3D tiles in `googleTiles` module variable
  - Added `getGoogleTiles()` getter
- `static/js/app/shading-engine.js`
  - Fixed `castRay()`: passes `[]` instead of `[this.osmTileset]` to exclusion list
  - Added ray origin offset (1.5m along sun direction)

### Assets
- `static/models/solar_panel.glb` — Standard panel
- `static/models/solar_panel_72.glb` — 72-Cell panel
- `static/models/solar_panel_120.glb` — 120-Cell panel

---

## 7. FILES MODIFIED (Session 4)

### HTML
- `templates/app.html`
  - Overlay moved out of `mapMode` and set to fixed (global)
  - Model now faces UP (removed `scale.y *= -1`)
  - Cache-busting query params added to CSS/JS includes

### CSS
- `static/css/split-view.css`
  - Removed gray strip background behind Edit Roof button
- `static/css/wizard.css`
  - Overlay now full-screen fixed

### JS
- `static/js/app/map.js`
  - Added `ensureOsmBuildings()` loader for OSM tileset
- `static/js/app/main.js`
  - Scatter rendering via `THREE.Points` in scene
  - Per-roof scatter names (`roof-scatter-<index>`)
  - Optimized ray casting (key times, 0.6m spacing, downsample cap)
  - Overlay held until scatter completes

### Backend
- `backend/services/mesh_builder.py`
  - Added `mesh_transform` to stats
  - 2-plane roof yaw correction applied (hard-coded -90°)
  - Normal alignment updated to prefer upward normals

---

## 8. KNOWN ISSUES / TODO

### High Priority
1. **Height scale factor** - Currently 0.0712, needs verification with real measurements
2. **Save/Load boundaries** - Drawn boundaries lost on page refresh
3. **Ray casting validation** - Verify shading results with known buildings after Google tiles fix

### Medium Priority
1. **Mobile responsiveness** - Split view + toolbar row needs mobile testing
2. **Roof detection** - Improve automatic roof detection from Google 3D tiles
3. **Multiple roof selection** - Allow selecting multiple roofs for calculations
4. **Panel placement refinement** - Snap-to-grid, panel count/capacity display

### Low Priority
1. **Dark mode toggle**
2. **Export results to PDF**

---

## 9. DEBUGGING TIPS

### Check 3D Model
1. No black plate on roof (panel mesh removed)
2. Roof base parallel to ground, facing upward
3. Colored faces visible (red, green, blue etc.)

### Check Drawing
1. Click on empty terrain → nothing happens (draw guard)
2. Click on 3D building → yellow point appears
3. Close polygon → colored overlay draped on tiles
4. No "outlines unsupported" warning in console

### Check Toolbar Row
1. All buttons same height (36px)
2. Search and Detect are white background
3. Vertical divider separates search from draw tools
4. No free space / no flex stretching

### Check Split View
1. Right panel is 400px wide
2. All form inputs fill full width
3. Chevron collapses to 40px
4. 3D viewer expands when panel collapsed
5. **Shading visualization**: scatter points on roof (green=low, red=high)
6. **Panel buttons**: top-left overlay (Add, Lock, Clear)

### Check Ray Casting (Session 6)
1. Console should show `[Shading] 12:00 → X/Y points shaded` with non-zero X
2. If all 0: check that Google tiles are loaded, OSM is in exclude list
3. `pickFromRay` 2nd param = `objectsToExclude` (NOT objectsToQuery!)
4. Ray origin must be offset above surface (0.5m geodetic UP)

### Check Panel Placement (SolidWorks-style)
1. Click "⬡ Select Plane" → cursor changes to crosshair
2. Hover over roof → faces highlight blue on hover
3. Click a face → camera snaps to top-down view, "SKETCH MODE" badge appears
4. Top-right: ✓ (green) and ✗ (red) buttons appear
5. "⊞ Install Panel ▾" dropdown becomes enabled → pick a model
6. Click on highlighted face → panel placed, ghost follows for next placement
7. Ctrl+Z / Ctrl+Shift+Z → undo/redo
8. Click ✓ → exits sketch, panels stay, camera returns to 3D
9. Click ✗ → exits sketch, session panels removed

---

## 10. USER PREFERENCES (Remember)

1. **Roof faces UPWARD** (base parallel to ground)
2. **Scale factor 0.0712** for height display
3. **Split view:** 3D left, Form right (400px), collapsible
4. **Roof info table:** Top-left of 3D viewer
5. **Crosshair cursor** on map for drawing
6. **White buttons** for Search and Detect (not blue/green)
7. **No black panel plate** on 3D model
8. **Draw only on 3D tiles** (not empty terrain)
9. **No "Location detected" message** after geolocation
10. **Fixed toolbar row** - no flex, no free space
11. **Shading scatter** - points on roof surface for shading viz (green=low, red=high)
12. **Panel placement** - SolidWorks-style: Select Plane → Sketch Mode → Install → ✓ Finish

---

## 11. NEXT STEPS (Suggested)

1. Validate ray casting results with real shaded buildings
2. Add panel snap-to-grid / alignment tools on sketch mode
3. Panel count + capacity display in sketch mode
4. Add save/load for drawn boundaries
5. Improve height calculation accuracy
6. Mobile responsive testing for toolbar row
7. PDF export of calculation results

---

## HOW TO USE THIS FILE

**At start of new session, say:**
> "Read PROJECT_STATE.md and summarize what we did last time"

**If something is broken, check:**
1. Toolbar row: all in `.map-controls-row`, 36px height, `flex-wrap: nowrap`
2. Draw guard: `viewer.scene.pick(e.position)` must return truthy
3. 3D model: `model.rotation.x = +Math.PI / 2` (no Y flip)
4. Panel mesh: `trimesh.util.concatenate(parts)` — no `panel_parts`
5. Split view CSS: `split-view.css` imported via `wizard.css`
6. Ray casting: `pickFromRay(ray, [osmTileset])` — 2nd param EXCLUDES
7. Panel placer: needs `window.splitViewerRef` set in `initSplitViewer()`
8. CAD toolbar: `.cad-toolbar` in `split-view.css`, buttons wired in module script
9. PanelPlacer state machine: `PlacerState.IDLE/SELECT_PLANE/SKETCH`

**To continue work:**
> "Based on PROJECT_STATE.md, I want to [feature]. Current issue: [problem]"
