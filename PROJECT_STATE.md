# Solar ROI Calculator - Project State

> **Last Updated:** 2025-07-22 (Session 12)
> **Session Summary:** Fixed 13 bugs on calculate/analyze page — 3D viewer crash, dead solar viewer code paths, broken currency conversion, missing panel overlay, duplicate roof indices, inconsistent design tone. Audited all calculation models (sizing, irradiation, cashflow, ROI) for correctness.

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

## 2. CURRENT LAYOUT

### Session 12 Delta (Latest)
- **Calculate page:** Fixed 13 bugs — 3D viewer crash, dead code paths, broken currency conversion, missing panel overlay, duplicate roof indices, inconsistent CSS tone.
- **CurrencyUtil:** Added static FX rate conversion (USD/EUR/JPY/THB) so cost displays are correct.
- **Panel overlay:** `applyPanelOverlay(baseViewer)` now called after sizing — panels visible on 3D model.
- **Design tone:** Body background uses `var(--bg-surface)` to match grid pattern; duplicate inline CSS removed.

### Session 11 Delta
- **Top strip branding:** Gemini logo on left; Kosen + Cesium logos on right; title uses `SUNSCOPE`.
- **Command bar cleanup:** only EARTH keeps emoji icon; other tabs are text-only.
- **Left dock width:** default tree/dock width increased from `250px` to `425px` (1.7x); still resizable (200–520px).
- **Project detail tone:** right-side project detail panel removed earlier; forms remain in left dock with aligned visual tone and tighter spacing.
- **Inverter/Battery input mode:** changed from dropdown select to live search + add buttons + installed list (remove supported).
- **Top-right 3D overlay:** realtime price text now appears at top-right of 3D viewer, minimal display only:
  - `¥<panel_total> / $<object_total>`
  - no panel box, no title, no extra labels.
- **3D viewport grid:** added lightweight "infinite-like" CAD grid using recentered `THREE.GridHelper` layers (major+minor), tuned for low overhead.

### Initial Landing (After Login)
```
┌──────────────────────────────────────────────────────────────┐
│  🌍 EARTH │ ⊞ Add Panel │ 📋 Project Detail │ ⚡ Inverter  │
│  🔋 Battery │ 💾 Save Project                [COMMAND BAR]  │
├──────────────┬───────────────────────────────────────────────┤
│ Project      │                                               │
│──────────────│         (Empty 3D Viewer)                     │
│ (empty tree) │         "Open EARTH tab to start"             │
│              │                                               │
│              │         [XYZ Triad]                            │
│              │         (bottom-left)                          │
│              │                                               │
│              │                                               │
│──────────────│                                               │
│ [drag resize]│                                               │
└──────────────┴───────────────────────────────────────────────┘
  ↑ left dock     ↑ 3D viewer (flex: 1)
  (200-520px)
```

### Left Dock Modes (one active at a time)
```
Mode: tree           → Project tree (roof/panel nodes)
Mode: project_detail → Appliance, Bill, Tariff, Export, Project Name forms
Mode: inverter       → Search input + results list + installed list (add/remove)
Mode: battery        → Search input + results list + installed list (add/remove)
```

### After EARTH → Analyze
```
┌──────────────────────────────────────────────────────────────┐
│  [🌍 EARTH] (active) │ ⊞ Add Panel │ 📋 │ ⚡ │ 🔋 │ 💾    │
├──────────────┬───────────────────────────────────────────────┤
│ Project      │                                               │
│──────────────│   [3D ROOF MODEL]                             │
│ ▼ ROOF (4)   │   (base facing up)                           │
│  🔴 Roof_1   │                                              │
│   ▶ Panels   │   [XYZ Triad]          [↩][↪][✓][✗]         │
│   ▼ Props    │                         SKETCH BAR            │
│     Area 45m²│                                               │
│  🟢 Roof_2   │                                              │
│   ...        │                                               │
│──────────────│                                               │
│ [drag resize]│                                               │
└──────────────┴───────────────────────────────────────────────┘
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

### Equipment Catalogs — Now in Left Dock Tabs
```
Inverter tab → left dock shows: [Select dropdown ▾] [Add] + installed list
Battery tab  → left dock shows: [Select dropdown ▾] [Add] + installed list
Click "Add" → adds selected item to session data + updates list
Click "×" on list item → removes from session data + updates list
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

