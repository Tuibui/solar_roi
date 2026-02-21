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

  // ─── Demo Panel Catalog ───
  const DEMO_PANELS = [
    { brand: 'LONGi',          model: 'Hi-MO 6',       watt: 580, price: 185 },
    { brand: 'JA Solar',       model: 'DeepBlue 4.0',  watt: 550, price: 165 },
    { brand: 'Trina Solar',    model: 'Vertex S+',      watt: 510, price: 155 },
    { brand: 'Canadian Solar', model: 'HiHero',         watt: 445, price: 140 },
    { brand: 'Jinko Solar',    model: 'Tiger Neo',      watt: 585, price: 190 },
    { brand: 'REC',            model: 'Alpha Pure-R',   watt: 430, price: 210 },
    { brand: 'SunPower',       model: 'Maxeon 7',       watt: 440, price: 280 },
    { brand: 'Q CELLS',        model: 'Q.TRON BLK',    watt: 420, price: 175 },
    { brand: 'Risen Energy',   model: 'Titan S',        watt: 505, price: 148 },
    { brand: 'Hyundai',        model: 'HiE-S485VG',    watt: 485, price: 195 },
  ];

  // ─── Default skeleton — Roofs only ───
  function getDefaultTree() {
    return {
      id: 'roofs', icon: '', label: 'My House', open: true, type: 'root',
      children: []
    };
  }

  function createRoofNode(roof, index) {
    const roofColors = ['🔴', '🟢', '🔵', '🟡', '🟣', '🩵'];
    const color = roofColors[index % roofColors.length];
    const fmt = (v, unit, dec) => v != null ? v.toFixed(dec) + unit : '—';

    return {
      id: `roof-${index}`, icon: color, label: `Roof_${index + 1}`, open: true, type: 'feature',
      children: [
        {
          id: `panels-${index}`, icon: '', label: 'Panels', open: false, type: 'folder',
          children: []
        },
        {
          id: `props-${index}`, icon: '', label: 'Properties', open: true, type: 'folder',
          children: [
            { id: `area-${index}`, icon: '', label: 'Area', value: fmt(roof.area_m2, ' m²', 1), type: 'param' },
            { id: `tilt-${index}`, icon: '', label: 'Tilt', value: fmt(roof.tilt_deg, '°', 1), type: 'param' },
            { id: `azimuth-${index}`, icon: '', label: 'Azimuth', value: fmt(roof.azimuth_deg, '°', 0), type: 'param' },
            { id: `usable-${index}`, icon: '', label: 'Usable Area', value: fmt(roof.usable_area_m2, ' m²', 1), type: 'param' }
          ]
        }
      ]
    };
  }

  // ─── Context menu definitions per node type ───
  const CONTEXT_MENUS = {
    root:     [{ action: 'expand-all', label: 'Expand All' }, { action: 'collapse-all', label: 'Collapse All' }],
    folder:   [{ action: 'expand-all', label: 'Expand All' }, { action: 'collapse-all', label: 'Collapse All' }],
    feature:  [{ action: 'add-panel', label: '⊞ Add Panel' }],
    param:    [{ action: 'copy-value', label: 'Copy Value' }],
    data:     [{ action: 'copy-value', label: 'Copy Value' }]
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
        render();
      });
    }
    row.appendChild(arrow);

    // Icon (only roof color circles)
    if (node.icon) {
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
    if (hasChildren && node.type === 'root') {
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
      if (hasChildren) { node.open = !node.open; render(); }
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
        showPanelBrowser(node.id);
        break;
      case 'select-3d': case 'hide': case 'show':
        if (onContextActionCallback) onContextActionCallback(action, node);
        break;
    }
  }

  function setOpenRecursive(node, open) {
    if (node.children) { node.open = open; node.children.forEach(c => setOpenRecursive(c, open)); }
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
      if (selectedId) { const n = findNode(treeData, selectedId); if (n && n.children && n.open) { n.open = false; render(); } }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedId) { const n = findNode(treeData, selectedId); if (n && n.children) { n.open = !n.open; render(); } }
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
  }

  function updateRoofs(roofs) {
    if (!treeData) return;
    treeData.children = (roofs || []).map((r, i) => createRoofNode(r, i));
    treeData.open = true;
    if (treeData.children.length > 0) treeData.children[0].open = true;
    render();
  }

  function updatePanels(roofIndex, panels) {
    if (!treeData) return;
    const panelsNode = findNode(treeData, `panels-${roofIndex}`);
    if (!panelsNode) return;
    panelsNode.children = (panels || []).map((p, i) => ({
      id: `panel-${roofIndex}-${i}`, icon: '', type: 'data',
      label: p.label || `Panel_${p.type || '60cell'}_${String(i + 1).padStart(3, '0')}`,
      value: null
    }));
    panelsNode.open = panelsNode.children.length > 0;
    render();
  }

  // ─── Panel Browser ───
  function showPanelBrowser(roofId) {
    panelBrowserRoofId = roofId;
    const panel = treeRoot?.closest('.project-tree-panel');
    if (!panel) return;

    // Create browser container if needed
    if (!panelBrowserEl) {
      panelBrowserEl = document.createElement('div');
      panelBrowserEl.className = 'panel-browser';
      panel.insertBefore(panelBrowserEl, panel.querySelector('.ptree-status-bar'));
    }

    // Hide tree body, show browser
    if (treeRoot) treeRoot.style.display = 'none';
    panelBrowserEl.style.display = 'flex';

    renderPanelBrowser('');
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
    updateStatusBar(selectedId);
  }

  function renderPanelBrowser(filterText) {
    if (!panelBrowserEl) return;
    const ft = (filterText || '').toLowerCase();
    const filtered = DEMO_PANELS.filter(p =>
      !ft || p.brand.toLowerCase().includes(ft) || p.model.toLowerCase().includes(ft) || String(p.watt).includes(ft)
    );

    const roofNode = panelBrowserRoofId ? findNode(treeData, panelBrowserRoofId) : null;
    const roofLabel = roofNode ? roofNode.label : 'Roof';

    panelBrowserEl.innerHTML = `
      <div class="pb-header">
        <button class="pb-back-btn" title="Back to tree">← Back</button>
        <span class="pb-title">Add Panel — ${roofLabel}</span>
      </div>
      <div class="pb-search-wrap">
        <input type="text" class="pb-search" placeholder="Search brand, model, watt..." value="${filterText || ''}" autocomplete="off" spellcheck="false">
      </div>
      <div class="pb-list">
        ${filtered.map((p, i) => `
          <div class="pb-card" data-idx="${i}" data-brand="${p.brand}" data-model="${p.model}" data-watt="${p.watt}" data-price="${p.price}">
            <div class="pb-card-top">
              <span class="pb-brand">${p.brand}</span>
              <span class="pb-price">$${p.price}</span>
            </div>
            <div class="pb-model">${p.model}</div>
            <div class="pb-card-bottom">
              <span class="pb-watt">${p.watt}W</span>
              <span class="pb-eff">${(p.watt / 21.5).toFixed(1)}% eff</span>
            </div>
          </div>
        `).join('')}
        ${filtered.length === 0 ? '<div class="pb-empty">No panels found</div>' : ''}
      </div>
    `;

    // Wire back button
    panelBrowserEl.querySelector('.pb-back-btn').addEventListener('click', hidePanelBrowser);

    // Wire search
    const searchInput = panelBrowserEl.querySelector('.pb-search');
    let debounce = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderPanelBrowser(searchInput.value), 150);
    });
    searchInput.focus();

    // Wire card clicks
    panelBrowserEl.querySelectorAll('.pb-card').forEach(card => {
      card.addEventListener('click', () => {
        const brand = card.dataset.brand;
        const model = card.dataset.model;
        const watt = card.dataset.watt;
        const price = card.dataset.price;

        // Add to tree under Panels folder
        if (panelBrowserRoofId) {
          const roofIdx = panelBrowserRoofId.replace('roof-', '');
          const panelsNode = findNode(treeData, `panels-${roofIdx}`);
          if (panelsNode) {
            const n = panelsNode.children.length;
            panelsNode.children.push({
              id: `panel-${roofIdx}-${n}`, icon: '', type: 'data',
              label: `${brand} ${model}`,
              value: `${watt}W · $${price}`
            });
            panelsNode.open = true;
            // Open parent roof too
            const roofNode = findNode(treeData, panelBrowserRoofId);
            if (roofNode) roofNode.open = true;
          }
        }

        hidePanelBrowser();
        render();

        if (onContextActionCallback) {
          onContextActionCallback('panel-selected', {
            roofId: panelBrowserRoofId,
            brand, model, watt: Number(watt), price: Number(price)
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
    set onSelect(fn) { onSelectCallback = fn; },
    set onContextAction(fn) { onContextActionCallback = fn; },
    findNode: (id) => treeData ? findNode(treeData, id) : null,
    get data() { return treeData; }
  };
})();

window.ProjectTree = ProjectTree;
