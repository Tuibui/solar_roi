# Solar ROI Calculator - Project State

> **Last Updated:** 2026-02-21 (Session 8)
> **Session Summary:** Added SolidWorks-style FeatureManager project tree (left sidebar), panel browser catalog, XYZ triad. Grey theme, roofs-only tree, right-click "Add Panel" workflow.

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
  - main.js         # UI controllers + project tree wiring
  - map.js          # Cesium init + Google tiles + OSM buildings
  - search.js       # Address search (fixed suggestions bug)
  - wizard.js       # State management
  - project-tree.js # SolidWorks FeatureManager tree + panel browser (NEW Session 8)
  - panel-placer.js # SolidWorks-style panel placement (REWRITTEN Session 7)
  - shading-engine.js    # Shading ray cast engine (offscreen Cesium)
  - shading-controller.js # Monthly shading orchestrator
  - shading-visualizer.js # Heatmap visualization
  - roof-sampler.js      # Grid/uniform roof surface sampling
/static/css/        # Styles
  - base.css        # Base variables and resets
  - app.css         # App-specific styles (analyze button, cursor)
  - wizard.css      # Wizard UI + imports split-view.css
  - split-view.css  # Split view layout + tree panel + panel browser styles
/static/models/     # 3D model assets
  - solar_panel.glb     # Standard panel GLB
  - solar_panel_72.glb  # 72-Cell panel GLB
  - solar_panel_120.glb # 120-Cell panel GLB
/backend/           # Flask API
  - services/mesh_builder.py  # GLB model generation (no panel mesh)
```

---

## 2. CURRENT LAYOUT (After Analyze)

### Split View Layout (app.html)
```
┌─────────────┬────────────────────────┬──────────────────────┐
│ MY HOUSE [◀]│                        │ Project Details  [◀] │
│─────────────│   [3D ROOF MODEL]      │──────────────────────│
│ ▼ Roofs (3) │   (base facing up)     │ Appliances           │
│  🔴 Roof_1  │                        │ Monthly Electric Bill│
│   ▼ Panels  │   [XYZ Triad]          │ Electricity Price    │
│   ▼ Props   │   (bottom-left)        │ Grid Export Price    │
│     Area    │                  [✓][✗]│ Save Project         │
│     Tilt    │                        │                      │
│     Azimuth │    [SKETCH MODE]       │                      │
│     Usable  │                        │                      │
│  🟢 Roof_2  │   [Edit Roof]          │                      │
│   ...       │                        │                      │
│─────────────│                        │                      │
│ Ready       │                        │                      │
└─────────────┴────────────────────────┴──────────────────────┘
  ↑ tree panel    ↑ 3D viewer              ↑ form (400px)
  (250px)          (flex: 1)               (collapsible)
```

### Right-Click "Add Panel" Flow
```
Right-click Roof_1 → context menu: [⊞ Add Panel]
   ↓
┌─────────────┐
│ ← Back      │
│ Add Panel — │
│ Roof_1      │
│─────────────│
│ [Search...] │
│─────────────│
│ ┌─────────┐ │
│ │ LONGi   │ │  ← panel cards
│ │ Hi-MO 6 │ │     brand, model
│ │ 580W $185│ │     watt, price
│ └─────────┘ │
│ ┌─────────┐ │
│ │ JA Solar│ │
│ │ DeepBlue│ │
│ │ 550W $165│ │
│ └─────────┘ │
│   ...       │
└─────────────┘
Click a card → adds to Panels folder → returns to tree
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
- **Left Panel:** Project tree + 3D model viewer (flex: 1, expands to fill)
- **Right Panel:** Project Details form (400px, min: 280px, max: 400px)
- **Collapse:** Chevron button (◀) collapses right panel to 40px
- **Form inputs:** All full width with `.split-input-row` for price+currency
- **Responsive:** Mobile stacks vertically

