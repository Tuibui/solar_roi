/**
 * Split-View Controller - Main UI Logic
 * Handles 3D model viewer + single-form layout, event binding, and data flow
 */

// ============ UI STATE MODEL (single source of truth) ============
const UIState = {
  activeTopTab: '',        // earth | add-panel | project-detail | inverter | battery | save | ''
  leftDockMode: 'tree',   // tree | project_detail | inverter | battery
  workspaceMode: 'empty', // empty | earth_mode | model_ready | sketch_mode
  isSketchActive: false
};

let cesiumMap = null;
let mapMode = null;
let splitView = null;
let splitViewer = null;  // Three.js viewer instance
let lastModelFile = 'roof_model.glb'; // updated after each analyze run
let scatterGeneration = 0; // incremented on each clearSplitScene to cancel stale scatter
const MODE_KEY = "solar_ui_mode";
window.UIState = UIState;
const DEMO_INVERTERS = [
  { brand: 'SMA', model: 'Sunny Boy 5.0', kw: 5.0, phase: 1, price: 1200 },
  { brand: 'SMA', model: 'Sunny Tripower 10', kw: 10.0, phase: 3, price: 2500 },
  { brand: 'Fronius', model: 'Primo 6.0', kw: 6.0, phase: 1, price: 1350 },
  { brand: 'Fronius', model: 'Symo 15.0', kw: 15.0, phase: 3, price: 3200 },
  { brand: 'Enphase', model: 'IQ8+', kw: 0.3, phase: 1, price: 180 },
  { brand: 'Huawei', model: 'SUN2000-8KTL', kw: 8.0, phase: 3, price: 1800 },
];
const DEMO_BATTERIES = [
  { brand: 'Tesla', model: 'Powerwall 2', kwh: 13.5, kw: 5.0, price: 8500 },
  { brand: 'Tesla', model: 'Powerwall 3', kwh: 13.5, kw: 11.5, price: 9200 },
  { brand: 'BYD', model: 'HVS 5.1', kwh: 5.1, kw: 5.1, price: 3400 },
  { brand: 'BYD', model: 'HVM 11.0', kwh: 11.04, kw: 5.1, price: 6500 },
  { brand: 'Enphase', model: 'IQ Battery 5P', kwh: 5.0, kw: 3.84, price: 5500 },
  { brand: 'LG Energy', model: 'RESU16H Prime', kwh: 16.0, kw: 7.0, price: 9800 },
];

function formatMoney(value) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  return Math.round(safe).toLocaleString();
}

function getObjectsPriceTotal() {
  const wiz = typeof wizard !== 'undefined' ? wizard : null;
  const step2 = wiz && wiz.sessionData ? wiz.sessionData.step2 : null;
  if (!step2) return 0;
  const inverters = Array.isArray(step2.q9_inverters) ? step2.q9_inverters : [];
  const batteries = Array.isArray(step2.q10_batteries) ? step2.q10_batteries : [];
  let total = 0;
  inverters.forEach((inv) => { total += Number(inv && inv.price) || 0; });
  batteries.forEach((bat) => { total += Number(bat && bat.price) || 0; });
  return total;
}

function getPanelsPriceTotal() {
  const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
  if (!pp || typeof pp.getPanelCostSummary !== 'function') return 0;
  const summary = pp.getPanelCostSummary(true);
  return Number(summary && summary.totalPrice) || 0;
}

function getSelectedCurrencySafe() {
  if (window.CurrencyUtil && typeof window.CurrencyUtil.getSelectedCurrency === 'function') {
    return window.CurrencyUtil.getSelectedCurrency();
  }
  return 'THB';
}

function convertAmount(amount, from, to) {
  if (window.CurrencyUtil && typeof window.CurrencyUtil.convert === 'function') {
    return window.CurrencyUtil.convert(amount, from, to);
  }
  return Number(amount) || 0;
}

function formatCurrencyAmount(amount, currency) {
  if (window.CurrencyUtil && typeof window.CurrencyUtil.format === 'function') {
    return window.CurrencyUtil.format(amount, currency);
  }
  const safe = Number(amount) || 0;
  return `${currency} ${safe.toLocaleString()}`;
}

function updateViewerLocationOverlay(locationOverride) {
  const box = document.getElementById('viewerLocOverlay');
  const titleEl = document.getElementById('viewerLocTitle');
  const coordEl = document.getElementById('viewerLocCoord');
  if (!box || !titleEl || !coordEl) return;

  const loc = locationOverride || (wizard && wizard.sessionData && wizard.sessionData.step1?.location) || {};
  const lat = Number(loc.lat);
  const lon = Number(loc.lon);
  const address = (loc.address || '').trim();

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    box.classList.add('hidden');
    return;
  }

  titleEl.textContent = address || 'Roof Location';
  coordEl.textContent = `Lat ${lat.toFixed(5)} · Lon ${lon.toFixed(5)}`;
  box.classList.remove('hidden');
}
window.updateViewerLocationOverlay = updateViewerLocationOverlay;

function refreshLivePrice() {
  const totalEl = document.getElementById('livePriceTotal');
  if (!totalEl) return;

  const currency = getSelectedCurrencySafe();
  const panelsTotal = convertAmount(getPanelsPriceTotal(), 'JPY', currency);
  const objectsTotal = convertAmount(getObjectsPriceTotal(), 'USD', currency);
  totalEl.textContent = formatCurrencyAmount(panelsTotal + objectsTotal, currency);
}
window.refreshLivePrice = refreshLivePrice;

function refreshCurrencyDisplays() {
  refreshLivePrice();
  const inverterSearch = document.getElementById('splitInverterSearch');
  if (inverterSearch) renderInverterSearchResults(inverterSearch.value);
  const batterySearch = document.getElementById('splitBatterySearch');
  if (batterySearch) renderBatterySearchResults(batterySearch.value);
  renderInverterList();
  renderBatteryList();
  if (window.ProjectTree && typeof window.ProjectTree.refreshPanelBrowser === 'function') {
    window.ProjectTree.refreshPanelBrowser();
  }
}

// ============ INITIALIZATION ============
window.addEventListener("DOMContentLoaded", async () => {
  // Initialize wizard (data manager)
  wizard = initWizard();

  // Initialize map
  await initMap();
  setupEventHandlers();
  setupShortcuts();

  // Setup handlers
  setupWizardToolbar();
  setupSplitViewHandlers();
  setupProjectTree();
  setupCommandBar();

  mapMode = document.getElementById('mapMode');
  splitView = document.getElementById('splitView');

  // Initialize roof count from boundaries
  updateRoofCount();

  // Boot into workspace (not map)
  showWorkspaceEmpty();
  updateViewerLocationOverlay();
  refreshCurrencyDisplays();

  // Open Project modal — close button + backdrop click
  const opmOverlay = document.getElementById('openProjectOverlay');
  const opmClose   = document.getElementById('openProjectClose');
  if (opmClose)   opmClose.addEventListener('click',  () => opmOverlay?.classList.add('hidden'));
  if (opmOverlay) opmOverlay.addEventListener('click', e => {
    if (e.target === opmOverlay) opmOverlay.classList.add('hidden');
  });
});

// ============ WIZARD TOOLBAR SETUP ============
function setupWizardToolbar() {
  const btnDraw = document.getElementById('btnDrawRoof');
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  const btnAnalyze = document.getElementById('btnAnalyze');
  const btnReset = document.getElementById('btnReset');

  if (btnDraw) btnDraw.addEventListener('click', () => toggleDrawMode());
  if (btnUndo) btnUndo.addEventListener('click', () => undoDrawPoint());
  if (btnRedo) btnRedo.addEventListener('click', () => redoDrawPoint());
  if (btnAnalyze) btnAnalyze.addEventListener('click', () => onAnalyzeRoof());
  if (btnReset) btnReset.addEventListener('click', () => onResetRoof());
}

// ============ COMMAND BAR SETUP ============
function setupCommandBar() {
  document.querySelectorAll('#commandBar .command-bar-tab').forEach(btn => {
    btn.addEventListener('click', () => handleTabClick(btn.dataset.tab));
  });
}

function handleTabClick(tab) {
  // Guard: prevent unsafe tab switches during sketch/panel placement
  if (UIState.isSketchActive && tab !== 'add-panel') {
    const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
    if (pp && pp.state === window.PlacerState?.SKETCH) {
      if (!confirm('Panel placement is active. Cancel and switch tabs?')) return;
      pp.onFinish = null;
      pp.onCancel = null;
      pp.cancelSketch();
      UIState.isSketchActive = false;
    }
  }

  switch (tab) {
    case 'earth':
      enterEarthMode();
      break;
    case 'add-panel':
      if (UIState.workspaceMode === 'empty') {
        alert('Please analyze a roof first using the EARTH tab.');
        return;
      }
      exitEarthMode();
      switchLeftDock('tree');
      setActiveTab('add-panel');
      break;
    case 'project-detail':
      exitEarthMode();
      switchLeftDock('project_detail');
      setActiveTab('project-detail');
      break;
    case 'inverter':
      exitEarthMode();
      switchLeftDock('inverter');
      setActiveTab('inverter');
      break;
    case 'battery':
      exitEarthMode();
      switchLeftDock('battery');
      setActiveTab('battery');
      break;
    case 'open':
      openSavedProject();
      setActiveTab('open');
      break;
    case 'save':
      saveFromSplitView();
      setActiveTab('save');
      setTimeout(() => setActiveTab(UIState.activeTopTab === 'save' ? '' : UIState.activeTopTab), 2000);
      break;
  }
}

