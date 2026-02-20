# Solar ROI Calculator - Project State

> **Last Updated:** 2026-02-20 (Session 6)
> **Session Summary:** Fixed critical ray casting bug (pickFromRay exclusion backwards); switched shading from OSM to Google 3D tiles; added drag-and-drop solar panel placement on 3D roof

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
  - panel-placer.js # Drag-and-drop solar panel placement (NEW Session 6)
  - shading-engine.js    # Shading ray cast engine (offscreen Cesium)
  - shading-controller.js # Monthly shading orchestrator
  - shading-visualizer.js # Heatmap visualization
  - roof-sampler.js      # Grid/uniform roof surface sampling
/static/css/        # Styles
  - base.css        # Base variables and resets
  - app.css         # App-specific styles (analyze button, cursor)
  - wizard.css      # Wizard UI + imports split-view.css
  - split-view.css  # Split view layout + panel toolbar overlay
/static/models/     # 3D model assets
  - solar_panel.glb # Solar panel GLB model for drag-and-drop (NEW Session 6)
/backend/           # Flask API
  - services/mesh_builder.py  # GLB model generation (no panel mesh)
```

---

## 2. CURRENT LAYOUT (After Analyze)

### Split View Layout (app.html)
```
┌──────────────────────────────────┬──────────────────────┐
│ [☀️Add][🔓Lock][🗑️Clear] ← top-left│ Project Details  [◀] │
│  ┌─────────────────────────┐     ├──────────────────────┤
│  │ Roof│Tilt│Azim│Hgt│Area │     │ Appliances           │
│  │ 🔴#1│25.5│180 │2.8│45.2│     │ Monthly Electric Bill│
│  │ 🟢#2│30.0│ 90 │3.2│38.5│     │ Electricity Price    │
│  └─────────────────────────┘     │ Grid Export Price    │
│                                  │ Save Project         │
│         [3D ROOF MODEL]         │                      │
│      (base facing upward)       │                      │
│      (solar panels draggable)   │                      │
│  [Edit Roof]                    │                      │
│  [shading: colored squares on   │                      │
│   roof surface]                 │                      │
└──────────────────────────────────┴──────────────────────┘
         ↑                                  ↑
    split-left (flex: 1)         split-right (400px, collapsible)
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

### H. Solar Panel Drag & Drop (NEW Session 6)
- **File:** `static/js/app/panel-placer.js`
- **Panel model:** `static/models/solar_panel.glb`
- **☀️ Add Panel** — click to start drag, move mouse over roof, click to place
- **🔓 Lock View** — disables orbit, enables panel repositioning by drag
- **🗑️ Clear Panels** — removes all placed panels
- **Delete/Backspace** — removes last panel (when locked)
- **Escape** — cancels current drag
- Panels auto-align to roof surface normal
- Buttons overlaid at **top-left** of 3D viewer (`.panel-toolbar-overlay`)
- Lazy-loaded: panel GLB only loaded on first "Add Panel" click

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

### Panel Toolbar Overlay (app.html)
```html
<div class="panel-toolbar-overlay">
  <button class="btn-small" id="btnAddPanel">☀️ Add Panel</button>
  <button class="btn-small" id="btnLockView">🔓 Lock View</button>
  <button class="btn-small" id="btnClearPanels">🗑️ Clear Panels</button>
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

## 6. FILES MODIFIED (Session 6)

### HTML
- `templates/app.html`
  - Added panel toolbar overlay buttons (Add Panel, Lock View, Clear Panels) inside `split-viewer-wrap`
  - Added `panel-placer.js` script tag
  - Added PanelPlacer wiring in module script (GLTFLoader access)

### CSS
- `static/css/split-view.css`
  - Added `.panel-toolbar-overlay` (absolute, top-left, z-index 10)
  - Added `.active` state for lock button (blue)

### JS (NEW)
- `static/js/app/panel-placer.js` — Full drag-and-drop panel placement system

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

### Assets (NEW)
- `static/models/solar_panel.glb` — Solar panel 3D model for drag-and-drop

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

### Check Panel Placement
1. Click "☀️ Add Panel" → ghost follows mouse over roof
2. Click on roof → panel placed, aligned to surface
3. "🔓 Lock View" → orbit disabled, drag panels to reposition
4. "🗑️ Clear Panels" → all panels removed
5. Delete key → removes last panel (when locked)

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
12. **Panel placement** - drag & drop from top-left overlay buttons, lock view to adjust

---

## 11. NEXT STEPS (Suggested)

1. Validate ray casting results with real shaded buildings
2. Add panel snap-to-grid / alignment tools
3. Add save/load for drawn boundaries
4. Improve height calculation accuracy
5. Mobile responsive testing for toolbar row
6. PDF export of calculation results

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

**To continue work:**
> "Based on PROJECT_STATE.md, I want to [feature]. Current issue: [problem]"
