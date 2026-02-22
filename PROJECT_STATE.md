# Solar ROI Calculator - Project State

> **Last Updated:** 2026-02-22 (Session 9)
> **Session Summary:** Full panel placement workflow with 3D editing (right-click context menus, ghost rotation, TransformControls move gizmo), tree restructure (Project → ROOF / INVERTER / BATTERY), equipment browser catalogs.

---

## 1. ARCHITECTURE OVERVIEW

### Tech Stack
- **Frontend:** CesiumJS (3D map), Three.js 0.161.0 (3D models + TransformControls), vanilla JS
- **Backend:** Flask, SQLAlchemy, SQLite
- **3D Pipeline:** User draws on Cesium → Backend generates GLB → Three.js displays

### Key Directories
```
/templates/          # HTML pages
  - app.html        # Main map + split view (imports THREE, OrbitControls, GLTFLoader, TransformControls)
  - calculate.html  # Results page with charts
  - login.html      # Auth
/static/js/app/     # Frontend JS
  - draw.js         # Roof drawing + undo/redo (draws only on 3D tiles)
  - main.js         # UI controllers + project tree wiring + panel placement callbacks
  - map.js          # Cesium init + Google tiles + OSM buildings
  - search.js       # Address search (fixed suggestions bug)
  - wizard.js       # State management
  - project-tree.js # SolidWorks FeatureManager tree + panel/equipment browsers
  - panel-placer.js # Panel placement state machine + 3D editing (ghost rotate, move gizmo, context menus)
  - shading-engine.js    # Shading ray cast engine (offscreen Cesium)
  - shading-controller.js # Monthly shading orchestrator
  - shading-visualizer.js # Heatmap visualization
  - roof-sampler.js      # Grid/uniform roof surface sampling
/static/css/        # Styles
  - base.css        # Base variables and resets
  - app.css         # App-specific styles (analyze button, cursor)
  - wizard.css      # Wizard UI + imports split-view.css
  - split-view.css  # Split view layout + tree panel + browser styles + sketch bar
/static/models/     # 3D model assets
  - solar_panel.glb     # 60-Cell panel GLB (370W)
  - solar_panel_72.glb  # 72-Cell panel GLB (450W)
  - solar_panel_120.glb # 120-Cell panel GLB (550W)
/backend/           # Flask API
  - services/mesh_builder.py  # GLB model generation (no panel mesh)
```

---

## 2. CURRENT LAYOUT (After Analyze)

### Split View Layout (app.html)
```
┌──────────────┬────────────────────────┬──────────────────────┐
│ Project   [◀]│                        │ Project Details  [◀] │
│──────────────│   [3D ROOF MODEL]      │──────────────────────│
│ ▼ ROOF (4)   │   (base facing up)     │ Appliances           │
│  🔴 Roof_1   │                        │ Monthly Electric Bill│
│   ▶ Panels   │   [XYZ Triad]          │ Electricity Price    │
│   ▼ Props    │   (bottom-left)        │ Grid Export Price    │
│     Area 45m²│                        │ Save Project         │
│     Tilt 25° │              [↩][↪][✓][✗]                    │
│  🟢 Roof_2   │               SKETCH BAR                     │
│   ...        │                        │                      │
│ ⚡ INVERTER   │                        │                      │
│ 🔋 BATTERY   │                        │                      │
│──────────────│                        │                      │
│ [drag resize]│                        │                      │
└──────────────┴────────────────────────┴──────────────────────┘
  ↑ tree panel    ↑ 3D viewer              ↑ form (400px)
  (200-520px)      (flex: 1)               (collapsible)
```

### Panel Placement Workflow
```
1. Right-click Roof_1 → [⊞ Add Panel] → Panel Browser opens
2. Search & click panel card (stays open, card toggles active)
3. Ghost panel follows mouse on 3D roof face
4. Right-click ghost → [↻ Rotate +90°] [↺ Rotate −90°] (before placing)
5. Click to place → ghost respawns for next placement
6. Right-click placed panel → [↻ Rotate +90°] [↺ Rotate −90°] [✥ Move] [🗑 Delete]
7. "Move" → TransformControls XYZ gizmo (constrained to roof plane)
8. Click ✓ to finish or ✗ to cancel → tree updates panel count
```