function setActiveTab(tab) {
  UIState.activeTopTab = tab;
  document.querySelectorAll('#commandBar .command-bar-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

// ============ LEFT DOCK SWITCHING ============
function switchLeftDock(mode) {
  const modes = ['tree', 'project_detail', 'inverter', 'battery'];
  if (!modes.includes(mode)) return;
  UIState.leftDockMode = mode;

  // Clean up any open panel/equipment browsers
  if (window.ProjectTree) {
    ProjectTree.hidePanelBrowser();
  }
  // Hide dynamically created browsers
  document.querySelectorAll('.project-tree-panel > .panel-browser').forEach(el => {
    el.style.display = 'none';
  });

  const treeBody = document.getElementById('projectTreeBody');
  const dockPD = document.getElementById('dockProjectDetail');
  const dockInv = document.getElementById('dockInverter');
  const dockBat = document.getElementById('dockBattery');

  // Hide everything
  if (treeBody) treeBody.style.display = 'none';
  [dockPD, dockInv, dockBat].forEach(el => { if (el) el.classList.remove('active'); });

  // Show target
  if (mode === 'tree') {
    if (treeBody) treeBody.style.display = '';
  } else {
    const target = { project_detail: dockPD, inverter: dockInv, battery: dockBat }[mode];
    if (target) target.classList.add('active');
  }

  // Update dock header
  const titles = { tree: 'Project', project_detail: 'User Information', inverter: 'Inverter', battery: 'Battery' };
  const header = document.getElementById('dockHeaderTitle');
  if (header) header.textContent = titles[mode] || 'Project';

  // Refresh lists when switching to dock modes
  if (mode === 'inverter') { renderInverterSearchResults(); renderInverterList(); }
  if (mode === 'battery') { renderBatterySearchResults(); renderBatteryList(); }
  if (mode === 'project_detail') { populateSplitForm(); }

  // Resize 3D viewer after layout change
  setTimeout(() => { if (splitViewer) splitViewer.resize(); }, 100);
}

// ============ EARTH MODE ============
function enterEarthMode() {
  UIState.workspaceMode = 'earth_mode';
  setActiveTab('earth');
  if (splitView) splitView.classList.add('hidden');
  if (mapMode) mapMode.classList.add('active');
  renderMapMode();
}

function exitEarthMode() {
  if (UIState.workspaceMode === 'earth_mode' || (mapMode && mapMode.classList.contains('active'))) {
    if (mapMode) mapMode.classList.remove('active');
    if (splitView) splitView.classList.remove('hidden');
    setTimeout(() => { if (splitViewer) splitViewer.resize(); }, 100);
  }
}

// ============ WORKSPACE BOOT (empty initial state) ============
function showWorkspaceEmpty() {
  UIState.workspaceMode = 'empty';
  sessionStorage.setItem(MODE_KEY, 'split');

  if (mapMode) mapMode.classList.remove('active');
  if (splitView) splitView.classList.remove('hidden');

  switchLeftDock('tree');
  setActiveTab('');

  // Create Three.js viewer (empty scene, no model)
  initSplitViewerEmpty();
}

function initSplitViewerEmpty() {
  const host = document.getElementById('splitModelHost');
  if (!host) return;

  if (!splitViewer && window.threeViewer) {
    splitViewer = window.threeViewer.createViewer(host, {
      bgColor: 0xffffff,
      gridColor: 0xcccccc
    });
    window.splitViewerRef = splitViewer;

    if (window.threeViewer.setupTriad) {
      const triad = window.threeViewer.setupTriad(splitViewer);
      if (triad && splitViewer.addAnimHook) {
        splitViewer.addAnimHook(triad.update);
      }
    }
  }

  setTimeout(() => { if (splitViewer) splitViewer.resize(); }, 100);
}

// ============ PROJECT TREE SETUP ============
function setupProjectTree() {
  const treeBody = document.getElementById('projectTreeBody');
  if (!treeBody || !window.ProjectTree) return;

  ProjectTree.init(treeBody);

  // Selection callback — highlight roof in 3D viewer
  ProjectTree.onSelect = (id, node) => {
    if (node && node.type === 'feature' && id.startsWith('roof-') && splitViewer) {
      const roofIndex = parseInt(id.replace('roof-', ''), 10);
      if (!isNaN(roofIndex)) {
        console.log('[ProjectTree] Selected roof', roofIndex);
      }
    }
  };

  // Context action callback
  ProjectTree.onContextAction = (action, data) => {
    if (action === 'edit-roof') {
      // Snap camera + enter sketch directly (no panel browser) for editing existing panels
      const roofIndex = parseInt((data.id || '').replace('panels-', ''), 10);
      if (!isNaN(roofIndex)) enterEditRoof(roofIndex);
    }
    if (action === 'clear-roof-panels') {
      const roofIndex = parseInt((data.id || '').replace('panels-', ''), 10);
      if (!isNaN(roofIndex)) clearPanelsForRoof(roofIndex);
    }
    if (action === 'add-panel') {
      const roofIndex = parseInt((data.id || '').replace('roof-', ''), 10);
      if (!isNaN(roofIndex)) snapCameraToRoof(roofIndex);
    }
    if (action === 'auto-panel') {
      const roofIndex = parseInt((data.id || '').replace('roof-', ''), 10);
      if (!isNaN(roofIndex)) snapCameraToRoof(roofIndex);
    }
    if (action === 'panel-selected') {
      if (data && data.auto) {
        handleAutoPanelSelection(data);
      } else {
        startPanelPlacement(data);
      }
    }
    if (action === 'browser-closed') {
      const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
      if (pp && pp.state === window.PlacerState?.SKETCH) pp.cancelSketch();
    }
    if (action === 'delete-panel') {
      handleDeletePanel(data);
    }
  };

  // Collapse/expand toggle
  const btnToggle = document.getElementById('btnTreeToggle');
  const panel = document.getElementById('projectTreePanel');
  const resizeHandle = document.getElementById('projectTreeResizeHandle');
  if (btnToggle && panel) {
    let lastExpandedWidth = Math.max(200, Math.round(panel.getBoundingClientRect().width) || 425);

    const syncToggleTitle = () => {
      btnToggle.title = panel.classList.contains('collapsed') ? 'Expand tree' : 'Collapse tree';
    };
    syncToggleTitle();

    btnToggle.addEventListener('click', () => {
      const willCollapse = !panel.classList.contains('collapsed');
      if (willCollapse) {
        lastExpandedWidth = Math.max(200, Math.round(panel.getBoundingClientRect().width));
        panel.classList.add('collapsed');
      } else {
        panel.classList.remove('collapsed');
        panel.style.width = `${lastExpandedWidth}px`;
      }
      syncToggleTitle();
      setTimeout(() => { if (splitViewer) splitViewer.resize(); }, 250);
    });

    if (resizeHandle) {
      let startX = 0;
      let startWidth = 0;

      const onPointerMove = (e) => {
        const delta = e.clientX - startX;
        const nextWidth = Math.max(200, Math.min(520, Math.round(startWidth + delta)));
        panel.style.width = `${nextWidth}px`;
      };

      const onPointerUp = () => {
        document.removeEventListener('pointermove', onPointerMove);
        resizeHandle.classList.remove('dragging');
        lastExpandedWidth = Math.max(200, Math.round(panel.getBoundingClientRect().width));
        if (splitViewer) splitViewer.resize();
      };

      resizeHandle.addEventListener('pointerdown', (e) => {
        if (panel.classList.contains('collapsed')) return;
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.getBoundingClientRect().width;
        resizeHandle.classList.add('dragging');
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp, { once: true });
      });
    }
  }
}

// ============ PANEL PLACEMENT FLOW ============
async function snapCameraToRoof(roofIndex) {
  if (!window.ensurePanelPlacer) return;
  const pp = await window.ensurePanelPlacer();
  if (pp) pp.snapToRoof(roofIndex);
}

function handleAutoPanelSelection(data) {
  const roofId = data?.roofId || '';
  const roofIndex = parseInt(String(roofId).replace('roof-', ''), 10);
  if (isNaN(roofIndex)) {
    alert('Please select a roof first.');
    return;
  }

  const usableArea = getRoofUsableAreaM2(roofIndex);
  if (!Number.isFinite(usableArea) || usableArea <= 0) {
    alert('Usable area for this roof is unknown. Analyze the roof first.');
    return;
  }

  const lengthM = Number(data?.panelSpec?.lengthM);
  const widthM = Number(data?.panelSpec?.widthM);
  const panelArea = (Number.isFinite(lengthM) && Number.isFinite(widthM) && lengthM > 0 && widthM > 0)
    ? lengthM * widthM
    : null;

  if (!panelArea) {
    alert('Panel dimensions are missing for this model.');
    return;
  }

  const maxPanels = Math.floor(usableArea / panelArea);
  if (!Number.isFinite(maxPanels) || maxPanels < 1) {
    alert('Roof area is too small for this panel.');
    return;
  }

  const promptMsg = [
    'Auto Panel',
    `Roof usable area: ${usableArea.toFixed(1)} m²`,
    `Panel area: ${panelArea.toFixed(2)} m²`,
    `Max panels (area basis): ${maxPanels}`,
    `Enter desired panel count (1-${maxPanels}):`
  ].join('\n');

  const defaultCount = Math.min(maxPanels, 10);
  const input = window.prompt(promptMsg, String(defaultCount));
  if (input === null) return; // user cancelled
  const count = parseInt(input, 10);
  if (!Number.isInteger(count) || count < 1 || count > maxPanels) {
    alert(`Out of range. Please enter between 1 and ${maxPanels}.`);
    return;
  }

  data.autoPanelCount = count;
  data.autoPanelMax = maxPanels;
  startPanelPlacement(data);
}

function getRoofAreaM2(roofIndex) {
  const roof = (wizard && typeof wizard.getRoof === 'function')
    ? wizard.getRoof(roofIndex)
    : (wizard && typeof wizard.getRoofByIndex === 'function')
      ? wizard.getRoofByIndex(roofIndex)
      : null;
  if (!roof) return null;
  const area = roof.area_m2 ?? roof.area;
  const n = Number(area);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getRoofUsableAreaM2(roofIndex) {
  const roof = (wizard && typeof wizard.getRoof === 'function')
    ? wizard.getRoof(roofIndex)
    : (wizard && typeof wizard.getRoofByIndex === 'function')
      ? wizard.getRoofByIndex(roofIndex)
      : null;
  if (!roof) return null;
  const usable = roof.usable_area_m2 ?? roof.usable_area ?? roof.area_m2 ?? roof.area;
  const n = Number(usable);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function enterEditRoof(roofIndex) {
  if (!window.ensurePanelPlacer) return;
  const pp = await window.ensurePanelPlacer();
  if (!pp) return;

  // Keep live price in sync as panels are placed/removed (Bug 2)
  pp.onPanelsChanged = () => refreshLivePrice();

  const areaM2 = getRoofAreaM2(roofIndex);
  if (areaM2) pp.setRoofArea(roofIndex, areaM2);

  // Already in sketch for this roof — nothing to do
  if (pp.state === PlacerState.SKETCH && pp.sketchRoofIndex === roofIndex) return;
  // In sketch for different roof — clear callbacks + cancel first
  if (pp.state === PlacerState.SKETCH) {
    const prevRoof = pp.sketchRoofIndex;
    pp.onFinish = null;
    pp.onCancel = null;
    pp.cancelSketch();
    if (prevRoof != null) updateTreePanelsForRoof(prevRoof);
  }

  pp.onFinish = (placed, ri) => updateTreePanelsForRoof(ri);
  pp.onCancel = (ri) => updateTreePanelsForRoof(ri);

  // Enter sketch (snaps camera) — no ghost, user clicks existing panels to edit
  pp.enterSketchForRoof(roofIndex);
}

async function startPanelPlacement(data) {
  if (!window.ensurePanelPlacer) {
    console.warn('[PanelPlacement] ensurePanelPlacer not ready');
    return;
  }
  const pp = await window.ensurePanelPlacer();
  if (!pp) { console.warn('[PanelPlacement] PanelPlacer not available'); return; }

  // Keep live price in sync as panels are placed/removed (Bug 2)
  pp.onPanelsChanged = () => refreshLivePrice();

  const roofId = data.roofId;
  if (!roofId) { console.warn('[PanelPlacement] No roofId in data'); return; }
  const roofIndex = parseInt(roofId.replace('roof-', ''), 10);
  if (isNaN(roofIndex)) { console.warn('[PanelPlacement] Invalid roofId:', roofId); return; }

  const panelId = data.panelId;
  const panelSpec = data.panelSpec || null;
  const modelLabel = `${data.brand} ${data.model}`.trim();
  const areaM2 = getRoofAreaM2(roofIndex);
  if (areaM2) pp.setRoofArea(roofIndex, areaM2);

  // Register (or update) procedural panel type from CSV metadata
  if (panelId && panelSpec) {
    pp.registerPanelType(panelId, panelSpec);
    pp.setActiveModel(panelId);
    pp.activeModelLabel = modelLabel;
  } else {
    console.warn('[PanelPlacement] Missing panelId or panelSpec');
    return;
  }

  // ── AUTO PANEL PATH ──────────────────────────────────────────────────────
  if (data.autoPanelCount) {
    // If sketching a different roof, cancel it first
    if (pp.state === PlacerState.SKETCH && pp.sketchRoofIndex !== roofIndex) {
      const prevRoof = pp.sketchRoofIndex;
      pp.onFinish = null;
      pp.onCancel = null;
      pp.cancelSketch();
      if (prevRoof != null) updateTreePanelsForRoof(prevRoof);
    }

    // Clear existing confirmed panels on this roof before auto place
    if (typeof clearPanelsForRoof === 'function') {
      clearPanelsForRoof(roofIndex);
    }

    // Enter sketch mode BEFORE autoPlacePanels (it requires state === SKETCH)
    if (pp.state !== PlacerState.SKETCH) {
      const ok = pp.enterSketchForRoof(roofIndex);
      if (!ok) {
        showToast('Could not enter sketch mode for this roof.', 'error');
        return;
      }
    }

    // Wire callbacks so tree + browser update correctly after finishSketch
    pp.autoPanelTarget = { roofIndex, count: data.autoPanelCount };
    pp.onFinish = (placed, ri) => {
      pp.autoPanelTarget = null;
      updateTreePanelsForRoof(ri);
      if (window.ProjectTree) window.ProjectTree.hidePanelBrowser();
    };
    pp.onCancel = (ri) => {
      pp.autoPanelTarget = null;
      updateTreePanelsForRoof(ri);
      if (window.ProjectTree) window.ProjectTree.hidePanelBrowser();
    };

    const placedCount = pp.autoPlacePanels(data.autoPanelCount);
    if (!placedCount) {
      showToast('Unable to auto-place panels. Try a smaller count or different panel size.', 'error');
      pp.cancelSketch();
      pp.autoPanelTarget = null;
      return;
    }

    showToast(`Auto-placed ${placedCount} panel${placedCount !== 1 ? 's' : ''} of ${modelLabel}`);
    pp.finishSketch();
    return;
  }

  // ── MANUAL PANEL PATH ────────────────────────────────────────────────────
  pp.autoPanelTarget = null;

  // Already in sketch for this roof? Just switch model, restart ghost.
  if (pp.state === PlacerState.SKETCH && pp.sketchRoofIndex === roofIndex) {
    pp.startInstall();
    return;
  }

  // In sketch for different roof — clear callbacks + cancel first
  if (pp.state === PlacerState.SKETCH) {
    const prevRoof = pp.sketchRoofIndex;
    pp.onFinish = null;
    pp.onCancel = null;
    pp.cancelSketch();
    if (prevRoof != null) updateTreePanelsForRoof(prevRoof);
  }

  // Wire finish/cancel callbacks — close browser + update tree
  pp.onFinish = (placed, sketchRoofIndex) => {
    pp.autoPanelTarget = null;
    updateTreePanelsForRoof(sketchRoofIndex);
    if (window.ProjectTree) window.ProjectTree.hidePanelBrowser();
  };
  pp.onCancel = (sketchRoofIndex) => {
    pp.autoPanelTarget = null;
    updateTreePanelsForRoof(sketchRoofIndex);
    if (window.ProjectTree) window.ProjectTree.hidePanelBrowser();
  };

  // Enter sketch mode for this roof (auto-face)
  const ok = pp.enterSketchForRoof(roofIndex);
  if (!ok) {
    console.warn('[PanelPlacement] enterSketchForRoof failed for roof', roofIndex);
    return;
  }

  // Delay ghost start so camera animation starts first
  setTimeout(() => {
    if (pp.state === PlacerState.SKETCH) {
      pp.startInstall();
    }
  }, 100);
}

function updateTreePanelsForRoof(roofIndex) {
  const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
  if (!pp || !window.ProjectTree) return;

  const metas = pp.getPanelsForRoof(roofIndex);
  // Number panels per model type
  const counts = {};
  const panelEntries = metas.map(m => {
    const key = m.modelKey || 'panel';
    counts[key] = (counts[key] || 0) + 1;
    return { label: `${m.modelLabel}_${counts[key]}`, type: key, panelName: m.panelName };
  });

  ProjectTree.updatePanels(roofIndex, panelEntries);
  refreshLivePrice();
}
window.updateTreePanelsForRoof = updateTreePanelsForRoof;

async function clearPanelsForRoof(roofIndex) {
  const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
  if (!pp) return;
  const metas = pp.getPanelsForRoof(roofIndex);
  if (!metas.length) return;
  // Remove each confirmed panel on this roof
  metas.forEach(m => {
    pp.deleteConfirmedPanel(m.panelName);
  });
  updateTreePanelsForRoof(roofIndex);
}

function handleDeletePanel(node) {
  const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
  if (!pp || !node.panelName) return;
  const roofIndex = pp.deleteConfirmedPanel(node.panelName);
  if (roofIndex != null) updateTreePanelsForRoof(roofIndex);
}

function handleRotatePanel(node, angleDeg) {
  const pp = window.getPanelPlacer ? window.getPanelPlacer() : null;
  if (!pp || !node.panelName) return;
  pp.rotateConfirmedPanel(node.panelName, angleDeg);
}

// ============ SPLIT-VIEW HANDLERS ============
function setupSplitViewHandlers() {
  // Map mode: Search handlers
  const addressInput = document.getElementById('addressInput');
  const searchBtn = document.getElementById('searchBtn');
  if (addressInput) {
    addressInput.addEventListener('input', handleAddressInput);
    addressInput.addEventListener('keydown', handleAddressInput);
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', searchAddress);
  }

  // Map mode: Location mode tabs
  setupLocationModeTabs();

  // Map mode: Manual lat/lon go button
  const btnGoToLatLon = document.getElementById('btnGoToLatLon');
  if (btnGoToLatLon) {
    btnGoToLatLon.addEventListener('click', goToManualLatLon);
  }

  // Map mode: Detect location button
  const btnDetectLocation = document.getElementById('btnDetectLocation');
  if (btnDetectLocation) {
    btnDetectLocation.addEventListener('click', detectUserLocation);
  }

  // Appliance handlers
  const btnAddAppliance = document.getElementById('btnAddAppliance');
  if (btnAddAppliance) {
    btnAddAppliance.addEventListener('click', addApplianceFromWizard);
  }
  const inverterSearch = document.getElementById('splitInverterSearch');
  if (inverterSearch) {
    inverterSearch.addEventListener('input', () => renderInverterSearchResults(inverterSearch.value));
  }
  const batterySearch = document.getElementById('splitBatterySearch');
  if (batterySearch) {
    batterySearch.addEventListener('input', () => renderBatterySearchResults(batterySearch.value));
  }



  // Tariff
  const tariffInput = document.getElementById('wizardTariff');
  const currencySelect = document.getElementById('wizardCurrency');
  if (tariffInput) {
    tariffInput.addEventListener('change', (e) => {
      const currency = currencySelect ? currencySelect.value : 'THB';
      wizard.setTariff(e.target.value, currency);
    });
  }
  if (currencySelect) {
    currencySelect.addEventListener('change', (e) => {
      const price = tariffInput ? tariffInput.value : wizard.sessionData.step2.q6_tariff.price;
      wizard.setTariff(price, e.target.value);
      // Sync export currency label
      const exportLabel = document.getElementById('exportCurrencyLabel');
      if (exportLabel) {
        exportLabel.textContent = e.target.value + '/kWh';
      }
      refreshCurrencyDisplays();
    });
  }

  // Grid export price
  const exportPriceInput = document.getElementById('splitExportPrice');
  if (exportPriceInput) {
    exportPriceInput.addEventListener('change', (e) => {
      wizard.setGridExportPrice(e.target.value);
    });
  }
}

// ============ MODE SWITCHING ============
function showMapMode() {
  enterEarthMode();
}

function showSplitView() {
  sessionStorage.setItem(MODE_KEY, "split");
  if (mapMode) {
    mapMode.classList.remove('active');
  }
  if (splitView) {
    splitView.classList.remove('hidden');
  }

  UIState.workspaceMode = 'model_ready';
  switchLeftDock('tree');
  setActiveTab('');

  // Populate form from wizard session data
  populateSplitForm();

  // Init Three.js viewer
  initSplitViewer();
}

// ============ LOAD SAVED PROJECT ============
function openSavedProject() {
  if (!wizard || typeof wizard.loadDatasets !== 'function') {
    showToast('Loader unavailable.', 'error');
    return;
  }
  showOpenProjectModal();
}

// ---- Open Project Modal ----
async function showOpenProjectModal() {
  const overlay = document.getElementById('openProjectOverlay');
  const body    = document.getElementById('openProjectBody');
  if (!overlay || !body) return;

  body.innerHTML = '<div class="opm-loading">Loading projects…</div>';
  overlay.classList.remove('hidden');

  try {
    const res = await wizard.loadDatasets();
    const datasets = (res && res.datasets) || [];

    if (!datasets.length) {
      body.innerHTML = '<div class="opm-empty">No saved projects found.</div>';
      return;
    }

    body.innerHTML = '';
    datasets.forEach(ds => {
      const ts = ds.timestamp ? new Date(ds.timestamp).toLocaleString() : '—';
      const roofCount = ds.roofData?.roofs?.length ?? '?';

      const card = document.createElement('div');
      card.className = 'opm-card';
      card.innerHTML = `
        <div class="opm-card-info">
          <div class="opm-card-name">${_escHtml(ds.name || 'Untitled Project')}</div>
          <div class="opm-card-meta">${roofCount} roof${roofCount !== 1 ? 's' : ''} · ${ts}</div>
        </div>
        <div class="opm-card-actions">
          <button class="opm-btn-open"  data-id="${ds.id}">Open</button>
          <button class="opm-btn-delete" data-id="${ds.id}">Delete</button>
        </div>`;

      card.querySelector('.opm-btn-open').addEventListener('click', async () => {
        overlay.classList.add('hidden');
        await applyDatasetToWorkspace(ds);
        showToast(`Project "${ds.name || 'Untitled'}" loaded.`, 'success');
      });

      card.querySelector('.opm-btn-delete').addEventListener('click', async () => {
        if (!confirm(`Delete "${ds.name || 'Untitled'}"?`)) return;
        try {
          await wizard.deleteDataset(ds.id);
          card.remove();
          if (!body.querySelector('.opm-card')) {
            body.innerHTML = '<div class="opm-empty">No saved projects found.</div>';
          }
        } catch (err) {
          showToast('Failed to delete project.', 'error');
        }
      });

      body.appendChild(card);
    });
  } catch (e) {
    console.error('Failed to load projects', e);
    body.innerHTML = `<div class="opm-empty opm-error">Failed to load projects: ${_escHtml(e?.message || String(e))}</div>`;
  }
}

function _escHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---- Toast notification ----
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.getElementById('appToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'appToast';
  toast.className = `app-toast app-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('app-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('app-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, duration);
}

async function applyDatasetToWorkspace(ds) {
  if (!ds || !wizard) return;
  const defaults = wizard.getDefaultSessionData();

  // Reset session, preserve loaded project id
  wizard.clearSessionData();
  wizard.sessionData = wizard.normalizeSessionData({
    ...defaults,
    projectId: ds.id ?? null
  });

  // Location
  const loc = ds.roofData?.location || ds.inputs?.q1_location || { lat: null, lon: null, address: '' };
  wizard.setLocationData(loc.lat, loc.lon, loc.address);

  // Fly camera to project location (Fix #4)
  if (loc.lat && loc.lon && typeof flyToLocation === 'function') {
    flyToLocation({ lat: loc.lat, lon: loc.lon, height: 500 }, loc.address || '');
  }

  // Roofs
  const roofs = ds.roofData?.roofs || [];
  wizard.setRoofs(roofs);

  // Restore boundaries so scatter/shading analysis has polygon data (Bug 1)
  if (typeof restoreBoundaries === 'function') {
    restoreBoundaries(roofs.map(r => r.polygon || []));
  }

  // Inputs
  const inputs = ds.inputs || {};
  wizard.sessionData.step2.q3_shading    = { ...defaults.step2.q3_shading,   ...(inputs.q3_shading   || {}) };
  wizard.sessionData.step2.q4_appliances = inputs.q4_appliances || [];
  wizard.sessionData.step2.q5_bill       = { ...defaults.step2.q5_bill,      ...(inputs.q5_bill      || {}) };
  wizard.sessionData.step2.q6_tariff     = { ...defaults.step2.q6_tariff,    ...(inputs.q6_tariff    || {}) };
  wizard.sessionData.step2.q7_export     = { ...defaults.step2.q7_export,    ...(inputs.q7_export    || {}) };
  wizard.sessionData.step2.q8_system     = { ...defaults.step2.q8_system,    ...(inputs.q8_system    || {}) };
  wizard.sessionData.step2.q9_inverters  = inputs.q9_inverters  || [];
  wizard.sessionData.step2.q10_batteries = inputs.q10_batteries || [];

  wizard.saveSessionData();

  // Refresh UI/3D
  updateRoofCount();
  populateSplitForm();

  // Schedule scatter for all roofs once the model finishes loading
  window.pendingScatter = {
    mode: 'all',
    waitForShading: true,
    finishOverlay: false,
    finalOnly: true
  };

  showSplitView();
  if (window.ProjectTree) ProjectTree.updateRoofs(roofs);
}

function resizeCesium() {
  if (typeof getViewer !== 'function') return;
  const viewer = getViewer();
  if (!viewer) return;
  if (typeof viewer.resize === 'function') {
    viewer.resize();
  }
  if (viewer.scene && typeof viewer.scene.requestRender === 'function') {
    viewer.scene.requestRender();
  }
}

// ============ THREE.JS VIEWER FOR SPLIT VIEW ============
function clearSplitScene() {
  if (!splitViewer) return;
  scatterGeneration++;  // invalidate any in-flight scatter from prior analyze
  const scene = splitViewer.scene;
  const toRemove = [];
  scene.traverse((obj) => {
    if (obj === scene) return;
    // Keep lights and camera
    if (obj.isLight || obj.isCamera) return;
    if (obj.userData && obj.userData.keepInScene) return;
    if (obj.name && obj.name === 'cad-grid') return;
    toRemove.push(obj);
  });
  // Remove only top-level children (traverse covers nested)
  toRemove.forEach((obj) => {
    if (obj.parent === scene) {
      scene.remove(obj);
      obj.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else if (c.material.dispose) c.material.dispose();
        }
      });
    }
  });
  splitViewer.modelRoot = null;
  boundaryScatterBusy = false;
  // Reset panel placer so it re-initializes with new model
  if (typeof window.resetPanelPlacer === 'function') {
    window.resetPanelPlacer();
  }
}

function initSplitViewer() {
  const host = document.getElementById('splitModelHost');
  if (!host) return;

  // Only create once
  if (!splitViewer && window.threeViewer) {
    splitViewer = window.threeViewer.createViewer(host, {
      bgColor: 0xffffff,
      gridColor: 0xcccccc
    });
    window.splitViewerRef = splitViewer;

    // Setup XYZ triad (bottom-left orientation indicator)
    if (window.threeViewer.setupTriad) {
      const triad = window.threeViewer.setupTriad(splitViewer);
      if (triad && splitViewer.addAnimHook) {
        splitViewer.addAnimHook(triad.update);
      }
    }
  }

  // Clean old scene objects before loading new model
  clearSplitScene();

  // Resize after layout settles
  setTimeout(() => {
    if (splitViewer) splitViewer.resize();
  }, 100);

  // Load model
  if (splitViewer && window.threeViewer) {
    const pid = wizard?.sessionData?.projectId;
    const ts = Date.now();
    // Use the API route for saved projects — it generates the GLB on demand if missing.
    // Fall back to the latest analyze-generated GLB for fresh (unsaved) analyses.
    const modelFile = lastModelFile || 'roof_model.glb';
    const primaryUrl = (pid && !isNaN(pid))
      ? `/api/projects/${pid}/model?lite=1&t=${ts}`
      : `/backend/static/${modelFile}?t=${ts}`;
    const fallbackUrl = `/backend/static/${modelFile}?t=${ts}`;
    const roofIndex = wizard && wizard.selectedGeometryRoofIndex != null ? wizard.selectedGeometryRoofIndex : 0;

    const loadWithFallback = (url, triedFallback = false) => {
      window.threeViewer.loadModelToViewer(splitViewer, url, roofIndex,
        async () => {
          // Model loaded
          if (window.pendingScatter) {
            const { mode, roofIndex: pendingRoofIndex, waitForShading, finishOverlay, finalOnly } = window.pendingScatter;
            window.pendingScatter = null;
            if (mode === 'all') {
              await runAllBoundaryScatter({ waitForShading, finishOverlay, finalOnly });
            } else {
              await runBoundaryScatter(pendingRoofIndex, { waitForShading, finishOverlay, finalOnly });
            }
            return;
          }
          runBoundaryScatter(roofIndex);
        },
        () => {
          if (!triedFallback && url !== fallbackUrl) {
            loadWithFallback(fallbackUrl, true);
          }
        }
      );
    };

    loadWithFallback(primaryUrl, false);
  }
}

// ============ POPULATE SPLIT FORM ============
function populateSplitForm() {
  const data = wizard.sessionData.step2;

  // Appliances
  renderAppliancesList();
  ensureEquipmentListsState();
  renderInverterSearchResults('');
  renderBatterySearchResults('');
  renderInverterList();
  renderBatteryList();

  // Tariff
  const tariffInput = document.getElementById('wizardTariff');
  const currencySelect = document.getElementById('wizardCurrency');
  if (tariffInput) tariffInput.value = data.q6_tariff.price || 4.5;
  if (currencySelect) currencySelect.value = data.q6_tariff.currency || 'THB';

  // Export price
  const exportPrice = document.getElementById('splitExportPrice');
  if (exportPrice && data.q7_export.price != null) {
    exportPrice.value = data.q7_export.price;
  }

  // Export currency label sync
  const exportLabel = document.getElementById('exportCurrencyLabel');
  if (exportLabel) {
    exportLabel.textContent = (data.q6_tariff.currency || 'THB') + '/kWh';
  }
  refreshCurrencyDisplays();
}

// ============ MODEL ROTATION CONTROLS ============

// ============ BOUNDARY SCATTER + RAY CASTING ============
let boundaryScatterBusy = false;

/**
 * Pre-load surrounding 3D tiles by rendering from multiple camera angles.
 * Primes the tile cache so pickFromRayMostDetailed is faster.
 */
async function preloadTilesForShading(viewer, houseLocation) {
  const googleTiles = typeof getGoogleTiles === 'function' ? getGoogleTiles() : null;
  if (!googleTiles) {
    console.log('[Shading] No Google 3D tiles to preload');
    return;
  }

  const savedPos = viewer.camera.position.clone();
  const savedDir = viewer.camera.direction.clone();
  const savedUp  = viewer.camera.up.clone();

  const savedSSE = googleTiles.maximumScreenSpaceError;
  googleTiles.maximumScreenSpaceError = 8;

  const lon = houseLocation.lon;
  const lat = houseLocation.lat;
  const alt = (houseLocation.height || 0) + 150;

  // Look from 4 cardinal directions toward the house + straight down
  const offsets = [
    [0.002, 0], [-0.002, 0], [0, 0.002], [0, -0.002]
  ];
  const target = Cesium.Cartesian3.fromDegrees(lon, lat, houseLocation.height || 0);

  for (const [dLon, dLat] of offsets) {
    const eye = Cesium.Cartesian3.fromDegrees(lon + dLon, lat + dLat, alt);
    viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(
      Math.atan2(dLon, dLat), Cesium.Math.toRadians(-35), 250
    ));
    viewer.scene.requestRender();
    await new Promise(r => setTimeout(r, 400));
  }

  // Top-down view
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt + 200)
  });
  viewer.scene.requestRender();
  await new Promise(r => setTimeout(r, 400));

  // Wait for tiles to settle
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (googleTiles.tilesLoaded) break;
    viewer.scene.requestRender();
    await new Promise(r => setTimeout(r, 300));
  }

  googleTiles.maximumScreenSpaceError = savedSSE;
  viewer.camera.setView({
    destination: savedPos,
    orientation: { direction: savedDir, up: savedUp }
  });
  console.log('[Shading] Tile preload complete');
}

async function runBoundaryScatter(roofIndex, options = {}) {
  const { waitForShading = false, finishOverlay = false, skipBaseScatter = false, finalOnly = false } = options;
  if (boundaryScatterBusy) return;

  if (!splitViewer || !wizard) return;
  const gen = scatterGeneration;  // capture current generation
  const boundaries = getBoundaries();
  const boundary = boundaries && boundaries[roofIndex] ? boundaries[roofIndex] : null;
  if (!boundary || boundary.length < 3) {
    console.warn('[Scatter] No valid boundary for roof index', roofIndex);
    return;
  }

  const loc = wizard.sessionData?.step1?.location;
  if (!loc || loc.lat == null || loc.lon == null) return;

  const houseLocation = {
    lat: loc.lat,
    lon: loc.lon,
    height: loc.height || 0
  };

  boundaryScatterBusy = true;

  try {
    console.log('[Scatter] Starting for roof', roofIndex + 1, 'points:', boundary.length);
    const viewer = getViewer();
    if (!viewer) {
      console.warn('[Scatter] Cesium viewer missing');
      return;
    }

    const osm = await ensureOsmBuildings();
    if (gen !== scatterGeneration) return; // stale — scene was cleared
    if (!osm) {
      console.log('[Scatter] OSM not loaded (casting against Google 3D tiles only)');
    }

    // Pre-load surrounding 3D tiles so ray casts can detect nearby buildings
    await preloadTilesForShading(viewer, houseLocation);
    if (gen !== scatterGeneration) return;

    const roofMesh = findRoofMesh(splitViewer.scene);
    if (!roofMesh) {
      console.warn('[Scatter] Roof mesh not found in Three.js scene');
      return;
    }
    roofMesh.updateMatrixWorld(true);

    const spacing = 0.6; // coarser grid for performance
    const pointsEcef = sampleBoundaryPoints(boundary, spacing);
    if (!pointsEcef.length) {
      console.warn('[Scatter] No sample points generated');
      return;
    }
    console.log('[Scatter] Sample points:', pointsEcef.length);

    const times = buildKeyTimes();
    let counts = new Array(pointsEcef.length).fill(0);
    let usedSamples = 0;

    let localPoints = toGlbLocalPoints(pointsEcef) || [];
    if (!localPoints.length) {
      console.warn('[Scatter] Missing mesh transform, falling back to centroid alignment');
      const pointsWorld = pointsEcef.map(p => ecefToWorld(p, houseLocation));
      const alignedWorld = alignWorldPointsToRoof(pointsWorld, roofMesh);
      localPoints = alignedWorld.map(p => worldToLocal(p, roofMesh.matrixWorld));
    }

    // Downsample if too dense
    const maxPoints = 300;
    let samplePointsEcef = pointsEcef;
    let sampleLocalPoints = localPoints;
    if (pointsEcef.length > maxPoints) {
      const step = Math.ceil(pointsEcef.length / maxPoints);
      samplePointsEcef = pointsEcef.filter((_, idx) => idx % step === 0);
      sampleLocalPoints = localPoints.filter((_, idx) => idx % step === 0);
      console.log('[Scatter] Downsampled to', samplePointsEcef.length);
    }

    const modelRoot = splitViewer?.modelRoot || roofMesh;
    if (modelRoot !== roofMesh) {
      localPoints = localPoints.map(p => modelLocalToMeshLocal(p, modelRoot, roofMesh));
    }
    logScatterBounds(localPoints, roofMesh);

    if (waitForShading) {
      console.log('[Scatter] Computing final scatter for roof', roofIndex + 1);
      let renderedFallback = false;
      let fallbackTimer = null;
      if (!finalOnly) {
        fallbackTimer = setTimeout(() => {
          if (renderedFallback) return;
          renderedFallback = true;
          addScatterToScene(splitViewer.scene, roofMesh, localPoints, new Array(localPoints.length).fill(0), roofIndex);
          console.log('[Scatter] Rendered base scatter (timeout fallback)');
        }, 1500);
      }

      console.log('[Scatter] Shading compute start');
      {
        const result = await computeShadingCounts(samplePointsEcef, viewer, osm, times, houseLocation);
        if (gen !== scatterGeneration) return; // stale — new analyze started
        counts = result.counts;
        usedSamples = result.usedSamples;
      }
      if (fallbackTimer) clearTimeout(fallbackTimer);

      const denom = usedSamples || 1;
      const intensities = counts.map(c => c / denom);
      addScatterToScene(splitViewer.scene, roofMesh, sampleLocalPoints, intensities, roofIndex);
      console.log('[Scatter] Rendered after shading');
    } else {
      if (!skipBaseScatter) {
        addScatterToScene(splitViewer.scene, roofMesh, sampleLocalPoints, new Array(sampleLocalPoints.length).fill(0), roofIndex);
        console.log('[Scatter] Rendered base scatter');
      }

      {
        const result = await computeShadingCounts(samplePointsEcef, viewer, osm, times, houseLocation);
        if (gen !== scatterGeneration) return; // stale — new analyze started
        counts = result.counts;
        usedSamples = result.usedSamples;
      }
      if (usedSamples === 0) {
        console.warn('[Scatter] No valid sun samples, updating with base colors');
      }

      const denom = usedSamples || 1;
      const intensities = counts.map(c => c / denom);
      updateScatterColors(splitViewer.scene, intensities, roofIndex);
      console.log('[Scatter] Updated colors');
    }
  } catch (err) {
    console.warn('Boundary scatter failed:', err);
  } finally {
    if (finishOverlay) {
      const overlay = document.getElementById('wizardOverlay');
      if (overlay) overlay.style.display = 'none';
    }
    boundaryScatterBusy = false;
  }
}

async function runAllBoundaryScatter(options = {}) {
  const boundaries = getBoundaries() || [];
  const total = boundaries.length;
  if (!total) return;

  for (let i = 0; i < total; i++) {
    await runBoundaryScatter(i, {
      waitForShading: options.waitForShading,
      finishOverlay: false,
      skipBaseScatter: options.skipBaseScatter,
      finalOnly: options.finalOnly
    });
  }

  if (options.finishOverlay) {
    const overlay = document.getElementById('wizardOverlay');
    if (overlay) overlay.style.display = 'none';
  }
}

function findRoofMesh(scene) {
  let roofMesh = null;
  let maxVertices = 0;
  scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry && !obj.name.includes('scatter')) {
      const vertices = obj.geometry?.attributes?.position?.count || 0;
      if (vertices > maxVertices) {
        maxVertices = vertices;
        roofMesh = obj;
      }
    }
  });
  return roofMesh;
}

function buildKeyTimes() {
  const times = [];
  const base = new Date();
  const hours = [8, 10, 12, 14, 16];
  for (const h of hours) {
    const t = new Date(base);
    t.setHours(h, 0, 0, 0);
    times.push(t);
  }
  return times;
}

function sampleBoundaryPoints(boundary, spacing) {
  const pts = boundary.map(p => new Cesium.Cartesian3(p.x, p.y, p.z));
  const normal = computePolygonNormal(pts);
  if (!normal) return [];

  const origin = computeCentroid(pts);
  const basis = computePlaneBasis(pts, normal);
  if (!basis) return [];

  const { u, v } = basis;
  const poly2d = pts.map(p => {
    const rel = Cesium.Cartesian3.subtract(p, origin, new Cesium.Cartesian3());
    return {
      x: Cesium.Cartesian3.dot(rel, u),
      y: Cesium.Cartesian3.dot(rel, v)
    };
  });

  const bounds = getBounds2d(poly2d);
  const samples = [];

  for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
    for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
      if (!pointInPolygon2d(x, y, poly2d)) continue;
      const worldPoint = new Cesium.Cartesian3(
        origin.x + u.x * x + v.x * y,
        origin.y + u.y * x + v.y * y,
        origin.z + u.z * x + v.z * y
      );
      samples.push(worldPoint);
    }
  }

  return samples;
}

function computePolygonNormal(points) {
  if (!points || points.length < 3) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    nx += (p0.y - p1.y) * (p0.z + p1.z);
    ny += (p0.z - p1.z) * (p0.x + p1.x);
    nz += (p0.x - p1.x) * (p0.y + p1.y);
  }
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-6) return null;
  return new Cesium.Cartesian3(nx / len, ny / len, nz / len);
}

function computeCentroid(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = points.length || 1;
  return new Cesium.Cartesian3(x / n, y / n, z / n);
}

function computePlaneBasis(points, normal) {
  if (!points || points.length < 2) return null;
  const p0 = points[0];
  let u = Cesium.Cartesian3.subtract(points[1], p0, new Cesium.Cartesian3());
  const dot = Cesium.Cartesian3.dot(u, normal);
  u = Cesium.Cartesian3.subtract(u, Cesium.Cartesian3.multiplyByScalar(normal, dot, new Cesium.Cartesian3()), u);
  const uLen = Cesium.Cartesian3.magnitude(u);
  if (uLen < 1e-6 && points.length > 2) {
    u = Cesium.Cartesian3.subtract(points[2], p0, new Cesium.Cartesian3());
  }
  Cesium.Cartesian3.normalize(u, u);
  const v = Cesium.Cartesian3.cross(normal, u, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(v, v);
  return { u, v };
}

function getBounds2d(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function pointInPolygon2d(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function ecefToWorld(pointEcef, houseLocation) {
  const origin = Cesium.Cartesian3.fromDegrees(
    houseLocation.lon,
    houseLocation.lat,
    houseLocation.height || 0
  );
  const dx = pointEcef.x - origin.x;
  const dy = pointEcef.y - origin.y;
  const dz = pointEcef.z - origin.z;

  const latRad = Cesium.Math.toRadians(houseLocation.lat);
  const lonRad = Cesium.Math.toRadians(houseLocation.lon);

  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const cosLon = Math.cos(lonRad);
  const sinLon = Math.sin(lonRad);

  const east = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  return new THREE.Vector3(east, up, -north);
}

function alignWorldPointsToRoof(pointsWorld, roofMesh) {
  if (!pointsWorld.length) return [];
  const roofBox = new THREE.Box3().setFromObject(roofMesh);
  const roofCenter = roofBox.getCenter(new THREE.Vector3());

  const centroid = pointsWorld.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / pointsWorld.length);
  const offset = roofCenter.clone().sub(centroid);
  return pointsWorld.map(p => p.clone().add(offset));
}

function worldToLocal(worldPoint, roofMatrixWorld) {
  const inv = new THREE.Matrix4().copy(roofMatrixWorld).invert();
  return worldPoint.clone().applyMatrix4(inv);
}

function modelLocalToMeshLocal(modelLocalPoint, modelRoot, roofMesh) {
  const worldPoint = modelLocalPoint.clone().applyMatrix4(modelRoot.matrixWorld);
  const inv = new THREE.Matrix4().copy(roofMesh.matrixWorld).invert();
  return worldPoint.applyMatrix4(inv);
}

function logScatterBounds(localPoints, roofMesh) {
  if (!localPoints.length || !roofMesh || !roofMesh.geometry) return;
  const scatterBox = new THREE.Box3().setFromPoints(localPoints);
  roofMesh.geometry.computeBoundingBox();
  const roofBox = roofMesh.geometry.boundingBox;
  console.log('[Scatter] Local bounds:', {
    scatterMin: scatterBox.min,
    scatterMax: scatterBox.max,
    roofMin: roofBox?.min,
    roofMax: roofBox?.max
  });
}

function toGlbLocalPoints(pointsEcef) {
  const transform = window.lastAnalysisStats?.mesh_transform;
  if (!transform || !transform.origin_ecef || !transform.rotation) {
    return null;
  }

  const origin = transform.origin_ecef;
  const R = transform.rotation;
  if (origin.length !== 3 || R.length !== 3 || R[0].length !== 3) {
    return null;
  }

  const out = [];
  for (const p of pointsEcef) {
    const dx = p.x - origin[0];
    const dy = p.y - origin[1];
    const dz = p.z - origin[2];

    const x = R[0][0] * dx + R[0][1] * dy + R[0][2] * dz;
    const y = R[1][0] * dx + R[1][1] * dy + R[1][2] * dz;
    const z = R[2][0] * dx + R[2][1] * dy + R[2][2] * dz;

    out.push(new THREE.Vector3(x, y, z));
  }

  return out;
}

async function computeShadingCounts(pointsEcef, viewer, osmTileset, times, houseLocation) {
  const counts = new Array(pointsEcef.length).fill(0);
  let usedSamples = 0;

  for (const time of times) {
    const sunDir = getSunDirection(time, houseLocation);
    if (!isSunAboveHorizon(sunDir, houseLocation)) {
      console.log('[Shading] Sun below horizon at', time.getHours() + ':00, skipping');
      continue;
    }

    usedSamples += 1;
    let shadedInPass = 0;

    for (let i = 0; i < pointsEcef.length; i += 50) {
      const batch = pointsEcef.slice(i, i + 50);
      const results = await Promise.all(batch.map(p => castRay(viewer, osmTileset, p, sunDir)));
      results.forEach((res, idx) => {
        if (res) {
          counts[i + idx] += 1;
          shadedInPass++;
        }
      });
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    console.log(`[Shading] ${time.getHours()}:00 → ${shadedInPass}/${pointsEcef.length} points shaded`);
  }

  const totalShaded = counts.filter(c => c > 0).length;
  console.log(`[Shading] Summary: ${usedSamples} valid sun samples, ${totalShaded}/${pointsEcef.length} points have some shading`);
  return { counts, usedSamples };
}

async function castRay(viewer, osmTileset, pointEcef, sunDirection) {
  // Offset above roof surface using geodetic "up" to avoid self-intersection
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(pointEcef, new Cesium.Cartesian3());
  const upOffset = Cesium.Cartesian3.multiplyByScalar(up, 0.5, new Cesium.Cartesian3());
  const origin = Cesium.Cartesian3.add(pointEcef, upOffset, new Cesium.Cartesian3());

  const ray = new Cesium.Ray(origin, sunDirection);
  try {
    // Cast against Google 3D photorealistic tiles (all real buildings).
    // Exclude OSM buildings (low-res, often incomplete).
    const excludeList = osmTileset ? [osmTileset] : [];

    // pickFromRayMostDetailed forces Cesium to load 3D tiles along the ray
    // before picking. The sync pickFromRay misses buildings whose tiles
    // aren't in memory (camera not facing that direction).
    const result = await viewer.scene.pickFromRayMostDetailed(ray, excludeList);
    if (!result || !result.object) return false;
    // Ignore close hits (self-intersection with own building roof surface)
    return result.distance > 2.0;
  } catch (e) {
    return false;
  }
}

function getSunDirection(dateTime, houseLocation) {
  const julianDate = Cesium.JulianDate.fromDate(dateTime);
  try {
    const sunInertial = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(julianDate);
    const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(julianDate);

    if (icrfToFixed) {
      const sunEcef = Cesium.Matrix3.multiplyByVector(icrfToFixed, sunInertial, new Cesium.Cartesian3());
      Cesium.Cartesian3.normalize(sunEcef, sunEcef);
      return sunEcef;
    }
  } catch (e) {
    // Fallback below
  }

  const hour = dateTime.getHours() + dateTime.getMinutes() / 60;
  const dayOfYear = Math.floor((dateTime - new Date(dateTime.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const declination = 23.45 * Math.sin(Cesium.Math.toRadians((360 / 365) * (dayOfYear - 81)));

  const latRad = Cesium.Math.toRadians(houseLocation?.lat || 0);
  const lonRad = Cesium.Math.toRadians(houseLocation?.lon || 0);
  const hourAngle = Cesium.Math.toRadians((hour - 12) * 15);
  const decRad = Cesium.Math.toRadians(declination);

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinDec = Math.sin(decRad);
  const cosDec = Math.cos(decRad);
  const sinHour = Math.sin(hourAngle);
  const cosHour = Math.cos(hourAngle);

  const sinAltitude = sinLat * sinDec + cosLat * cosDec * cosHour;
  const cosAltitude = Math.sqrt(1 - sinAltitude * sinAltitude);

  if (cosAltitude < 0.001) {
    return new Cesium.Cartesian3(0, 0, -1);
  }

  const sinAzimuth = -(cosDec * sinHour) / cosAltitude;
  const cosAzimuth = (sinDec - sinLat * sinAltitude) / (cosLat * cosAltitude);

  const east = -sinAzimuth * cosAltitude;
  const north = -cosAzimuth * cosAltitude;
  const up = sinAltitude;

  const cosLon = Math.cos(lonRad);
  const sinLon = Math.sin(lonRad);

  const x = -sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up;
  const y = cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up;
  const z = cosLat * north + sinLat * up;

  return new Cesium.Cartesian3(x, y, z);
}

function isSunAboveHorizon(sunDirection, houseLocation) {
  const latRad = Cesium.Math.toRadians(houseLocation.lat);
  const lonRad = Cesium.Math.toRadians(houseLocation.lon);

  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const cosLon = Math.cos(lonRad);
  const sinLon = Math.sin(lonRad);

  const up = cosLat * cosLon * sunDirection.x + cosLat * sinLon * sunDirection.y + sinLat * sunDirection.z;
  return up > 0;
}

function addScatterToScene(scene, roofMesh, localPoints, intensities, roofIndex = 0) {
  if (!scene || !roofMesh || !localPoints.length) return;

  const scatterName = `roof-scatter-${roofIndex}`;
  const existing = scene.getObjectByName(scatterName);
  if (existing) {
    scene.remove(existing);
    existing.geometry?.dispose();
    existing.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }

  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const colors = [];

  for (let i = 0; i < localPoints.length; i++) {
    const p = localPoints[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    const worldPoint = p.clone().applyMatrix4(roofMesh.matrixWorld);
    positions.push(worldPoint.x, worldPoint.y, worldPoint.z);

    const intensity = Math.max(0, Math.min(1, intensities[i] || 0));
    colors.push(intensity, 1 - intensity, 0);
  }

  if (!positions.length) {
    console.warn('[Scatter] No valid world points');
    return;
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  roofMesh.geometry?.computeBoundingBox();
  const roofBox = roofMesh.geometry?.boundingBox;
  const roofSize = roofBox ? roofBox.getSize(new THREE.Vector3()) : new THREE.Vector3(10, 10, 10);
  const baseSize = Math.max(roofSize.x, roofSize.y, roofSize.z) || 10;

  const material = new THREE.PointsMaterial({
    size: 8,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false
  });

  const points = new THREE.Points(geometry, material);
  points.name = scatterName;
  points.renderOrder = 999;
  points.frustumCulled = false;

  scene.add(points);
  console.log('[Scatter] Points added:', positions.length / 3, 'size', material.size);
}


function updateScatterColors(scene, intensities, roofIndex = 0) {
  if (!scene) return;
  const scatterGroup = scene.getObjectByName(`roof-scatter-${roofIndex}`);
  if (!scatterGroup) return;

  if (scatterGroup.isPoints) {
    const colorAttr = scatterGroup.geometry.getAttribute('color');
    if (!colorAttr) return;
    for (let i = 0; i < colorAttr.count; i++) {
      const intensity = Math.max(0, Math.min(1, intensities[i] || 0));
      colorAttr.setXYZ(i, intensity, 1 - intensity, 0);
    }
    colorAttr.needsUpdate = true;
  }
}

// ============ SAVE FROM SPLIT VIEW ============
async function saveFromSplitView() {
  const nameInput = document.getElementById('splitProjectName');
  const name = (nameInput && nameInput.value.trim()) || `Solar Project ${new Date().toLocaleDateString()}`;

  const btn = document.getElementById('btnSplitSave');
  const msgEl = document.getElementById('splitSaveMsg');
  const popup = document.getElementById('savePopup');
  const popupTitle = document.getElementById('savePopupTitle');
  const popupBody = document.getElementById('savePopupBody');
  const popupClose = document.getElementById('savePopupClose');

  function showPopup(title, body) {
    if (!popup || !popupTitle || !popupBody) return;
    popupTitle.textContent = title;
    popupBody.textContent = body || '';
    popup.classList.remove('hidden');
  }

  function hidePopup() {
    if (!popup) return;
    popup.classList.add('hidden');
  }

  if (popupClose) {
    popupClose.onclick = () => hidePopup();
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  // Hardcode defaults for fields not shown in split-view
  wizard.setGridExportAllowed(true);
  wizard.setSystemType('auto');

  try {
    const modelCapture = await captureModelSnapshot();
    if (modelCapture && wizard) {
      wizard.setCaptureModelImage(modelCapture);
    }
    const result = await wizard.saveDataset(name);
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.textContent = `Project "${result.project?.name || name}" saved successfully!`;
      msgEl.className = 'success-message';
    }
    showPopup('Project Saved', `Saved "${result.project?.name || name}".`);
    if (btn) {
      btn.textContent = 'Saved!';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Save Project';
      }, 2000);
    }
  } catch (error) {
    console.error('Error saving project:', error);
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.textContent = 'Error saving project. Please try again.';
      msgEl.className = 'error-message';
    }
    showPopup('Save Failed', 'Error saving project. Please try again.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Project';
    }
  }
}

async function captureModelSnapshot() {
  if (!splitViewer || !splitViewer.renderer) return null;
  const canvas = splitViewer.renderer.domElement;
  if (!canvas) return null;

  if (splitViewer.renderer.render && splitViewer.scene && splitViewer.camera) {
    splitViewer.renderer.render(splitViewer.scene, splitViewer.camera);
  }
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));

  try {
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Model capture failed:', err);
    return null;
  }
}

// ============ LOCATION MODE HANDLING ============
function setupLocationModeTabs() {
  const tabs = document.querySelectorAll('.location-mode-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      switchLocationMode(mode);
    });
  });
}

function switchLocationMode(mode) {
  document.querySelectorAll('.location-mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  document.getElementById('locationModeSearch')?.classList.toggle('active', mode === 'search');
  document.getElementById('locationModeManual')?.classList.toggle('active', mode === 'manual');
  document.getElementById('locationModeDetect')?.classList.toggle('active', mode === 'detect');
}

function goToManualLatLon() {
  const latInput = document.getElementById('manualLatInput');
  const lonInput = document.getElementById('manualLonInput');

  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    alert('Please enter a valid latitude (-90 to 90).');
    return;
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    alert('Please enter a valid longitude (-180 to 180).');
    return;
  }

  const locationName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  flyToLocation({ lat, lon, height: 500 }, locationName);
  wizard.setLocationData(lat, lon, locationName);

  const addressSelected = document.getElementById('addressSelected');
  if (addressSelected) {
    addressSelected.style.display = 'block';
    addressSelected.innerHTML = `<strong>Location:</strong> ${locationName}`;
  }
}

function detectUserLocation() {
  const statusEl = document.getElementById('detectLocationStatus');
  const btnDetect = document.getElementById('btnDetectLocation');

  if (!navigator.geolocation) {
    if (statusEl) statusEl.innerHTML = '<span style="color: #c62828;">Geolocation is not supported by your browser.</span>';
    return;
  }

  if (btnDetect) {
    btnDetect.disabled = true;
    btnDetect.textContent = 'Detecting...';
  }
  if (statusEl) statusEl.innerHTML = 'Requesting location...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const accuracy = position.coords.accuracy;
      const locationName = `Detected (${lat.toFixed(4)}, ${lon.toFixed(4)})`;

      flyToLocation({ lat, lon, height: 500 }, locationName);
      wizard.setLocationData(lat, lon, locationName);

      if (statusEl) {
        statusEl.innerHTML = '';
      }

      const addressSelected = document.getElementById('addressSelected');
      if (addressSelected) {
        addressSelected.style.display = 'block';
        addressSelected.innerHTML = `<strong>Detected Location:</strong> ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
      }

      if (btnDetect) {
        btnDetect.disabled = false;
        btnDetect.textContent = 'Detect';
      }
    },
    (error) => {
      let errorMsg = 'Unable to detect location.';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg = 'Location access denied. Please enable location permissions in your browser.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg = 'Location information unavailable.';
          break;
        case error.TIMEOUT:
          errorMsg = 'Location request timed out.';
          break;
      }
      if (statusEl) {
        statusEl.innerHTML = `<span style="color: #c62828;">${errorMsg}</span>`;
      }
      if (btnDetect) {
        btnDetect.disabled = false;
        btnDetect.textContent = 'Detect';
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

// ============ MAP MODE ============
function renderMapMode() {
  // Use boundaries from draw.js (persists on refresh)
  updateRoofCount();
  setTimeout(resizeCesium, 100);
}

async function onAnalyzeRoof() {
  const overlay = document.getElementById('wizardOverlay');
  const overlayMsg = document.getElementById('wizardOverlayMsg');

  const boundaries = getBoundaries();
  if (!boundaries || boundaries.length === 0) {
    alert('Please draw a roof boundary first');
    return;
  }

  overlay.style.display = 'flex';
  overlayMsg.textContent = 'Analyzing roof...';

  let deferOverlayHide = false;
  try {
    const data = await analyzeRoofs(boundaries);
    if (!data || !data.stats) {
      throw new Error('Analysis returned no data');
    }

    // Remember the freshly generated GLB filename (unique per analyze run)
    lastModelFile = data.file || 'roof_model.glb';

    const roofs = data.stats.roofs.map((roofInfo, i) => ({
      ...roofInfo,
      polygon: wizard.convertBoundaryToLatLon(boundaries[i] || [])
    }));

    wizard.setRoofs(roofs);
    window.lastAnalysisStats = data.stats || null;

    // Update project tree with roof data
    if (window.ProjectTree) {
      ProjectTree.updateRoofs(roofs);
    }

    if (data.stats.house_lat != null && data.stats.house_lon != null) {
      wizard.setLocationData(
        data.stats.house_lat,
        data.stats.house_lon,
        wizard.sessionData.step1.location.address || 'Analyzed Location'
      );
    }

    renderMapMode();

    // Capture cropped roof image from Cesium view (before leaving map mode)
    try {
      const capture = await captureRoofSnapshot(boundaries);
      if (capture && wizard) {
        wizard.setCaptureImage(capture);
      }
    } catch (err) {
      console.warn('Capture failed:', err);
    }

    // Fresh analysis — detach from any previously saved project so
    // initSplitViewer() loads the newly generated roof_model.glb
    // instead of an old project-specific model file.
    wizard.sessionData.projectId = null;
    wizard.saveSessionData();

    // Defer overlay until scatter is computed in split view
    deferOverlayHide = true;
    overlayMsg.textContent = 'Computing shading...';
    window.pendingScatter = {
      mode: 'all',
      waitForShading: true,
      finishOverlay: true,
      finalOnly: true
    };

    showSplitView();
  } catch (error) {
    console.error('Error analyzing roof:', error);
    alert('Error analyzing roof. Please try again.');
  } finally {
    if (!deferOverlayHide) {
      overlay.style.display = 'none';
    }
  }
}

async function captureRoofSnapshot(boundaries) {
  const viewer = getViewer && getViewer();
  if (!viewer || !viewer.scene || !viewer.scene.canvas) return null;
  const canvas = viewer.scene.canvas;

  viewer.scene.requestRender();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const ratio = canvas.width / Math.max(1, canvas.clientWidth);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const allPoints = [];
  (boundaries || []).forEach(b => {
    (b || []).forEach(p => allPoints.push(p));
  });

  allPoints.forEach((pos) => {
    const win = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, pos);
    if (!win) return;
    const x = win.x * ratio;
    const y = win.y * ratio;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return canvas.toDataURL('image/png');
  }

  const pad = 80 * ratio;
  let x = Math.max(0, Math.floor(minX - pad));
  let y = Math.max(0, Math.floor(minY - pad));
  let w = Math.min(canvas.width - x, Math.ceil((maxX - minX) + pad * 2));
  let h = Math.min(canvas.height - y, Math.ceil((maxY - minY) + pad * 2));

  if (w <= 0 || h <= 0) {
    return canvas.toDataURL('image/png');
  }

  const temp = document.createElement('canvas');
  temp.width = w;
  temp.height = h;
  const ctx = temp.getContext('2d');
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return temp.toDataURL('image/png');
}

function onResetRoof() {
  resetBoundaries();
  wizard.setRoofs([]);
  renderMapMode();
}

// ============ APPLIANCE FUNCTIONS ============
function addApplianceFromWizard() {
  const select = document.getElementById('wizardPresetAppliance');
  const value = select.value;

  if (!value) {
    alert('Please select an appliance');
    return;
  }

  // Handle custom appliance - add empty one
  if (value === 'custom') {
    wizard.addAppliance({ 
      name: '', 
      power: '', 
      usage_start: '06:00', 
      usage_end: '22:00' 
    });
    select.value = '';
    renderAppliancesList();
    return;
  }

  // Handle preset appliance
  const [name, power] = value.split('|');
  wizard.addAppliance({
    name: name,
    power: parseInt(power, 10),
    usage_start: '06:00',
    usage_end: '22:00'
  });
  select.value = '';
  renderAppliancesList();
}


function renderAppliancesList() {
  const list = document.getElementById('wizardAppliancesList');
  if (!list) return;
  const appliances = wizard.sessionData.step2.q4_appliances || [];

  if (appliances.length === 0) {
    list.innerHTML = '<div class="form-hint">No appliances added yet. Add one to get started.</div>';
    return;
  }

  list.innerHTML = appliances.map((app, idx) => `
    <div class="appliance-item-editable" data-appliance-index="${idx}">
      <div class="appliance-item-header">
        <input type="text" class="appliance-name-input"
               data-index="${idx}"
               value="${app.name}"
               placeholder="Appliance name"
               style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); border: 1px solid var(--border-medium); border-radius: var(--radius-sm); padding: var(--sp-1) var(--sp-2); flex: 1; margin-right: var(--sp-2); background: var(--bg-card);">
        <button class="appliance-remove" onclick="removeApplianceFromWizard(${idx})">Remove</button>
      </div>
      <div class="appliance-edit-row" style="grid-template-columns: 1fr 1fr 1fr;">
        <div class="appliance-edit-field">
          <label>Power (W)</label>
          <input type="number" class="appliance-power-input"
                 data-index="${idx}"
                 value="${app.power}"
                 placeholder="W"
                 min="1" step="1">
        </div>
        <div class="appliance-edit-field">
          <label>Start</label>
          <input type="time" class="appliance-start-input"
                 data-index="${idx}"
                 value="${app.usage_start || '06:00'}">
        </div>
        <div class="appliance-edit-field">
          <label>End</label>
          <input type="time" class="appliance-end-input"
                 data-index="${idx}"
                 value="${app.usage_end || '22:00'}">
        </div>
      </div>
    </div>
  `).join('');

  // Attach event listeners for editing
  list.querySelectorAll('.appliance-name-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      wizard.updateAppliance(idx, { name: e.target.value });
    });
  });

  list.querySelectorAll('.appliance-power-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      wizard.updateAppliance(idx, { power: e.target.value });
    });
  });

  list.querySelectorAll('.appliance-start-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      wizard.updateAppliance(idx, { usage_start: e.target.value });
    });
  });

  list.querySelectorAll('.appliance-end-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      wizard.updateAppliance(idx, { usage_end: e.target.value });
    });
  });
}

