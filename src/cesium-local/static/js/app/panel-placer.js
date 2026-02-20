/**
 * PanelPlacer - Drag-and-drop solar panel placement on 3D roof
 *
 * Usage:
 *   const placer = new PanelPlacer(splitViewer);
 *   placer.init();
 *
 * Requires: THREE (global), GLTFLoader (from module scope — passed via init)
 */

class PanelPlacer {
  constructor(viewer) {
    this.viewer = viewer;       // { scene, camera, renderer, controls, modelRoot }
    this.panelTemplate = null;  // Loaded panel GLB template
    this.panels = [];           // Placed panel instances
    this.ghostPanel = null;     // Panel following mouse during drag
    this.isDragging = false;
    this.isLocked = false;      // When true, orbit is disabled and panels can be adjusted
    this.selectedPanel = null;  // Panel being repositioned
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.roofMeshes = [];       // Cached roof meshes for ray-casting
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /**
   * Load the solar panel GLB template (call once)
   */
  async loadPanelModel(loaderClass) {
    return new Promise((resolve, reject) => {
      const loader = new loaderClass();
      loader.load('/static/models/solar_panel.glb', (gltf) => {
        this.panelTemplate = gltf.scene;

        // Normalize: center and scale to ~1m x ~1.7m (standard panel)
        const box = new THREE.Box3().setFromObject(this.panelTemplate);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        this.panelTemplate.position.sub(center);

        // Scale so longest side ≈ 0.4 units (matching roof model scale)
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const targetSize = 0.4;
        this.panelTemplate.scale.setScalar(targetSize / maxDim);
        this.panelTemplate.updateMatrixWorld(true);

        // Store template size for snapping
        const scaledBox = new THREE.Box3().setFromObject(this.panelTemplate);
        this.panelSize = scaledBox.getSize(new THREE.Vector3());

        console.log('[PanelPlacer] Panel loaded, size:', this.panelSize);
        resolve(this.panelTemplate);
      }, undefined, (err) => {
        console.error('[PanelPlacer] Failed to load panel GLB:', err);
        reject(err);
      });
    });
  }

  /**
   * Initialize event listeners
   */
  init() {
    this._cacheRoofMeshes();
    const canvas = this.viewer.renderer.domElement;
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Cache roof meshes for raycasting (exclude scatter points and panels)
   */
  _cacheRoofMeshes() {
    this.roofMeshes = [];
    this.viewer.scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry &&
          !obj.name.includes('scatter') &&
          !obj.name.includes('solar-panel')) {
        this.roofMeshes.push(obj);
      }
    });
  }

  /**
   * Start a drag from the palette button
   */
  startDrag() {
    if (!this.panelTemplate) {
      console.warn('[PanelPlacer] Panel model not loaded');
      return;
    }

    // Create ghost (semi-transparent clone)
    this.ghostPanel = this.panelTemplate.clone();
    this.ghostPanel.name = 'solar-panel-ghost';
    this.ghostPanel.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.6;
        child.material.depthWrite = false;
      }
    });
    this.ghostPanel.visible = false;
    this.viewer.scene.add(this.ghostPanel);

    this.isDragging = true;
    this.viewer.renderer.domElement.style.cursor = 'grabbing';
  }

  /**
   * Raycast from mouse onto roof surface
   */
  _raycastRoof(event) {
    const canvas = this.viewer.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);

    // Refresh roof meshes in case model reloaded
    if (!this.roofMeshes.length) this._cacheRoofMeshes();

    const intersects = this.raycaster.intersectObjects(this.roofMeshes, true);
    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * Raycast onto placed panels
   */
  _raycastPanels(event) {
    const canvas = this.viewer.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);

    const panelMeshes = [];
    this.panels.forEach(p => {
      p.traverse((child) => {
        if (child.isMesh) panelMeshes.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(panelMeshes, true);
    if (intersects.length > 0) {
      // Find the panel group ancestor
      let obj = intersects[0].object;
      while (obj && !obj.name.startsWith('solar-panel-')) {
        obj = obj.parent;
      }
      return obj;
    }
    return null;
  }

  /**
   * Position a panel on a roof hit point, aligned to the surface
   */
  _positionOnRoof(panel, hit) {
    panel.position.copy(hit.point);

    // Align panel to roof surface normal
    if (hit.face) {
      const normal = hit.face.normal.clone();
      normal.transformDirection(hit.object.matrixWorld);

      // Orient panel so its "up" aligns with the roof normal
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
      panel.quaternion.copy(quat);
    }

    // Small offset above surface to prevent z-fighting
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    panel.position.addScaledVector(normal, 0.02);
  }

  _onMouseMove(event) {
    // Dragging a new panel from palette
    if (this.isDragging && this.ghostPanel) {
      const hit = this._raycastRoof(event);
      if (hit) {
        this.ghostPanel.visible = true;
        this._positionOnRoof(this.ghostPanel, hit);
      } else {
        this.ghostPanel.visible = false;
      }
      return;
    }

    // Repositioning an existing panel (locked mode)
    if (this.isLocked && this.selectedPanel) {
      const hit = this._raycastRoof(event);
      if (hit) {
        this._positionOnRoof(this.selectedPanel, hit);
      }
      return;
    }

    // Hover highlight (locked mode)
    if (this.isLocked && !this.selectedPanel) {
      const canvas = this.viewer.renderer.domElement;
      const panel = this._raycastPanels(event);
      canvas.style.cursor = panel ? 'grab' : 'default';
    }
  }

  _onMouseDown(event) {
    if (event.button !== 0) return; // Left click only

    // Placing a new panel
    if (this.isDragging && this.ghostPanel) {
      const hit = this._raycastRoof(event);
      if (hit) {
        this._placePanel(hit);
      }
      return;
    }

    // Picking up an existing panel to reposition (locked mode)
    if (this.isLocked) {
      const panel = this._raycastPanels(event);
      if (panel) {
        this.selectedPanel = panel;
        this.viewer.renderer.domElement.style.cursor = 'grabbing';
        event.stopPropagation();
      }
    }
  }

  _onMouseUp(event) {
    if (event.button !== 0) return;

    // Drop repositioned panel
    if (this.selectedPanel) {
      this.selectedPanel = null;
      this.viewer.renderer.domElement.style.cursor = 'default';
    }
  }

  _onKeyDown(event) {
    // Delete selected panel or last placed panel
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.isLocked && this.panels.length > 0) {
        const panel = this.panels.pop();
        this.viewer.scene.remove(panel);
        panel.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
          }
        });
        console.log('[PanelPlacer] Removed last panel, remaining:', this.panels.length);
      }
    }

    // Escape cancels drag
    if (event.key === 'Escape' && this.isDragging) {
      this.cancelDrag();
    }
  }

  /**
   * Place panel at hit point
   */
  _placePanel(hit) {
    // Remove ghost
    if (this.ghostPanel) {
      this.viewer.scene.remove(this.ghostPanel);
      this.ghostPanel = null;
    }

    // Create real panel
    const panel = this.panelTemplate.clone();
    panel.name = `solar-panel-${this.panels.length}`;
    panel.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
      }
    });

    this._positionOnRoof(panel, hit);
    this.viewer.scene.add(panel);
    this.panels.push(panel);

    console.log('[PanelPlacer] Panel placed, total:', this.panels.length);

    // Continue dragging (user can place multiple panels)
    this.startDrag();
  }

  /**
   * Cancel current drag
   */
  cancelDrag() {
    if (this.ghostPanel) {
      this.viewer.scene.remove(this.ghostPanel);
      this.ghostPanel = null;
    }
    this.isDragging = false;
    this.viewer.renderer.domElement.style.cursor = 'default';
  }

  /**
   * Toggle lock mode (disables orbit, enables panel adjustment)
   */
  toggleLock() {
    this.isLocked = !this.isLocked;
    this.viewer.controls.enabled = !this.isLocked;

    if (!this.isLocked) {
      this.selectedPanel = null;
      this.viewer.renderer.domElement.style.cursor = 'default';
    }

    console.log('[PanelPlacer] Lock mode:', this.isLocked ? 'ON' : 'OFF');
    return this.isLocked;
  }

  /**
   * Remove all panels
   */
  clearAll() {
    this.panels.forEach(p => {
      this.viewer.scene.remove(p);
      p.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    });
    this.panels = [];
    this.cancelDrag();
    console.log('[PanelPlacer] All panels cleared');
  }

  destroy() {
    this.clearAll();
    const canvas = this.viewer.renderer.domElement;
    canvas.removeEventListener('mousemove', this._onMouseMove);
    canvas.removeEventListener('mousedown', this._onMouseDown);
    canvas.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);
  }
}

window.PanelPlacer = PanelPlacer;