### Equipment Browser (Inverter / Battery)
```
Right-click INVERTER → [➕ Add] → Equipment Browser opens
┌──────────────┐
│ ← Back       │
│ Add INVERTER │
│──────────────│
│ [Search...]  │
│──────────────│
│ ┌──────────┐ │
│ │ SMA      │ │  ← equipment cards
│ │ Sunny Boy│ │     brand, model
│ │ 5kW $1200│ │     power, price
│ └──────────┘ │
│   ...        │
└──────────────┘
Click card → adds to INVERTER tree folder
Right-click item in tree → [🗑 Delete]
Same UX for BATTERY folder
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

### GLB Roof Structure
```
gltf.scene → world (Group) → roof_0, roof_1, roof_2, roof_3
```
- `_cacheRoofMeshes()` uses `traverse()` to find ALL descendant meshes
- Filters out `_isSolarPanel`, `face-highlight`, `model-axes`
- Sorts by `roof_N` name pattern for stable indexing

### Panel Identification
- All panel descendants get `child.userData._isSolarPanel = true`
- Prevents panel meshes from being collected as roof meshes

### Height Scale Factor
- **Value:** `0.0712` (for roof info table display)
- **Usage:** `const height = (rawHeight * 0.0712).toFixed(2);`

### Drawing Guard (draw.js)
```javascript
// Only allow clicks on 3D tiles (buildings/roofs), not empty terrain
const picked = viewer.scene.pick(e.position);
if (!picked) return;
```

### GLB Model - No Panel Mesh (mesh_builder.py)
```python
# Panel mesh excluded from 3D model (was causing black plate)
model = trimesh.util.concatenate(parts)
```

### Shading Ray Casting (main.js) — FIXED Session 6
- Casts against **Google 3D photorealistic tiles** (complete coverage)
- **Excludes OSM buildings** (incomplete, was causing 0 results)
- Ray origin offset **0.5m upward** (geodetic surface normal) to avoid self-intersection
- Distance threshold **> 2.0m** to ignore own building hits
- `pickFromRay` 2nd param = `objectsToExclude` (NOT objectsToQuery!)

---

## 4. FEATURES IMPLEMENTED

### A. Project Tree — SolidWorks FeatureManager (Sessions 8-9)
- **File:** `static/js/app/project-tree.js` — IIFE module, `window.ProjectTree`
- **Theme:** Light grey (#d4d4d4/#e8e8e8), dark text, 14px fonts
- **Tree structure:**
  ```
  ▼ Project
    ▼ ROOF (badge: count)
      🔴 Roof_1 (collapsed by default)
        ▶ Panels
        ▼ Properties
          Area       45.2 m²
          Tilt       25.5°
          Azimuth    180°
          Usable Area 38.5 m²
      🟢 Roof_2 ...
    ⚡ INVERTER (badge: count)
      ⚡ SMA Sunny Boy 5.0
    🔋 BATTERY (badge: count)
      🔋 Tesla Powerwall 2
  ```
- **Node types:** `root`, `roof-group`, `equipment-group`, `feature`, `panels`, `panel`, `folder`, `param`, `equipment-item`
- **Context menus per type:**
  - `roof-group` → Expand All / Collapse All
  - `feature` (roof) → ⊞ Add Panel
  - `panels` → ✏️ Edit Roof
  - `panel` → 🗑 Delete Panel
  - `equipment-group` → ➕ Add / Expand All / Collapse All
  - `equipment-item` → 🗑 Delete
- **Selection:** Blue highlight (#0060c0) with white text
- **Collapse propagation:** Collapsing parent collapses all children recursively
- **Resize handle:** Drag bottom edge to resize (200px–520px)
- **Keyboard nav:** Arrow keys + Enter for expand/collapse
- **Panel browser:** Search catalog (3 GLB-matched panels), toggle selection, stays open
- **Equipment browser:** Search catalog (10 inverters, 10 batteries), click to add to tree
- **Public API:** `init`, `render`, `updateRoofs`, `updatePanels`, `selectNode`, `showPanelBrowser`, `hidePanelBrowser`, `showEquipmentBrowser`, `hideEquipmentBrowser`

### B. Panel Placement & 3D Editing (Sessions 7-9)
- **File:** `static/js/app/panel-placer.js` — State machine: IDLE → SELECT_PLANE → SKETCH
- **Panel models:** 3 GLB files (60-cell, 72-cell, 120-cell)
- **Workflow:**
  1. Right-click roof → "Add Panel" → panel browser → select model → ghost follows mouse
  2. Right-click ghost → rotate ±90° before placing
  3. Click to place → ghost respawns for next panel
  4. Right-click placed panel → context menu: Rotate +90°, Rotate −90°, Move, Delete
  5. "Move" → Three.js TransformControls gizmo (XYZ arrows, Y hidden, constrained to roof plane)
  6. ✓ finish / ✗ cancel → confirmed panels persist, tree updates
- **Cross-roof prevention:** Panels only editable on their assigned roof
- **Panel positioning:** Projects onto roof surface plane, 0.005 offset along normal
- **Camera:** Snaps to roof face normal, dynamic distance `max(8, faceRadius * 3)`
- **Sketch controls:** Orbit disabled (pan + zoom only), undo/redo (Ctrl+Z/Ctrl+Shift+Z)
- **Key bindings:** R = rotate, Delete = delete, Escape = deselect/cancel
- **Edit Roof:** Right-click "Panels" → "✏️ Edit Roof" enters sketch without opening browser

### C. Equipment Catalogs (Session 9)
- **Inverters (10 demo):** SMA, Fronius, Enphase, Huawei, SolarEdge, GoodWe
  - Fields: brand, model, kW, phase, price, efficiency, type (String/Micro/Optimizer/Hybrid)
- **Batteries (10 demo):** Tesla, BYD, Enphase, LG Energy, Pylontech, SolarEdge, Huawei, Alpha ESS
  - Fields: brand, model, kWh, kW, price, cycles, chemistry (LFP/NMC), warranty

### D. Split View & Layout
- **Left Panel:** Project tree (resizable 200-520px)
- **Center:** 3D viewer (flex: 1) with XYZ triad (bottom-left 80×80px)
- **Right Panel:** Project Details form (400px, collapsible)
- **Sketch bar:** Undo / Redo / ✓ Finish / ✗ Cancel (top-right of 3D viewer)

### E. XYZ Triad — Orientation Indicator (Session 8)
- Small 80×80px Three.js viewport in bottom-left of 3D viewer
- Red (X), Green (Y), Blue (Z) axes with letter labels
- Syncs rotation with main camera

### F. Shading Visualization - Scatter Points (Session 5)
- `THREE.Points` per roof with green→red gradient (low→high shading)
- Object name: `roof-scatter-<index>`

### G. Map & Drawing (Sessions 1-3)
- Unified toolbar row: Search + Detect | Draw + Undo + Redo + Reset (all 36px, white)
- Only draws on 3D tiles (not empty terrain)
- Colored polygons via `ClassificationType.CESIUM_3D_TILE`
- No panel mesh in GLB model (removed black plate)

---

## 5. KEY CODE PATTERNS

### Context Action Wiring (main.js)
```javascript
ProjectTree.onContextAction = (action, data) => {
  'add-panel'      → snapCameraToRoof(roofIndex), opens panel browser
  'panel-selected' → startPanelPlacement(data) — loads GLB, enters sketch
  'edit-roof'      → enterEditRoof(roofIndex) — sketch without browser
  'browser-closed' → cancelSketch if active
  'delete-panel'   → handleDeletePanel(data)
};
```

### Panel Placer Lifecycle
```javascript
ensurePanelPlacer()           // Lazy init (created once)
  → panelPlacer.setModel(key) // Load GLB panel model
  → panelPlacer.enterSketchForRoof(roofIndex, viewer) // Snap camera, cache meshes
  → panelPlacer.startInstall() // Begin ghost placement
  → panelPlacer.finishSketch() // Confirm → sessionPanels → confirmedPanels
  → panelPlacer.cancelSketch() // Revert → remove sessionPanels