function removeApplianceFromWizard(index) {
  wizard.removeAppliance(index);
  renderAppliancesList();
}

// ============ INVERTER / BATTERY FUNCTIONS ============
function ensureEquipmentListsState() {
  if (!wizard || !wizard.sessionData || !wizard.sessionData.step2) return;
  const step2 = wizard.sessionData.step2;
  if (!Array.isArray(step2.q9_inverters)) step2.q9_inverters = [];
  if (!Array.isArray(step2.q10_batteries)) step2.q10_batteries = [];
}

function addInverterFromDetailsByIndex(idx) {
  ensureEquipmentListsState();
  if (!Number.isInteger(idx) || !DEMO_INVERTERS[idx]) return;
  wizard.sessionData.step2.q9_inverters.push({ ...DEMO_INVERTERS[idx] });
  wizard.saveSessionData();
  const search = document.getElementById('splitInverterSearch');
  if (search) search.value = '';
  renderInverterSearchResults('');
  renderInverterList();
  refreshLivePrice();
}

function addBatteryFromDetailsByIndex(idx) {
  ensureEquipmentListsState();
  if (!Number.isInteger(idx) || !DEMO_BATTERIES[idx]) return;
  wizard.sessionData.step2.q10_batteries.push({ ...DEMO_BATTERIES[idx] });
  wizard.saveSessionData();
  const search = document.getElementById('splitBatterySearch');
  if (search) search.value = '';
  renderBatterySearchResults('');
  renderBatteryList();
  refreshLivePrice();
}

