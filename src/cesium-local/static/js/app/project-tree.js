/**
 * Project Tree - SolidWorks-style FeatureManager Design Tree
 * Renders hierarchical project structure in collapsible tree panel
 */

const ProjectTree = (function () {
  let treeRoot = null;
  let treeData = null;

  // Default skeleton structure
  function getDefaultTree() {
    return {
      id: 'project', icon: '🌍', label: 'Project', open: true,
      children: [
        {
          id: 'house', icon: '🏠', label: 'House', open: true,
          children: [
            {
              id: 'roofs', icon: '📐', label: 'Roofs', open: true,
              children: [] // populated dynamically
            },
            {
              id: 'electrical', icon: '🔌', label: 'Electrical System', open: false,
              children: [
                { id: 'inverter', icon: '', label: 'Inverter', value: '—' },
                { id: 'battery', icon: '', label: 'Battery', value: '—' },
                { id: 'grid-mode', icon: '', label: 'Grid Mode', value: '—' }
              ]
            },
            {
              id: 'roi', icon: '📈', label: 'ROI', open: false,
              children: [
                { id: 'production', icon: '', label: 'Production', value: '—' },
                { id: 'savings', icon: '', label: 'Savings', value: '—' },
                { id: 'payback', icon: '', label: 'Payback', value: '—' }
              ]
            }
          ]
        },
        {
          id: 'surroundings', icon: '🏢', label: 'Surroundings', open: false,
          children: [
            { id: 'tileset-3d', icon: '', label: '3D Tileset', value: 'Google Photorealistic' },
            { id: 'visibility', icon: '', label: 'Visibility', value: 'On' }
          ]
        },
        {
          id: 'environment', icon: '🌞', label: 'Environment', open: false,
          children: [
            { id: 'datetime', icon: '', label: 'DateTime', value: '—' },
            { id: 'sun-position', icon: '', label: 'Sun Position', value: '—' }
          ]
        }
      ]
    };
  }

  function createRoofNode(roof, index) {
    const roofColors = ['🔴', '🟢', '🔵', '🟡', '🟣', '🩵'];
    const color = roofColors[index % roofColors.length];
    const tilt = roof.tilt_deg != null ? roof.tilt_deg.toFixed(1) + '°' : '—';
    const azimuth = roof.azimuth_deg != null ? roof.azimuth_deg.toFixed(0) + '°' : '—';
    const area = roof.area_m2 != null ? roof.area_m2.toFixed(1) + ' m²' : '—';
    const usable = roof.usable_area_m2 != null ? roof.usable_area_m2.toFixed(1) + ' m²' : '—';

    return {
      id: `roof-${index}`, icon: color, label: `Roof_${index + 1}`, open: false,
      children: [
        {
          id: `panels-${index}`, icon: '🔆', label: 'Panels', open: false,
          children: [] // populated when panels placed
        },
        {
          id: `shading-${index}`, icon: '🌑', label: 'Shading', open: false,
          children: [
            { id: `sample-pts-${index}`, icon: '', label: 'SamplePoints', value: '—' },
            { id: `shadow-mesh-${index}`, icon: '', label: 'ShadowMesh', value: '—' }
          ]
        },
        {
          id: `props-${index}`, icon: '📊', label: 'Properties', open: true,
          children: [
            { id: `area-${index}`, icon: '', label: 'Area', value: area },
            { id: `tilt-${index}`, icon: '', label: 'Tilt', value: tilt },
            { id: `azimuth-${index}`, icon: '', label: 'Azimuth', value: azimuth },
            { id: `usable-${index}`, icon: '', label: 'Usable Area', value: usable }
          ]
        }
      ]
    };
  }

  function renderNode(node, depth) {
    const el = document.createElement('div');
    el.className = 'ptree-node';
    el.dataset.id = node.id;

    const row = document.createElement('div');
    row.className = 'ptree-row';
    row.style.paddingLeft = (depth * 16 + 6) + 'px';

    const hasChildren = node.children && node.children.length > 0;

    // Toggle arrow
    const arrow = document.createElement('span');
    arrow.className = 'ptree-arrow';
    if (hasChildren) {
      arrow.textContent = node.open ? '▾' : '▸';
      arrow.classList.add('clickable');
    } else {
      arrow.textContent = ' ';
    }
    row.appendChild(arrow);

    // Icon
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

    // Value (leaf nodes)
    if (node.value != null) {
      const val = document.createElement('span');
      val.className = 'ptree-value';
      val.textContent = node.value;
      row.appendChild(val);
    }

    // Count badge for container nodes
    if (hasChildren && (node.id.startsWith('roofs') || node.id.startsWith('panels'))) {
      const badge = document.createElement('span');
      badge.className = 'ptree-badge';
      badge.textContent = node.children.length;
      row.appendChild(badge);
    }

    el.appendChild(row);

    // Children container
    if (hasChildren) {
      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'ptree-children';
      if (!node.open) childrenWrap.style.display = 'none';
      node.children.forEach(child => {
        childrenWrap.appendChild(renderNode(child, depth + 1));
      });
      el.appendChild(childrenWrap);

      // Toggle click
      row.addEventListener('click', () => {
        node.open = !node.open;
        arrow.textContent = node.open ? '▾' : '▸';
        childrenWrap.style.display = node.open ? '' : 'none';
      });
      row.style.cursor = 'pointer';
    }

    return el;
  }

  function render() {
    if (!treeRoot) return;
    if (!treeData) treeData = getDefaultTree();
    treeRoot.innerHTML = '';
    treeRoot.appendChild(renderNode(treeData, 0));
  }

  // ─── Public API ───

  function init(containerEl) {
    treeRoot = containerEl;
    treeData = getDefaultTree();
    render();
  }

  function updateRoofs(roofs) {
    if (!treeData) return;
    const roofsNode = findNode(treeData, 'roofs');
    if (!roofsNode) return;
    roofsNode.children = (roofs || []).map((r, i) => createRoofNode(r, i));
    roofsNode.open = true;
    // Auto-open first roof
    if (roofsNode.children.length > 0) roofsNode.children[0].open = true;
    render();
  }

  function updatePanels(roofIndex, panels) {
    if (!treeData) return;
    const panelsNode = findNode(treeData, `panels-${roofIndex}`);
    if (!panelsNode) return;
    panelsNode.children = (panels || []).map((p, i) => ({
      id: `panel-${roofIndex}-${i}`,
      icon: '',
      label: p.label || `Panel_${p.type || '60cell'}_${String(i + 1).padStart(3, '0')}`,
      value: null
    }));
    panelsNode.open = panelsNode.children.length > 0;
    render();
  }

  function updateShading(roofIndex, data) {
    if (!treeData) return;
    const sp = findNode(treeData, `sample-pts-${roofIndex}`);
    const sm = findNode(treeData, `shadow-mesh-${roofIndex}`);
    if (sp && data.samplePoints != null) sp.value = data.samplePoints + ' pts';
    if (sm && data.shadowMesh != null) sm.value = data.shadowMesh;
    render();
  }

  function updateEnvironment(data) {
    if (!treeData) return;
    if (data.dateTime) {
      const dt = findNode(treeData, 'datetime');
      if (dt) dt.value = data.dateTime;
    }
    if (data.sunPosition) {
      const sp = findNode(treeData, 'sun-position');
      if (sp) sp.value = data.sunPosition;
    }
    render();
  }

  function updateROI(data) {
    if (!treeData) return;
    if (data.production != null) {
      const n = findNode(treeData, 'production');
      if (n) n.value = data.production;
    }
    if (data.savings != null) {
      const n = findNode(treeData, 'savings');
      if (n) n.value = data.savings;
    }
    if (data.payback != null) {
      const n = findNode(treeData, 'payback');
      if (n) n.value = data.payback;
    }
    render();
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

  return { init, render, updateRoofs, updatePanels, updateShading, updateEnvironment, updateROI, findNode: (id) => treeData ? findNode(treeData, id) : null };
})();

// Expose globally
window.ProjectTree = ProjectTree;