### C. Project Tree — SolidWorks FeatureManager (NEW Session 8)
- **File:** `static/js/app/project-tree.js` — IIFE module, `window.ProjectTree`
- **Theme:** Light grey (#d4d4d4/#e8e8e8), dark text, 14px fonts
- **Header:** "My House" with collapse toggle (◀)
- **Tree structure:**
  ```
  ▼ My House (badge: roof count)
    🔴 Roof_1 (expanded by default)
      ▼ Panels (added via panel browser)
      ▼ Properties
        Area       45.2 m²
        Tilt       25.5°
        Azimuth    180°
        Usable Area 38.5 m²
    🟢 Roof_2
      ...
  ```
- **Selection:** Blue highlight (#0060c0) with white text
- **Right-click roof:** Context menu shows only "⊞ Add Panel"
- **Panel browser:** Replaces tree body with searchable panel catalog
  - 10 demo panels: LONGi, JA Solar, Trina Solar, Canadian Solar, Jinko Solar, REC, SunPower, Q CELLS, Risen Energy, Hyundai
  - Cards show: brand, model, watt, price, efficiency
  - Click card → adds panel to roof's Panels folder, returns to tree
  - Search filters by brand, model, or watt
  - "← Back" button returns to tree without adding
- **Keyboard nav:** Arrow keys + Enter for expand/collapse
- **Status bar:** Blue (#007acc) bottom bar with breadcrumb path
- **Guide lines:** Vertical indent lines for tree hierarchy
- **Public API:** `init`, `render`, `updateRoofs`, `updatePanels`, `selectNode`, `showPanelBrowser`, `hidePanelBrowser`

### D. XYZ Triad — Orientation Indicator (NEW Session 8)
- Small 80×80px Three.js viewport in bottom-left of 3D viewer
- Red (X), Green (Y), Blue (Z) axes with letter labels
- Syncs rotation with main camera via `addAnimHook`
- Transparent background, non-interactive (`pointer-events: none`)

### E. Roof Info Table (Top Left of 3D Viewer)
- **Columns:** Roof #, Tilt (°), Azimuth (°), Height (m), Area (m²)
- **Colors:** Each roof has different color indicator (🔴🟢🔵🟡🟣🩵)

### F. Address Search
- **Suggestions** close immediately after selection
- **Detect location** no longer shows "Location detected! Accuracy: Xm" message

### G. Drawing Improvements (Session 3)
- **Only draws on 3D tiles** - clicks on empty terrain/sky are ignored
- **Colored polygons** draped on roof tiles via `ClassificationType.CESIUM_3D_TILE`
- **No outline warning** - removed `outline: true` from polygon entities

### H. 3D Model Clean (Session 3)
- **Removed black panel plate** from GLB model (`mesh_builder.py`)
- Panel data (width, height, area) still calculated and stored in stats
- Only colored roof meshes rendered in 3D viewer

### I. Shading Visualization - Scatter Points (Session 5)
- Shading scatter is now a single `THREE.Points` per roof (scene-level)
- Green → Red gradient (low → high shading)
- Each roof uses a unique object name: `roof-scatter-<index>`
- Rendered after ray casting; optional timeout fallback draws base scatter

### J. SolidWorks-Style Panel Placement (REWRITTEN Session 7)
- **File:** `static/js/app/panel-placer.js` — State machine: IDLE → SELECT_PLANE → SKETCH
- **Panel models:** `static/models/solar_panel.glb`, `solar_panel_72.glb`, `solar_panel_120.glb`
- **Note:** Tab bar removed in Session 8 — panel placement now triggered via tree context menu
- **Workflow:**
  1. Right-click roof in tree → "Add Panel" → select from catalog
  2. Or programmatically via PanelPlacer for advanced sketch mode
- **Face detection:** Finds all coplanar triangles (dot product > 0.85) to form full face
- **Lazy-loaded:** PanelPlacer created on first use

---

## 5. KEY CODE SNIPPETS

### Project Tree Init (main.js)
```javascript
function setupProjectTree() {
  const treeBody = document.getElementById('projectTreeBody');
  if (!treeBody || !window.ProjectTree) return;
  ProjectTree.init(treeBody);
  ProjectTree.onSelect = (id, node) => { /* highlight in 3D */ };
  ProjectTree.onContextAction = (action, node) => { /* handle actions */ };
}
```

### XYZ Triad Setup (main.js + app.html)
```javascript
// In initSplitViewer():
if (window.threeViewer.setupTriad) {
  const triad = window.threeViewer.setupTriad(splitViewer);
  if (triad && splitViewer.addAnimHook) splitViewer.addAnimHook(triad.update);
}
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

## 6. FILES MODIFIED BY SESSION

### Session 8 — Project Tree + Panel Browser + UI Refinements

#### NEW Files
- `static/js/app/project-tree.js` — SolidWorks FeatureManager tree + panel browser

#### HTML (`templates/app.html`)
- Added `.project-tree-panel` in `.split-left` (before 3D viewer column)
- Added `.viewport-triad` div inside `.split-viewer-wrap`
- Removed `.cad-toolbar` / `.cad-tab-bar` (Select Plane / Install Panel buttons)
- Added `setupTriad()` function in module script
- Added `addAnimHook` to createViewer return

#### CSS (`static/css/split-view.css`)
- Added project tree styles: `.project-tree-panel`, `.ptree-*` (header, body, row, arrow, icon, label, value, badge, children, status bar)
- Light grey theme (#d4d4d4 bg, #333 text, 14px fonts)
- Selection: blue #0060c0 with white text
- Context menu: `.ptree-ctx-menu`, `.ptree-ctx-item`
- Panel browser: `.panel-browser`, `.pb-header`, `.pb-search`, `.pb-card`, `.pb-brand`, `.pb-model`, `.pb-watt`, `.pb-price`
- XYZ triad: `.viewport-triad` (80×80px absolute bottom-left)
- Removed old dark theme styles (#252526), filter input styles

#### JS (`static/js/app/main.js`)
- Added `setupProjectTree()` — initializes tree, wires selection/context callbacks
- Added XYZ triad setup in `initSplitViewer()`
- Removed filter input wiring
- `ProjectTree.updateRoofs()` called after roof analysis

### Session 7 — SolidWorks Panel Placement
- `static/js/app/panel-placer.js` — Complete rewrite (state machine)
- `templates/app.html` — CAD toolbar, sketch confirm, module script wiring
- `static/css/split-view.css` — CAD toolbar styles, sketch mode styles

### Session 6 — Ray Casting Fix
- `static/js/app/main.js` — Fixed ray casting against Google tiles
- `static/js/app/map.js` — `getGoogleTiles()` getter
- `static/js/app/shading-engine.js` — Fixed ray exclusion list

---

## 7. KNOWN ISSUES / TODO

### High Priority
1. **Panel browser uses demo data** — need real panel database (brand, model, watt, price)
2. **Height scale factor** - Currently 0.0712, needs verification with real measurements
3. **Save/Load boundaries** - Drawn boundaries lost on page refresh

### Medium Priority
1. **Connect panel browser to panel placer** — selecting panel should trigger 3D placement
2. **Panel placement refinement** - Snap-to-grid, panel count/capacity display
3. **Mobile responsiveness** - Split view + tree panel needs mobile testing
4. **Roof detection** - Improve automatic roof detection from Google 3D tiles

### Low Priority
1. **Dark mode toggle**
2. **Export results to PDF**
3. **Multiple roof selection** - Allow selecting multiple roofs for calculations

---

## 8. DEBUGGING TIPS

### Check Project Tree
1. Header shows "My House" with collapse toggle
2. Each roof expanded by default showing Properties (Area, Tilt, Azimuth, Usable Area)
3. Right-click roof → only "⊞ Add Panel" in context menu
4. Click "Add Panel" → panel browser replaces tree body
5. Search filters panel cards; click card → adds to Panels folder
6. "← Back" returns to tree view

### Check XYZ Triad
1. Small axes indicator in bottom-left of 3D viewer
2. Rotates with camera orientation
3. Red=X, Green=Y, Blue=Z with letter labels

### Check 3D Model
1. No black plate on roof (panel mesh removed)
2. Roof base parallel to ground, facing upward
3. Colored faces visible (red, green, blue etc.)

### Check Drawing
1. Click on empty terrain → nothing happens (draw guard)
2. Click on 3D building → yellow point appears
3. Close polygon → colored overlay draped on tiles
4. No "outlines unsupported" warning in console

### Check Split View
1. Tree panel (250px) on far left with grey background
2. 3D viewer fills remaining space
3. Right panel is 400px wide, collapsible
4. Tree collapse toggle (◀) hides tree to 32px
5. **Shading visualization**: scatter points on roof (green=low, red=high)

### Check Ray Casting (Session 6)
1. Console should show `[Shading] 12:00 → X/Y points shaded` with non-zero X
2. If all 0: check that Google tiles are loaded, OSM is in exclude list
3. `pickFromRay` 2nd param = `objectsToExclude` (NOT objectsToQuery!)

---

## 9. USER PREFERENCES (Remember)

1. **Roof faces UPWARD** (base parallel to ground)
2. **Scale factor 0.0712** for height display
3. **Split view:** Tree left, 3D center, Form right (400px), collapsible
4. **Tree panel:** Light grey theme, 14px fonts, "My House" header
5. **Roof right-click:** Only "Add Panel" (no other context actions)
6. **Roofs expanded by default** showing Properties (Area, Tilt, Azimuth, Usable Area)
7. **No filter/search** in tree header
8. **No Select Plane / Install Panel tab bar** — panel adding via tree context menu
9. **Crosshair cursor** on map for drawing
10. **White buttons** for Search and Detect (not blue/green)
11. **No black panel plate** on 3D model
12. **Draw only on 3D tiles** (not empty terrain)
13. **No "Location detected" message** after geolocation
14. **Fixed toolbar row** - no flex, no free space
15. **Shading scatter** - points on roof surface (green=low, red=high)
16. **Only roof color emojis** in tree (🔴🟢🔵🟡🟣🩵) — no other emojis

---

## 10. NEXT STEPS (Suggested)

1. Connect panel browser selection to actual 3D panel placement
2. Build real panel database (replace demo data)
3. Validate ray casting results with real shaded buildings
4. Panel count + capacity display per roof
5. Add save/load for drawn boundaries
6. Improve height calculation accuracy
7. Mobile responsive testing

---

## HOW TO USE THIS FILE

**At start of new session, say:**
> "Read PROJECT_STATE.md and summarize what we did last time"

**If something is broken, check:**
1. Tree panel: `project-tree.js` loaded before `main.js`, `ProjectTree.init()` called
2. Tree theme: light grey (#d4d4d4), 14px fonts, dark text (#333)
3. Panel browser: right-click roof → "Add Panel" → catalog with demo data
4. XYZ triad: `setupTriad()` in module script, `addAnimHook` in createViewer
5. Draw guard: `viewer.scene.pick(e.position)` must return truthy
6. 3D model: `model.rotation.x = +Math.PI / 2` (no Y flip)
7. Panel mesh: `trimesh.util.concatenate(parts)` — no `panel_parts`
8. Split view CSS: `split-view.css` imported via `wizard.css`
9. Ray casting: `pickFromRay(ray, [osmTileset])` — 2nd param EXCLUDES
10. Panel placer: needs `window.splitViewerRef` set in `initSplitViewer()`

**To continue work:**
> "Based on PROJECT_STATE.md, I want to [feature]. Current issue: [problem]"