function renderInverterSearchResults(filterText = '') {
  const list = document.getElementById('splitInverterSearchList');
  if (!list) return;
  const currency = getSelectedCurrencySafe();
  const ft = String(filterText || '').toLowerCase().trim();
  const filtered = DEMO_INVERTERS.filter((inv) => {
    if (!ft) return true;
    return inv.brand.toLowerCase().includes(ft) ||
      inv.model.toLowerCase().includes(ft) ||
      String(inv.kw).includes(ft);
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="form-hint">No inverter found.</div>';
    return;
  }

  list.innerHTML = filtered.map((inv) => {
    const idx = DEMO_INVERTERS.indexOf(inv);
    const priceText = formatCurrencyAmount(convertAmount(inv.price, 'USD', currency), currency);
    return `
      <div class="appliance-item">
        <div class="appliance-item-info">
          <div class="appliance-item-name">${inv.brand} ${inv.model}</div>
          <div class="appliance-item-details">${inv.kw} kW · ${inv.phase} phase · ${priceText}</div>
        </div>
        <button class="btn-small" data-add-inverter="${idx}" style="padding: 6px 10px; background: #2b2b2b; color: #fff; border: none;">Add</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-add-inverter]').forEach((btn) => {
    btn.addEventListener('click', () => addInverterFromDetailsByIndex(Number(btn.dataset.addInverter)));
  });
}

function renderBatterySearchResults(filterText = '') {
  const list = document.getElementById('splitBatterySearchList');
  if (!list) return;
  const currency = getSelectedCurrencySafe();
  const ft = String(filterText || '').toLowerCase().trim();
  const filtered = DEMO_BATTERIES.filter((bat) => {
    if (!ft) return true;
    return bat.brand.toLowerCase().includes(ft) ||
      bat.model.toLowerCase().includes(ft) ||
      String(bat.kwh).includes(ft);
  });

  if (!filtered.length) {
    list.innerHTML = '<div class="form-hint">No battery found.</div>';
    return;
  }

  list.innerHTML = filtered.map((bat) => {
    const idx = DEMO_BATTERIES.indexOf(bat);
    const priceText = formatCurrencyAmount(convertAmount(bat.price, 'USD', currency), currency);
    return `
      <div class="appliance-item">
        <div class="appliance-item-info">
          <div class="appliance-item-name">${bat.brand} ${bat.model}</div>
          <div class="appliance-item-details">${bat.kwh} kWh · ${bat.kw} kW · ${priceText}</div>
        </div>
        <button class="btn-small" data-add-battery="${idx}" style="padding: 6px 10px; background: #2b2b2b; color: #fff; border: none;">Add</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-add-battery]').forEach((btn) => {
    btn.addEventListener('click', () => addBatteryFromDetailsByIndex(Number(btn.dataset.addBattery)));
  });
}

