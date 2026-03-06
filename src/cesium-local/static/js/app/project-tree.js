/**
 * Project Tree - SolidWorks FeatureManager Design Tree
 * Roof-focused hierarchical tree with selection, context menus, keyboard nav
 * Includes panel browser (right-click roof → Add Panel)
 */

const ProjectTree = (function () {
  let treeRoot = null;
  let treeData = null;
  let selectedId = null;
  let contextMenuEl = null;
  let onSelectCallback = null;
  let onContextActionCallback = null;
  let panelBrowserEl = null;
  let panelBrowserRoofId = null;
  let panelBrowserAutoMode = false;
  let panelCatalog = [];
  let panelCatalogLoadPromise = null;
  let panelFilterState = { brand: '', minWatt: '', maxWatt: '', open: false };

  // ─── Panel Catalog (DB API) ───
  const PANEL_API_URL = '/api/catalog/panels';
  const DEFAULT_PANEL_THICKNESS_M = 0.03;
  const DEFAULT_PANEL_WIDTH_M = 1.134;
  const DEFAULT_PANEL_LENGTH_M = 1.722;

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'panel';
  }

  function parseNumber(text) {
    if (text == null) return null;
    const cleaned = String(text).replace(/[^\d.]+/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function formatPanelPrice(priceUSD) {
    const curUtil = window.CurrencyUtil;
    const currency = curUtil && typeof curUtil.getSelectedCurrency === 'function'
      ? curUtil.getSelectedCurrency()
      : 'THB';
    const converted = curUtil && typeof curUtil.convert === 'function'
      ? curUtil.convert(priceUSD, 'USD', currency)
      : Number(priceUSD) || 0;
    if (curUtil && typeof curUtil.format === 'function') {
      return curUtil.format(converted, currency);
    }
    return `${currency} ${Number(converted || 0).toLocaleString()}`;
  }

  function parsePanelSizeMm(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/[^0-9.xX]/g, '');
    const m = cleaned.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    const lengthMm = Number(m[1]);
    const widthMm = Number(m[2]);
    const thicknessMm = Number(m[3]);
    if (!Number.isFinite(lengthMm) || !Number.isFinite(widthMm) || !Number.isFinite(thicknessMm)) return null;
    return {
      lengthM: lengthMm / 1000,
      widthM: widthMm / 1000,
      thicknessM: thicknessMm / 1000
    };
  }

  function parseSimpleCsv(text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const row = {};
      for (let j = 0; j < header.length; j++) row[header[j]] = cols[j] || '';
      rows.push(row);
    }
    return rows;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePanelRow(row) {
    const brand = row['Brand'] || 'Unknown';
    const model = row['Model'] || 'Panel';
    const dims = parsePanelSizeMm(row['Solar panel size (mm)']) || {
      lengthM: DEFAULT_PANEL_LENGTH_M,
      widthM: DEFAULT_PANEL_WIDTH_M,
      thicknessM: DEFAULT_PANEL_THICKNESS_M
    };

    const watt = parseNumber(row['Solar panel wattage (W)']) || 0;
    const eff = parseNumber(row['Solar panel efficiency']);
    const price = parseNumber(row['Cost (¥)']) || 0;
    const type = row['Solar panel type'] || '';
    const panelId = slugify(`${brand}-${model}-${watt || 'w'}`);

    return {
      panelId,
      brand,
      model,
      type,
      watt,
      eff,
      price,
      lengthM: dims.lengthM,
      widthM: dims.widthM,
      thicknessM: dims.thicknessM
    };
  }

  function normalizeApiPanel(p) {
    const brand = p.brand || 'Unknown';
    const model = p.model || 'Panel';
    const watt = p.power_w || 0;
    const eff = p.efficiency != null ? p.efficiency : null;
    const price = p.price_usd || 0;
    const lengthM = p.length_mm ? p.length_mm / 1000 : DEFAULT_PANEL_LENGTH_M;
    const widthM = p.width_mm ? p.width_mm / 1000 : DEFAULT_PANEL_WIDTH_M;
    const thicknessM = DEFAULT_PANEL_THICKNESS_M;
    const panelId = slugify(`${brand}-${model}-${watt || 'w'}`);
    return { panelId, brand, model, type: '', watt, eff, price, lengthM, widthM, thicknessM };
  }

  async function ensurePanelCatalogLoaded() {
    if (panelCatalog.length > 0) return panelCatalog;
    if (panelCatalogLoadPromise) return panelCatalogLoadPromise;

    panelCatalogLoadPromise = fetch(PANEL_API_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        const panels = data.panels || [];
        panelCatalog = panels.map(normalizeApiPanel).filter(p => p.panelId);
        panelCatalog.sort((a, b) => (b.watt || 0) - (a.watt || 0));
        return panelCatalog;
      })
      .catch((err) => {
        console.error('[ProjectTree] Failed loading panel catalog from API:', err);
        panelCatalog = [];
        return panelCatalog;
      })
      .finally(() => {
        panelCatalogLoadPromise = null;
      });

    return panelCatalogLoadPromise;
  }

  // ─── Default skeleton ───
  function getDefaultTree() {
    return {
      id: 'project', icon: '', label: 'Project', open: true, type: 'root',
      children: [
        { id: 'roofs', icon: '', label: 'ROOF', open: true, type: 'roof-group', children: [] },
      ]
    };
  }

  function createRoofNode(roof, index) {
    const roofColors = ['#d32f2f', '#2e7d32', '#1565c0', '#f9a825', '#6a1b9a', '#00838f'];
    const color = roofColors[index % roofColors.length];
    const fmt = (v, unit, dec) => v != null ? v.toFixed(dec) + unit : '—';
    const area = roof.area_m2 ?? roof.area;
    const tilt = roof.tilt_deg ?? roof.tilt;
    const azimuth = roof.azimuth_deg ?? roof.azimuth;
    // Show usable area; default to full roof area if no explicit usable area set.
    const usableArea = roof.usable_area_m2 ?? roof.usable_area ?? roof.area;

    return {
      id: `roof-${index}`, icon: '', color, label: `Roof_${index + 1}`, open: false, type: 'feature',
      children: [
        {
          id: `panels-${index}`, icon: '', label: 'Panels', open: false, type: 'panels',
          children: []
        },
        {
          id: `props-${index}`, icon: '', label: 'Properties', open: true, type: 'folder',
          children: [
            { id: `area-${index}`, icon: '', label: 'Area', value: fmt(area, ' m²', 1), type: 'param' },
            { id: `tilt-${index}`, icon: '', label: 'Tilt', value: fmt(tilt, '°', 1), type: 'param' },
            { id: `azimuth-${index}`, icon: '', label: 'Azimuth', value: fmt(azimuth, '°', 0), type: 'param' },
            { id: `usable-${index}`, icon: '', label: 'Usable Area', value: fmt(usableArea, ' m²', 1), type: 'param' }
          ]
        }
      ]
    };
  }

  // ─── Context menu definitions per node type ───
  const CONTEXT_MENUS = {
    root:              [{ action: 'expand-all', label: 'Expand All' }, { action: 'collapse-all', label: 'Collapse All' }],
    'roof-group':      [{ action: 'expand-all', label: 'Expand All' }, { action: 'collapse-all', label: 'Collapse All' }],
    folder:   [{ action: 'expand-all', label: 'Expand All' }, { action: 'collapse-all', label: 'Collapse All' }],
    panels:   [
      { action: 'edit-roof', label: 'Edit Roof' },
      { action: 'clear-roof-panels', label: 'Clear Panels' }
    ],
    feature:  [
      { action: 'add-panel', label: 'Add Panel' },
      { action: 'auto-panel', label: 'Auto Panel' }
    ],
    param:    [{ action: 'copy-value', label: 'Copy Value' }],
    data:     [{ action: 'copy-value', label: 'Copy Value' }],
    panel:    [{ action: 'delete-panel', label: 'Delete Panel' }]
  };

  // ─── Render ───
  function renderNode(node, depth, isLast, ancestorLasts) {
    const el = document.createElement('div');
    el.className = 'ptree-node';
    el.dataset.id = node.id;
    el.dataset.type = node.type || '';

    const row = document.createElement('div');
    row.className = 'ptree-row';
    if (node.id === selectedId) row.classList.add('selected');
    row.style.paddingLeft = (depth * 20 + 6) + 'px';

    const hasChildren = node.children && node.children.length > 0;
    row.dataset.depth = depth;

    // Toggle arrow
    const arrow = document.createElement('span');
    arrow.className = 'ptree-arrow';
    if (hasChildren) {
      arrow.innerHTML = node.open
        ? '<svg width="12" height="12" viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 10 10"><path d="M3 2 L7 5 L3 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
      arrow.classList.add('clickable');
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        node.open = !node.open;
        if (!node.open) collapseChildrenRecursive(node);
        render();
      });
    }
    row.appendChild(arrow);

    // Roof color marker
    if (node.color) {
      const dot = document.createElement('span');
      dot.className = 'ptree-icon-dot';
      dot.style.backgroundColor = node.color;
      row.appendChild(dot);
    } else if (node.icon) {
      const icon = document.createElement('span');
      icon.className = 'ptree-icon';
      icon.textContent = node.icon;
      row.appendChild(icon);
    }

    // Label
    const label = document.createElement('span');
    label.className = 'ptree-label';
    label.textContent = node.label;
    row.appendChild(label);

    // Value
    if (node.value != null) {
      const val = document.createElement('span');
      val.className = 'ptree-value';
      val.textContent = node.value;
      row.appendChild(val);
    }

    // Count badge
    if (hasChildren && (node.type === 'root' || node.type === 'roof-group')) {
      const badge = document.createElement('span');
      badge.className = 'ptree-badge';
      badge.textContent = node.children.length;
      row.appendChild(badge);
    }

    // Row click → SELECT
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node.id);
    });

    // Double click → expand/collapse
    row.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (hasChildren) { node.open = !node.open; if (!node.open) collapseChildrenRecursive(node); render(); }
    });

    // Right click → context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectNode(node.id);
      showContextMenu(e.clientX, e.clientY, node);
    });

    el.appendChild(row);

    if (hasChildren) {
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'ptree-children';
      if (!node.open) childrenWrap.classList.add('collapsed');

      node.children.forEach((child, i) => {
        const childIsLast = i === node.children.length - 1;
        const childEl = renderNode(child, depth + 1, childIsLast, [...(ancestorLasts || []), isLast]);
        if (childEl) childrenWrap.appendChild(childEl);
      });
      el.appendChild(childrenWrap);
    }

    return el;
  }

  function render() {
    if (!treeRoot || !treeData) return;
    const scrollTop = treeRoot.scrollTop;
    treeRoot.innerHTML = '';
    const el = renderNode(treeData, 0, true, []);
    if (el) treeRoot.appendChild(el);
    treeRoot.scrollTop = scrollTop;
  }

  // ─── Selection ───
  function selectNode(id) {
    if (selectedId === id) return;
    selectedId = id;
    treeRoot.querySelectorAll('.ptree-row.selected').forEach(r => r.classList.remove('selected'));
    const target = treeRoot.querySelector(`.ptree-node[data-id="${id}"] > .ptree-row`);
    if (target) target.classList.add('selected');
    if (onSelectCallback) onSelectCallback(id, findNode(treeData, id));
    updateStatusBar(id);
  }

  // ─── Context Menu ───
  function showContextMenu(x, y, node) {
    hideContextMenu();
    const items = CONTEXT_MENUS[node.type] || CONTEXT_MENUS.folder;
    if (!items || items.length === 0) return;

    contextMenuEl = document.createElement('div');
    contextMenuEl.className = 'ptree-ctx-menu';

    items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'ptree-ctx-sep';
        contextMenuEl.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'ptree-ctx-item';
      btn.textContent = item.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideContextMenu();
        handleContextAction(item.action, node);
      });
      contextMenuEl.appendChild(btn);
    });

    document.body.appendChild(contextMenuEl);
    const rect = contextMenuEl.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    contextMenuEl.style.left = (x + rect.width > vw ? vw - rect.width - 4 : x) + 'px';
    contextMenuEl.style.top = (y + rect.height > vh ? vh - rect.height - 4 : y) + 'px';

    setTimeout(() => {
      document.addEventListener('click', hideContextMenu, { once: true });
      document.addEventListener('contextmenu', hideContextMenu, { once: true });
    }, 0);
  }

  function hideContextMenu() {
    if (contextMenuEl) { contextMenuEl.remove(); contextMenuEl = null; }
  }

  function handleContextAction(action, node) {
    switch (action) {
      case 'expand-all':  setOpenRecursive(node, true); render(); break;
      case 'collapse-all': setOpenRecursive(node, false); render(); break;
      case 'copy-value':
        if (node.value != null) navigator.clipboard.writeText(String(node.value)).catch(() => {});
        break;
      case 'add-panel':
        if (onContextActionCallback) onContextActionCallback('add-panel', node);
        showPanelBrowser(node.id, { auto: false });
        break;
      case 'auto-panel':
        if (onContextActionCallback) onContextActionCallback('add-panel', node);
        if (onContextActionCallback) onContextActionCallback('auto-panel', node);
        showPanelBrowser(node.id, { auto: true });
        break;
      case 'select-3d': case 'hide': case 'show':
      case 'edit-roof':
      case 'clear-roof-panels':
      case 'delete-panel':
        if (onContextActionCallback) onContextActionCallback(action, node);
        break;
    }
  }

  function setOpenRecursive(node, open) {
    if (node.children) { node.open = open; node.children.forEach(c => setOpenRecursive(c, open)); }
  }

  function collapseChildrenRecursive(node) {
    if (node.children) node.children.forEach(c => { c.open = false; collapseChildrenRecursive(c); });
  }

  // ─── Status Bar ───
  function updateStatusBar(id) {
    const bar = document.getElementById('ptreeStatusText');
    if (!bar) return;
    const node = id ? findNode(treeData, id) : null;
    if (!node) { bar.textContent = 'Ready'; return; }
    let path = [];
    buildPath(treeData, id, path);
    bar.textContent = path.map(n => n.label).join(' › ');
  }

  function buildPath(node, targetId, path) {
    path.push(node);
    if (node.id === targetId) return true;
    if (node.children) {
      for (const child of node.children) {
        if (buildPath(child, targetId, path)) return true;
      }
    }
    path.pop();
    return false;
  }

  // ─── Keyboard Navigation ───
  function handleKeyDown(e) {
    if (!treeRoot) return;
    const rows = Array.from(treeRoot.querySelectorAll('.ptree-row'));
    if (rows.length === 0) return;
    let idx = rows.findIndex(r => r.classList.contains('selected'));

    if (e.key === 'ArrowDown') {
      e.preventDefault(); idx = Math.min(idx + 1, rows.length - 1);
      const id = rows[idx]?.closest('.ptree-node')?.dataset?.id;
      if (id) selectNode(id); rows[idx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); idx = Math.max(idx - 1, 0);
      const id = rows[idx]?.closest('.ptree-node')?.dataset?.id;
      if (id) selectNode(id); rows[idx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (selectedId) { const n = findNode(treeData, selectedId); if (n && n.children && !n.open) { n.open = true; render(); } }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (selectedId) { const n = findNode(treeData, selectedId); if (n && n.children && n.open) { n.open = false; collapseChildrenRecursive(n); render(); } }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedId) { const n = findNode(treeData, selectedId); if (n && n.children) { n.open = !n.open; if (!n.open) collapseChildrenRecursive(n); render(); } }
    }
  }

  function findNode(node, id) {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  // ─── Public API ───
  function init(containerEl) {
    treeRoot = containerEl;
    treeData = getDefaultTree();
    selectedId = null;
    render();
    containerEl.setAttribute('tabindex', '0');
    containerEl.addEventListener('keydown', handleKeyDown);
    updateStatusBar(null);
    // Refresh panel browser prices when currency changes
    window.addEventListener('currency-changed', () => {
      panelCatalog = []; // force re-render with new prices
      ensurePanelCatalogLoaded().then(() => refreshPanelBrowser());
    });
  }

  function updateRoofs(roofs) {
    if (!treeData) return;
    const roofGroup = findNode(treeData, 'roofs');
    if (!roofGroup) return;
    roofGroup.children = (roofs || []).map((r, i) => createRoofNode(r, i));
    roofGroup.open = true;
    render();
  }

  function updatePanels(roofIndex, panels) {
    if (!treeData) return;
    const panelsNode = findNode(treeData, `panels-${roofIndex}`);
    if (!panelsNode) return;
    panelsNode.children = (panels || []).map((p, i) => ({
      id: `panel-${roofIndex}-${i}`, icon: '', type: 'panel',
      label: p.label || `Panel_${p.type || '60cell'}_${String(i + 1).padStart(3, '0')}`,
      value: null,
      panelName: p.panelName || null
    }));
    panelsNode.open = panelsNode.children.length > 0;
    render();
  }

  // ─── Panel Browser ───
  function showPanelBrowser(roofId, options = {}) {
    panelBrowserRoofId = roofId;
    panelBrowserAutoMode = options.auto === true;
    const panel = treeRoot?.closest('.project-tree-panel');
    if (!panel) return;

    // Create browser container if needed
    if (!panelBrowserEl) {
      panelBrowserEl = document.createElement('div');
      panelBrowserEl.className = 'panel-browser';
      const insertAnchor = panel.querySelector('.ptree-resize-handle') || panel.querySelector('.ptree-status-bar');
      panel.insertBefore(panelBrowserEl, insertAnchor || null);
    }

    // Hide tree body, show browser
    if (treeRoot) treeRoot.style.display = 'none';
    panelBrowserEl.style.display = 'flex';

    renderPanelBrowser('', true);
    ensurePanelCatalogLoaded().then(() => {
      if (panelBrowserEl && panelBrowserEl.style.display !== 'none') {
        renderPanelBrowser('');
      }
    });
    updateStatusBar(null);
    const bar = document.getElementById('ptreeStatusText');
    if (bar) {
      const node = findNode(treeData, roofId);
      bar.textContent = `Select panel for ${node ? node.label : roofId}`;
    }
  }

  function hidePanelBrowser() {
    if (panelBrowserEl) panelBrowserEl.style.display = 'none';
    if (treeRoot) treeRoot.style.display = '';
    panelBrowserRoofId = null;
    panelBrowserAutoMode = false;
    panelFilterState = { brand: '', minWatt: '', maxWatt: '', open: false };
    updateStatusBar(selectedId);
  }

  function refreshPanelBrowser() {
    if (!panelBrowserEl || panelBrowserEl.style.display === 'none') return;
    const searchInput = panelBrowserEl.querySelector('.pb-search');
    const filter = searchInput ? searchInput.value : '';
    renderPanelBrowser(filter, false);
  }

  function renderPanelBrowser(filterText, loading) {
    if (!panelBrowserEl) return;
    const t = (window.I18n && typeof window.I18n.t === 'function') ? window.I18n.t : (s => s);
    const ft = (filterText || '').toLowerCase();
    const catalog = panelCatalog || [];
    const brandFilter = (panelFilterState.brand || '').toLowerCase();
    const rawMin = panelFilterState.minWatt ?? '';
    const rawMax = panelFilterState.maxWatt ?? '';
    const minWatt = rawMin === '' ? 0 : (Number.isFinite(parseFloat(rawMin)) ? parseFloat(rawMin) : 0);
    const parsedMax = rawMax === '' ? Infinity : parseFloat(rawMax);
    const maxWatt = Number.isFinite(parsedMax) ? parsedMax : Infinity;

    const filtered = catalog.filter(p => {
      const brand = (p.brand || '').trim().toLowerCase();
      const model = (p.model || '').toLowerCase();
      const watt = Number(p.watt) || 0;
      if (ft && !(brand.includes(ft) || model.includes(ft) || String(watt).includes(ft))) return false;
      if (brandFilter && brand !== brandFilter) return false;
      if (watt < minWatt) return false;
      if (Number.isFinite(maxWatt) && watt > maxWatt) return false;
      return true;
    });

    const brands = Array.from(new Set((catalog || []).map(p => (p.brand || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const brandOptions = [
      `<option value="">${t('filter.brand_all') || 'All'}</option>`
    ].concat(brands.map(b =>
      `<option value="${escapeHtml(b)}"${panelFilterState.brand === b ? ' selected' : ''}>${escapeHtml(b)}</option>`
    )).join('');
    const wattLabel = t('filter.watt_range') || 'Watt Range';

    const roofNode = panelBrowserRoofId ? findNode(treeData, panelBrowserRoofId) : null;
    const roofLabel = roofNode ? roofNode.label : 'Roof';

    panelBrowserEl.innerHTML = `
      <div class="pb-header">
        <button class="pb-back-btn" title="Back to tree">← Back</button>
        <span class="pb-title">${panelBrowserAutoMode ? 'Auto Panel' : 'Add Panel'} — ${roofLabel}</span>
      </div>
      <div class="pb-search-wrap">
        <div class="search-filter-row">
          <input type="text" class="pb-search" placeholder="Search brand, model, watt..." value="${filterText || ''}" autocomplete="off" spellcheck="false">
          <button class="filter-toggle-btn" id="pbFilterToggle" type="button" title="Filter panels" aria-label="Filter panels">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 2h14l-5 6v5l-4 2V8L1 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="filter-panel ${panelFilterState.open ? '' : 'hidden'}" id="pbFilterPanel">
          <div class="filter-row">
            <label class="filter-label">${t('filter.brand') || 'Brand'}</label>
            <select id="pbFilterBrand" class="filter-select">${brandOptions}</select>
          </div>
          <div class="filter-row">
            <label class="filter-label">${wattLabel}</label>
            <div class="filter-range">
              <input type="number" id="pbFilterMinW" class="filter-input" placeholder="Min" step="10" min="0" value="${panelFilterState.minWatt ?? ''}">
              <span class="filter-dash">–</span>
              <input type="number" id="pbFilterMaxW" class="filter-input" placeholder="Max" step="10" min="0" value="${panelFilterState.maxWatt ?? ''}">
            </div>
          </div>
        </div>
      </div>
      <div class="pb-list">
        ${loading ? '<div class="pb-empty">Loading panel catalog...</div>' : ''}
        ${!loading ? filtered.map((p, i) => `
          <div class="pb-card"
               data-idx="${i}"
               data-panelid="${p.panelId}"
               data-brand="${p.brand}"
               data-model="${p.model}"
               data-type="${p.type || ''}"
               data-watt="${p.watt || 0}"
               data-price="${p.price || 0}"
               data-eff="${p.eff != null ? p.eff : ''}"
               data-lengthm="${p.lengthM}"
               data-widthm="${p.widthM}"
               data-thicknessm="${p.thicknessM}">
            <div class="pb-card-top">
              <span class="pb-brand">${p.brand} ${p.model}</span>
              <span class="pb-price">${formatPanelPrice(p.price || 0)}</span>
            </div>
            <div class="pb-model">${p.type || ''} · ${p.lengthM.toFixed(3)} × ${p.widthM.toFixed(3)} m</div>
            <div class="pb-card-bottom">
              <span class="pb-watt">${p.watt || 0}W</span>
              <span class="pb-eff">${p.eff != null ? p.eff + '% eff' : ''}</span>
            </div>
          </div>
        `).join('') : ''}
        ${!loading && catalog.length === 0 ? '<div class="pb-empty">No panel data loaded</div>' : ''}
        ${!loading && catalog.length > 0 && filtered.length === 0 ? '<div class="pb-empty">No panels found</div>' : ''}
      </div>
    `;

    // Wire back button
    panelBrowserEl.querySelector('.pb-back-btn').addEventListener('click', () => {
      hidePanelBrowser();
      if (onContextActionCallback) onContextActionCallback('browser-closed', {});
    });

    // Wire search
    const searchInput = panelBrowserEl.querySelector('.pb-search');
    let debounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderPanelBrowser(searchInput.value), 150);
    });
    searchInput.focus();

    // Wire filters
    const filterPanel = panelBrowserEl.querySelector('#pbFilterPanel');
    const filterToggle = panelBrowserEl.querySelector('#pbFilterToggle');
    if (filterPanel && filterToggle) {
      filterToggle.classList.toggle('active', panelFilterState.open);
      filterPanel.classList.toggle('hidden', !panelFilterState.open);
      filterToggle.addEventListener('click', () => {
        const nowHidden = filterPanel.classList.toggle('hidden');
        panelFilterState.open = !nowHidden;
        filterToggle.classList.toggle('active', !nowHidden);
      });
    }

    const brandSel = panelBrowserEl.querySelector('#pbFilterBrand');
    if (brandSel) {
      brandSel.value = panelFilterState.brand || '';
      brandSel.addEventListener('change', () => {
        panelFilterState.brand = brandSel.value;
        renderPanelBrowser(searchInput ? searchInput.value : '');
      });
    }
    const minW = panelBrowserEl.querySelector('#pbFilterMinW');
    const maxW = panelBrowserEl.querySelector('#pbFilterMaxW');
    const handleRangeChange = () => renderPanelBrowser(searchInput ? searchInput.value : '');
    if (minW) {
      minW.addEventListener('input', () => {
        panelFilterState.minWatt = minW.value;
        handleRangeChange();
      });
      minW.addEventListener('change', () => {
        panelFilterState.minWatt = minW.value;
        handleRangeChange();
      });
    }
    if (maxW) {
      maxW.addEventListener('input', () => {
        panelFilterState.maxWatt = maxW.value;
        handleRangeChange();
      });
      maxW.addEventListener('change', () => {
        panelFilterState.maxWatt = maxW.value;
        handleRangeChange();
      });
    }

    // Wire card clicks
    panelBrowserEl.querySelectorAll('.pb-card').forEach(card => {
      card.addEventListener('click', () => {
        // Toggle selection — keep browser open
        panelBrowserEl.querySelectorAll('.pb-card.active').forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        const brand = card.dataset.brand;
        const model = card.dataset.model;
        const panelId = card.dataset.panelid;
        const watt = Number(card.dataset.watt || 0);
        const price = Number(card.dataset.price || 0);
        const eff = card.dataset.eff === '' ? null : Number(card.dataset.eff);
        const lengthM = Number(card.dataset.lengthm || 0);
        const widthM = Number(card.dataset.widthm || 0);
        const thicknessM = Number(card.dataset.thicknessm || DEFAULT_PANEL_THICKNESS_M);
        const panelType = card.dataset.type || '';
        const roofId = panelBrowserRoofId;

        if (onContextActionCallback) {
          onContextActionCallback('panel-selected', {
            roofId,
            panelId,
            brand,
            model,
            watt,
            price,
            panelSpec: {
              panelId,
              brand,
              model,
              type: panelType,
              watt,
              price,
              eff: Number.isFinite(eff) ? eff : null,
              lengthM,
              widthM,
              thicknessM
            },
            auto: panelBrowserAutoMode === true
          });
        }
      });
    });
  }

  function getSelected() { return selectedId; }

  return {
    init, render,
    updateRoofs, updatePanels,
    getSelected, selectNode,
    showPanelBrowser, hidePanelBrowser,
    refreshPanelBrowser,
    set onSelect(fn) { onSelectCallback = fn; },
    set onContextAction(fn) { onContextActionCallback = fn; },
    findNode: (id) => treeData ? findNode(treeData, id) : null,
    get data() { return treeData; }
  };
})();

window.ProjectTree = ProjectTree;