```

### Critical Bug Pattern (SOLVED)
```javascript
// hidePanelBrowser() sets panelBrowserRoofId = null
// Must save roofId BEFORE calling hidePanelBrowser()
const roofId = panelBrowserRoofId;  // ← save first
hidePanelBrowser();                  // ← then hide
startPlacement(roofId);              // ← use saved value
```

### Callback Clearing Before Sketch Cancel
```javascript
// When switching roofs, clear callbacks BEFORE cancelSketch()
// to prevent old onCancel from nuking browser state
panelPlacer.onFinish = null;
panelPlacer.onCancel = null;
panelPlacer.cancelSketch();  // safe — no callbacks fire
```

---

## 6. FILES MODIFIED BY SESSION

### Session 9 — Panel Editing + Equipment Folders + Tree Restructure
- `project-tree.js` — Renamed root to "ROOF", added INVERTER/BATTERY groups with demo catalogs, equipment browser, delete-equipment, roof-group/equipment-group node types
- `panel-placer.js` — Ghost rotation (_ghostRotationDeg, right-click ghost menu), TransformControls move gizmo (_enableMoveGizmo/_disableMoveGizmo/_snapPanelToRoof), 3D right-click context menu for placed panels (rotate/move/delete), _raycastConfirmedPanels filters by roof, cross-roof prevention, panel surface projection
- `main.js` — Tree resize handle, enterEditRoof(), startPanelPlacement with callback clearing, updateTreePanelsForRoof (global), handleDeletePanel
- `app.html` — TransformControls import, sketch bar (undo/redo/✓/✗), removed panel-edit-bar toolbar and old button wiring
- `split-view.css` — Resize handle, .pb-card.active toggle, removed .panel-edit-bar CSS

### Session 8 — Project Tree + Panel Browser
- `project-tree.js` — NEW: SolidWorks FeatureManager tree + panel browser
- `app.html` — Tree panel HTML, triad div, setupTriad(), addAnimHook
- `split-view.css` — Tree styles, panel browser styles, triad
- `main.js` — setupProjectTree(), XYZ triad init

### Session 7 — SolidWorks Panel Placement
- `panel-placer.js` — Complete rewrite (state machine)
- `app.html` — CAD toolbar, sketch confirm, module script wiring

### Session 6 — Ray Casting Fix
- `main.js` — Fixed ray casting against Google tiles
- `shading-engine.js` — Fixed ray exclusion list

---

## 7. KNOWN ISSUES / TODO

### High Priority
1. **Equipment catalogs use demo data** — need real inverter/battery databases
2. **Panel catalog uses demo data** — need real panel database (brand, model, watt, price)
3. **Height scale factor** - Currently 0.0712, needs verification
4. **Save/Load boundaries** - Drawn boundaries lost on page refresh

### Medium Priority
1. **Snap-to-grid** for panel placement
2. **Panel count/capacity display** per roof (total Watts, area coverage %)
3. **Mobile responsiveness** - Split view + tree panel needs testing
4. **Roof auto-detection** - Improve from Google 3D tiles
5. **Inverter/battery sizing** - Auto-recommend based on panel capacity

### Low Priority
1. **Dark mode toggle**
2. **Export results to PDF**
3. **Multiple roof selection** for batch calculations

---

## 8. DEBUGGING TIPS

### Check Project Tree
1. Root shows "Project" with ROOF, INVERTER, BATTERY children
2. Roofs collapsed by default, properties show values (Area, Tilt, etc.)
3. Right-click roof → "⊞ Add Panel" → panel browser
4. Right-click Panels → "✏️ Edit Roof" → sketch mode
5. Right-click INVERTER/BATTERY → "➕ Add" → equipment browser
6. Drag bottom of tree panel → resize (200–520px range)

### Check Panel Placement
1. Select panel in browser → ghost follows mouse on roof
2. Right-click ghost → rotate menu appears
3. Click to place → panel sits flush on roof
4. Right-click placed panel → rotate/move/delete menu
5. "Move" → XYZ gizmo appears, drag constrained to roof plane
6. Can only edit panels on current roof (cross-roof blocked)
7. ✓ to confirm, ✗ to cancel (reverts session panels)

### Check 3D Model
1. No black plate on roof (panel mesh removed from GLB)
2. Roof base parallel to ground, facing upward
3. Console: `[PanelPlacer] Cached roof meshes: N [0] roof_0 ...`

### Check Equipment Browser
1. Click card → item added to tree folder
2. Right-click item → "🗑 Delete" removes it
3. Search filters by brand, model, kW/kWh

### Check Ray Casting (Session 6)
1. Console: `[Shading] 12:00 → X/Y points shaded` (non-zero X)
2. `pickFromRay(ray, [osmTileset])` — 2nd param EXCLUDES

---

## 9. USER PREFERENCES (Remember)

1. **Roof faces UPWARD** (base parallel to ground)
2. **Scale factor 0.0712** for height display
3. **Split view:** Tree left, 3D center, Form right (400px), collapsible
4. **Tree panel:** Light grey theme, 14px fonts, resizable (200-520px)
5. **Root label:** "Project" → children: ROOF, INVERTER, BATTERY
6. **Roofs collapsed by default** with property values shown
7. **Right-click roof:** "⊞ Add Panel" / Right-click Panels: "✏️ Edit Roof"
8. **Panel browser:** Stays open (toggle selection), 3 GLB-matched panel types
9. **Ghost panel:** Right-click to rotate before placing
10. **Placed panel:** Right-click → context menu (rotate ±90°, move gizmo, delete)
11. **No panel editing outside sketch mode** (must be in add-panel or edit-roof)
12. **Cross-roof prevention:** Cannot edit panels on other roofs
13. **No Select Plane / Install Panel tab bar** — via tree context menu only
14. **Crosshair cursor** on map for drawing
15. **White buttons** for Search and Detect
16. **No black panel plate** on 3D model
17. **Draw only on 3D tiles** (not empty terrain)

---

## 10. NEXT STEPS (Suggested)

1. Build real panel/inverter/battery database (replace demo catalogs)
2. Auto-size inverter based on total panel capacity
3. Panel count + capacity display per roof (Watts, coverage %)
4. Snap-to-grid for panel placement
5. Save/load project state (boundaries + equipment + panels)
6. Validate ray casting results with real shaded buildings
7. Mobile responsive testing

---

## HOW TO USE THIS FILE

**At start of new session, say:**
> "Read PROJECT_STATE.md and summarize what we did last time"

**If something is broken, check:**
1. Tree panel: `project-tree.js` loaded before `main.js`, `ProjectTree.init()` called
2. Tree structure: `Project → ROOF (roof-group) → Roof_N (feature) → Panels / Properties`
3. Panel browser: right-click roof → "Add Panel" → 3 panel types
4. Equipment browser: right-click INVERTER/BATTERY → "Add" → demo catalogs
5. Panel placer: `window.ensurePanelPlacer()` lazy init, needs `window.splitViewerRef`
6. TransformControls: imported in app.html module, `window.TransformControls` set
7. Ghost rotation: `_ghostRotationDeg` resets on `_cancelGhost()`
8. GLB mesh discovery: `traverse()` + `roof_N` name sort (not direct children)
9. 3D model: `model.rotation.x = +Math.PI / 2` (no Y flip)
10. Ray casting: `pickFromRay(ray, [osmTileset])` — 2nd param EXCLUDES

**To continue work:**
> "Based on PROJECT_STATE.md, I want to [feature]. Current issue: [problem]"