function renderInverterList() {
  ensureEquipmentListsState();
  const list = document.getElementById('splitInverterList');
  if (!list) return;
  const inverters = wizard.sessionData.step2.q9_inverters;
  const currency = getSelectedCurrencySafe();
  if (!inverters.length) {
    list.innerHTML = '<div class="form-hint">No inverter added.</div>';
    return;
  }
  list.innerHTML = inverters.map((inv, idx) => `
    <div class="appliance-item">
      <div class="appliance-item-info">
        <div class="appliance-item-name">${inv.brand} ${inv.model}</div>
        <div class="appliance-item-details">${inv.kw} kW · ${inv.phase} phase · ${formatCurrencyAmount(convertAmount(inv.price, 'USD', currency), currency)}</div>
      </div>
      <button class="appliance-remove" data-index="${idx}" data-type="inverter">Remove</button>
    </div>
  `).join('');
  list.querySelectorAll('.appliance-remove[data-type="inverter"]').forEach((btn) => {
    btn.addEventListener('click', () => removeInverterFromDetails(Number(btn.dataset.index)));
  });
}

function renderBatteryList() {
  ensureEquipmentListsState();
  const list = document.getElementById('splitBatteryList');
  if (!list) return;
  const batteries = wizard.sessionData.step2.q10_batteries;
  const currency = getSelectedCurrencySafe();
  if (!batteries.length) {
    list.innerHTML = '<div class="form-hint">No battery added.</div>';
    return;
  }
  list.innerHTML = batteries.map((bat, idx) => `
    <div class="appliance-item">
      <div class="appliance-item-info">
        <div class="appliance-item-name">${bat.brand} ${bat.model}</div>
        <div class="appliance-item-details">${bat.kwh} kWh · ${bat.kw} kW · ${formatCurrencyAmount(convertAmount(bat.price, 'USD', currency), currency)}</div>
      </div>
      <button class="appliance-remove" data-index="${idx}" data-type="battery">Remove</button>
    </div>
  `).join('');
  list.querySelectorAll('.appliance-remove[data-type="battery"]').forEach((btn) => {
    btn.addEventListener('click', () => removeBatteryFromDetails(Number(btn.dataset.index)));
  });
}

function removeInverterFromDetails(index) {
  ensureEquipmentListsState();
  const list = wizard.sessionData.step2.q9_inverters;
  if (index < 0 || index >= list.length) return;
  list.splice(index, 1);
  wizard.saveSessionData();
  renderInverterList();
  refreshLivePrice();
}

function removeBatteryFromDetails(index) {
  ensureEquipmentListsState();
  const list = wizard.sessionData.step2.q10_batteries;
  if (index < 0 || index >= list.length) return;
  list.splice(index, 1);
  wizard.saveSessionData();
  renderBatteryList();
  refreshLivePrice();
}

// ============ UTILITIES ============
function setStatus(message) {
  console.log('Status:', message);
}