### A. Command Tab Bar & UI State Model (Session 10)
- **File:** `main.js` — `UIState` object (single source of truth)
- **State keys:**
  - `activeTopTab`: earth | add-panel | project-detail | inverter | battery | save | ''
  - `leftDockMode`: tree | project_detail | inverter | battery
  - `workspaceMode`: empty | earth_mode | model_ready | sketch_mode
  - `isSketchActive`: boolean
- **Tabs:** EARTH, Add Panel, Project Detail, Inverter, Battery, Save Project
- **Transition guards:** Sketch-active check before unsafe tab switches
- **Boot:** Opens split workspace immediately (not map)

### B. Project Tree — SolidWorks FeatureManager (Sessions 8-10)
- **File:** `static/js/app/project-tree.js` — IIFE module, `window.ProjectTree`
- **Theme:** Light grey (#d4d4d4/#e8e8e8), dark text, 14px fonts
- **Tree structure (Session 10 — roof/panel focused):**
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
  ```
- **Node types:** `root`, `roof-group`, `feature`, `panels`, `panel`, `folder`, `param`, `data`
- **Context menus per type:**
  - `roof-group` → Expand All / Collapse All
  - `feature` (roof) → ⊞ Add Panel
  - `panels` → ✏️ Edit Roof
  - `panel` → 🗑 Delete Panel
- **REMOVED in Session 10:** equipment-group, equipment-item node types; INVERTER/BATTERY tree groups; equipment browser; DEMO_INVERTERS/DEMO_BATTERIES arrays (in tree module)
- **Public API:** `init`, `render`, `updateRoofs`, `updatePanels`, `selectNode`, `showPanelBrowser`, `hidePanelBrowser`

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

### C. Equipment Catalogs — Left Dock (Sessions 9-10)
- **Inverters (10 demo):** SMA, Fronius, Enphase, Huawei, SolarEdge, GoodWe
  - Fields: brand, model, kW, phase, price, efficiency, type (String/Micro/Optimizer/Hybrid)
- **Batteries (10 demo):** Tesla, BYD, Enphase, LG Energy, Pylontech, SolarEdge, Huawei, Alpha ESS
  - Fields: brand, model, kWh, kW, price, cycles, chemistry (LFP/NMC), warranty
- **Session 10:** Moved from tree equipment browser to dedicated left dock tabs with select dropdown + add/remove list UI

### D. Split View & Left Dock (Session 10)
- **Left Dock:** Single panel, 4 content modes: tree, project_detail, inverter, battery
- **Center:** 3D viewer (flex: 1) with XYZ triad (bottom-left 80×80px)
- **Session 11 addition:** top-right realtime price text overlay (`¥ panels / $ objects`)
- **Session 11 addition:** lightweight infinite-like grid in 3D viewer
- **Right Panel:** REMOVED (content relocated to left dock)
- **Sketch bar:** Undo / Redo / ✓ Finish / ✗ Cancel (top-right of 3D viewer)
- **Command bar:** 36px height, dark (#1a2332) background, above split view

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

### Session 12 — Calculate Page Bug Fixes & Model Audit
- `calculate.html` — Fixed 13 bugs: viewer crash (const before declaration), getRoofDisplayIndex duplicate, added CurrencyUtil with FX rates, enabled applyPanelOverlay on base viewer, removed ~200 lines dead solarViewer code, fixed body background tone, removed duplicate CSS, added app.css link, removed dead tbodySolar ref. Audited backend sizing/irradiation models — all correct.

### Session 10 — Tab-Driven Workspace Transformation
- `app.html` — Added command bar (6 tabs), changed boot to split-view visible / map hidden, restructured left dock with 3 dock-content containers (project-detail, inverter, battery forms), hidden right panel, UIState sync in panelPlacer.onStateChange
- `main.js` — Added UIState model, setupCommandBar(), handleTabClick(), setActiveTab(), switchLeftDock(), enterEarthMode(), exitEarthMode(), showWorkspaceEmpty(), initSplitViewerEmpty(); modified boot to showWorkspaceEmpty(); modified showMapMode→enterEarthMode delegation; removed Edit Roof toolbar handler, right panel collapse handler, legacy save button handler
- `project-tree.js` — Removed DEMO_INVERTERS, DEMO_BATTERIES arrays; removed equipment-group/equipment-item from CONTEXT_MENUS; removed add-equipment/delete-equipment from handleContextAction; removed showEquipmentBrowser/hideEquipmentBrowser/renderEquipmentBrowser/addEquipmentItem/deleteEquipmentItem; removed equipment-group from badge check; cleaned public API exports
- `split-view.css` — Height calc 108→144px, command bar styles (.command-bar, .command-bar-tab, .save-tab), dock content styles (.dock-content, .dock-form-body)
- `wizard.css` — Height calc 108→144px for .map-mode

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
1. Root shows "Project" with ROOF group only
2. Roofs collapsed by default, properties show values (Area, Tilt, etc.)
3. Right-click roof → "⊞ Add Panel" → panel browser
4. Right-click Panels → "✏️ Edit Roof" → sketch mode
5. Drag bottom of tree panel → resize (200–520px range)

### Check Command Bar & Dock
1. EARTH → enters map mode, after analyze → returns to workspace with model
2. Add Panel → opens panel browser on selected roof
3. Project Detail → left dock shows appliance/bill/tariff/export forms
4. Inverter → left dock shows select dropdown + installed list
5. Battery → left dock shows select dropdown + installed list
6. Save Project → triggers save flow
7. Switching tabs clears previous dock mode cleanly

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

### Check Equipment (Left Dock)
1. Inverter tab → select from dropdown → click Add → appears in list
2. Battery tab → select from dropdown → click Add → appears in list
3. Click × on list item → removes from session data

### Check Ray Casting (Session 6)
1. Console: `[Shading] 12:00 → X/Y points shaded` (non-zero X)
2. `pickFromRay(ray, [osmTileset])` — 2nd param EXCLUDES

---

## 9. USER PREFERENCES (Remember)

1. **Roof faces UPWARD** (base parallel to ground)
2. **Scale factor 0.0712** for height display
3. **Split view:** Left dock + 3D center (no right panel)
4. **Left dock:** Resizable 200-520px, switches between tree/project_detail/inverter/battery
5. **Root label:** "Project" → children: ROOF only (inverter/battery in dock tabs)
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
4. Command bar: `setupCommandBar()` called in boot sequence, tabs use `data-tab` attributes
5. Left dock: `switchLeftDock(mode)` hides tree body + shows dock content via `.active` class
6. Panel placer: `window.ensurePanelPlacer()` lazy init, needs `window.splitViewerRef`
7. TransformControls: imported in app.html module, `window.TransformControls` set
8. Ghost rotation: `_ghostRotationDeg` resets on `_cancelGhost()`
9. GLB mesh discovery: `traverse()` + `roof_N` name sort (not direct children)
10. 3D model: `model.rotation.x = +Math.PI / 2` (no Y flip)
11. Ray casting: `pickFromRay(ray, [osmTileset])` — 2nd param EXCLUDES
12. UIState: `window.UIState` accessible for debugging state transitions

**To continue work:**
> "Based on PROJECT_STATE.md, I want to [feature]. Current issue: [problem]"
