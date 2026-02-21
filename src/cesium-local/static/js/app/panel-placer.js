/**
 * PanelPlacer — SolidWorks-style solar panel placement
 *
 * States: IDLE → SELECT_PLANE → SKETCH_MODE
 *  - IDLE: normal 3D orbit
 *  - SELECT_PLANE: hover highlights roof faces, click selects one
 *  - SKETCH_MODE: camera locked to face normal (2D), pan+zoom only,
 *                 place panels, undo/redo, finish/cancel
 */

const PlacerState = { IDLE: 0, SELECT_PLANE: 1, SKETCH: 2 };

class PanelPlacer {
  constructor(viewer) {
    this.viewer = viewer;
    this.state = PlacerState.IDLE;

    // Panel models cache: key → template scene
    this.panelModels = {};
    this.activeModelKey = null;
    this.loaderClass = null;

    // Roof
    this.roofMeshes = [];
    this.selectedFace = null;       // { mesh, faceIndex, normal, center, vertices }
    this.faceHighlight = null;      // THREE.Mesh overlay for selected face
    this.hoverHighlight = null;     // THREE.Mesh overlay for hovered face

    // Panels placed in current sketch session
    this.sessionPanels = [];
    // Panels confirmed (from previous sessions)
    this.confirmedPanels = [];

    // Undo / redo
    this.undoStack = [];
    this.redoStack = [];

    // Ghost
    this.ghostPanel = null;
    this.isDragging = false;

    // Camera state before sketch
    this._savedCamera = null;

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Bindings
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // UI callbacks (set by wiring code)
    this.onStateChange = null;
  }

  // ──────────────── INIT ────────────────

  init() {
    this._cacheRoofMeshes();
    const c = this.viewer.renderer.domElement;
    c.addEventListener('mousemove', this._onMouseMove);
    c.addEventListener('mousedown', this._onMouseDown);
    c.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);
  }

  setLoaderClass(cls) { this.loaderClass = cls; }

  _cacheRoofMeshes() {
    this.roofMeshes = [];
    this.viewer.scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry &&
          !obj.name.includes('scatter') &&
          !obj.name.includes('solar-panel') &&
          !obj.name.includes('face-highlight') &&
          !obj.name.includes('model-axes')) {
        this.roofMeshes.push(obj);
      }
    });
  }

  // ──────────────── MODEL LOADING ────────────────

  async loadPanelModel(key, url) {
    if (this.panelModels[key]) return this.panelModels[key];
    if (!this.loaderClass) throw new Error('No GLTFLoader set');

    return new Promise((resolve, reject) => {
      const loader = new this.loaderClass();
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const targetSize = 0.4;
        model.scale.setScalar(targetSize / maxDim);
        model.updateMatrixWorld(true);

        this.panelModels[key] = model;
        console.log('[PanelPlacer] Loaded model:', key);
        resolve(model);
      }, undefined, reject);
    });
  }

  setActiveModel(key) {
    if (!this.panelModels[key]) {
      console.warn('[PanelPlacer] Model not loaded:', key);
      return false;
    }
    this.activeModelKey = key;
    // If in sketch mode and dragging, restart ghost with new model
    if (this.state === PlacerState.SKETCH && this.isDragging) {
      this._cancelGhost();
      this._startGhost();
    }
    return true;
  }

  // ──────────────── STATE MACHINE ────────────────

  enterSelectPlane() {
    if (this.state === PlacerState.SKETCH) return;
    this._cacheRoofMeshes();
    this.state = PlacerState.SELECT_PLANE;
    this.viewer.renderer.domElement.style.cursor = 'crosshair';
    this._fireStateChange();
  }

  exitSelectPlane() {
    this.state = PlacerState.IDLE;
    this._removeHoverHighlight();
    this.viewer.renderer.domElement.style.cursor = 'default';
    this._fireStateChange();
  }

  enterSketchMode(faceData) {
    this.selectedFace = faceData;
    this.state = PlacerState.SKETCH;
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];

    this._removeHoverHighlight();
    this._showFaceHighlight(faceData);

    // Save camera
    this._savedCamera = {
      position: this.viewer.camera.position.clone(),
      target: this.viewer.controls.target.clone(),
      enableRotate: this.viewer.controls.enableRotate
    };

    // Animate camera to look straight down at the face
    this._snapCameraToFace(faceData);

    // Lock orbit rotation, allow pan + zoom
    this.viewer.controls.enableRotate = false;

    this.viewer.renderer.domElement.style.cursor = 'default';
    this._fireStateChange();
  }

  finishSketch() {
    if (this.state !== PlacerState.SKETCH) return;

    // Confirm all session panels
    this.confirmedPanels.push(...this.sessionPanels);
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];

    this._exitSketchCommon();
  }

  cancelSketch() {
    if (this.state !== PlacerState.SKETCH) return;

    // Remove all session panels
    this.sessionPanels.forEach(p => this._removePanel(p));
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];

    this._exitSketchCommon();
  }

  _exitSketchCommon() {
    this._cancelGhost();
    this._removeFaceHighlight();
    this.selectedFace = null;

    // Restore camera
    if (this._savedCamera) {
      this.viewer.controls.enableRotate = this._savedCamera.enableRotate;
      this.viewer.camera.position.copy(this._savedCamera.position);
      this.viewer.controls.target.copy(this._savedCamera.target);
      this.viewer.controls.update();
      this._savedCamera = null;
    }

    this.state = PlacerState.IDLE;
    this.viewer.renderer.domElement.style.cursor = 'default';
    this._fireStateChange();
  }

  _fireStateChange() {
    if (this.onStateChange) this.onStateChange(this.state);
  }

  // ──────────────── CAMERA ────────────────

  _snapCameraToFace(faceData) {
    const { center, normal } = faceData;
    const dist = 4;
    const target = center.clone();
    const camPos = center.clone().add(normal.clone().multiplyScalar(dist));

    // Smooth transition
    const startPos = this.viewer.camera.position.clone();
    const startTarget = this.viewer.controls.target.clone();
    const duration = 500;
    const start = performance.now();

    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      this.viewer.camera.position.lerpVectors(startPos, camPos, ease);
      this.viewer.controls.target.lerpVectors(startTarget, target, ease);
      this.viewer.controls.update();

      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  // ──────────────── FACE HIGHLIGHT ────────────────

  _getFaceData(hit) {
    if (!hit || !hit.face) return null;

    const mesh = hit.object;
    const geo = mesh.geometry;
    const idx = hit.faceIndex;
    const posAttr = geo.attributes.position;
    const index = geo.index;

    // Get triangle vertex indices
    let i0, i1, i2;
    if (index) {
      i0 = index.getX(idx * 3);
      i1 = index.getX(idx * 3 + 1);
      i2 = index.getX(idx * 3 + 2);
    } else {
      i0 = idx * 3;
      i1 = idx * 3 + 1;
      i2 = idx * 3 + 2;
    }

    const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
    const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(mesh.matrixWorld);
    const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(mesh.matrixWorld);

    // Face normal in world space
    const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();

    // Find all coplanar triangles (same normal ± tolerance) to form the full face
    const coplanarVerts = this._findCoplanarFace(mesh, idx, normal, 0.15);

    const center = new THREE.Vector3();
    coplanarVerts.forEach(v => center.add(v));
    center.divideScalar(coplanarVerts.length || 1);

    return {
      mesh, faceIndex: idx, normal, center,
      vertices: [v0, v1, v2],
      coplanarVerts
    };
  }

  _findCoplanarFace(mesh, startFaceIdx, worldNormal, angleTol) {
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    const index = geo.index;
    const faceCount = index ? index.count / 3 : posAttr.count / 3;

    const coplanarVerts = [];
    const refNormal = worldNormal.clone();

    for (let f = 0; f < faceCount; f++) {
      let i0, i1, i2;
      if (index) {
        i0 = index.getX(f * 3);
        i1 = index.getX(f * 3 + 1);
        i2 = index.getX(f * 3 + 2);
      } else {
        i0 = f * 3;
        i1 = f * 3 + 1;
        i2 = f * 3 + 2;
      }

      const a = new THREE.Vector3().fromBufferAttribute(posAttr, i0);
      const b = new THREE.Vector3().fromBufferAttribute(posAttr, i1);
      const c = new THREE.Vector3().fromBufferAttribute(posAttr, i2);

      // Face normal in local space
      const edge1 = new THREE.Vector3().subVectors(b, a);
      const edge2 = new THREE.Vector3().subVectors(c, a);
      const localNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
      const wNormal = localNormal.transformDirection(mesh.matrixWorld).normalize();

      if (wNormal.dot(refNormal) > (1 - angleTol)) {
        coplanarVerts.push(
          a.clone().applyMatrix4(mesh.matrixWorld),
          b.clone().applyMatrix4(mesh.matrixWorld),
          c.clone().applyMatrix4(mesh.matrixWorld)
        );
      }
    }

    return coplanarVerts;
  }

  _showFaceHighlight(faceData) {
    this._removeFaceHighlight();
    if (!faceData || !faceData.coplanarVerts.length) return;

    const verts = faceData.coplanarVerts;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      positions[i * 3] = verts[i].x;
      positions[i * 3 + 1] = verts[i].y;
      positions[i * 3 + 2] = verts[i].z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });

    this.faceHighlight = new THREE.Mesh(geo, mat);
    this.faceHighlight.name = 'face-highlight-selected';
    this.faceHighlight.renderOrder = 998;
    this.viewer.scene.add(this.faceHighlight);
  }

  _showHoverHighlight(faceData) {
    this._removeHoverHighlight();
    if (!faceData || !faceData.coplanarVerts.length) return;

    const verts = faceData.coplanarVerts;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
      positions[i * 3] = verts[i].x;
      positions[i * 3 + 1] = verts[i].y;
      positions[i * 3 + 2] = verts[i].z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    });

    this.hoverHighlight = new THREE.Mesh(geo, mat);
    this.hoverHighlight.name = 'face-highlight-hover';
    this.hoverHighlight.renderOrder = 997;
    this.viewer.scene.add(this.hoverHighlight);
  }

  _removeFaceHighlight() {
    if (this.faceHighlight) {
      this.viewer.scene.remove(this.faceHighlight);
      this.faceHighlight.geometry.dispose();
      this.faceHighlight.material.dispose();
      this.faceHighlight = null;
    }
  }

  _removeHoverHighlight() {
    if (this.hoverHighlight) {
      this.viewer.scene.remove(this.hoverHighlight);
      this.hoverHighlight.geometry.dispose();
      this.hoverHighlight.material.dispose();
      this.hoverHighlight = null;
    }
  }

  // ──────────────── PANEL PLACEMENT ────────────────

  startInstall() {
    if (this.state !== PlacerState.SKETCH) return;
    if (!this.activeModelKey || !this.panelModels[this.activeModelKey]) {
      console.warn('[PanelPlacer] No panel model selected');
      return;
    }
    this._startGhost();
  }

  _startGhost() {
    this._cancelGhost();
    const template = this.panelModels[this.activeModelKey];
    if (!template) return;

    this.ghostPanel = template.clone();
    this.ghostPanel.name = 'solar-panel-ghost';
    this.ghostPanel.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.transparent = true;
        child.material.opacity = 0.5;
        child.material.depthWrite = false;
      }
    });
    this.ghostPanel.visible = false;
    this.viewer.scene.add(this.ghostPanel);
    this.isDragging = true;
    this.viewer.renderer.domElement.style.cursor = 'crosshair';
  }

  _cancelGhost() {
    if (this.ghostPanel) {
      this.viewer.scene.remove(this.ghostPanel);
      this.ghostPanel.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
      this.ghostPanel = null;
    }
    this.isDragging = false;
    if (this.state === PlacerState.SKETCH) {
      this.viewer.renderer.domElement.style.cursor = 'default';
    }
  }

  _placePanel(hit) {
    if (!this.activeModelKey || !this.panelModels[this.activeModelKey]) return;

    const template = this.panelModels[this.activeModelKey];
    const panel = template.clone();
    const id = this.confirmedPanels.length + this.sessionPanels.length;
    panel.name = `solar-panel-${id}`;
    panel.traverse((child) => {
      if (child.isMesh) child.material = child.material.clone();
    });

    this._positionOnFace(panel, hit);
    this.viewer.scene.add(panel);
    this.sessionPanels.push(panel);

    // Push to undo stack
    this.undoStack.push({ action: 'place', panel });
    this.redoStack = [];

    console.log('[PanelPlacer] Placed panel', panel.name);
  }

  _positionOnFace(panel, hit) {
    panel.position.copy(hit.point);

    // Align to selected face normal
    const normal = this.selectedFace ? this.selectedFace.normal.clone() : new THREE.Vector3(0, 1, 0);
    if (hit.face) {
      const hitNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if (hitNormal.dot(normal) > 0.8) {
        // Use the selected face's consistent normal
      }
    }

    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    panel.quaternion.copy(quat);

    // Offset slightly above surface
    panel.position.addScaledVector(normal, 0.015);
  }

  // ──────────────── UNDO / REDO ────────────────

  undo() {
    if (this.state !== PlacerState.SKETCH || !this.undoStack.length) return;
    const entry = this.undoStack.pop();

    if (entry.action === 'place') {
      this.viewer.scene.remove(entry.panel);
      const idx = this.sessionPanels.indexOf(entry.panel);
      if (idx >= 0) this.sessionPanels.splice(idx, 1);
      this.redoStack.push(entry);
    }
  }

  redo() {
    if (this.state !== PlacerState.SKETCH || !this.redoStack.length) return;
    const entry = this.redoStack.pop();

    if (entry.action === 'place') {
      this.viewer.scene.add(entry.panel);
      this.sessionPanels.push(entry.panel);
      this.undoStack.push(entry);
    }
  }

  // ──────────────── RAYCAST HELPERS ────────────────

  _updateMouse(event) {
    const canvas = this.viewer.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _raycastRoof(event) {
    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
    if (!this.roofMeshes.length) this._cacheRoofMeshes();
    const hits = this.raycaster.intersectObjects(this.roofMeshes, true);
    return hits.length > 0 ? hits[0] : null;
  }

  _raycastSelectedFace(event) {
    if (!this.faceHighlight) return this._raycastRoof(event);
    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
    // Cast against the highlight mesh (covers the selected face area)
    const hits = this.raycaster.intersectObject(this.faceHighlight, false);
    if (hits.length > 0) {
      // Use the face highlight hit but return with face normal from selectedFace
      return hits[0];
    }
    // Fallback: cast against roof and check if hit is coplanar
    return null;
  }

  // ──────────────── EVENT HANDLERS ────────────────

  _onMouseMove(event) {
    // SELECT_PLANE: hover highlight
    if (this.state === PlacerState.SELECT_PLANE) {
      const hit = this._raycastRoof(event);
      if (hit && hit.face) {
        const faceData = this._getFaceData(hit);
        this._showHoverHighlight(faceData);
        this.viewer.renderer.domElement.style.cursor = 'pointer';
      } else {
        this._removeHoverHighlight();
        this.viewer.renderer.domElement.style.cursor = 'crosshair';
      }
      return;
    }

    // SKETCH: ghost follows mouse on selected face
    if (this.state === PlacerState.SKETCH && this.isDragging && this.ghostPanel) {
      const hit = this._raycastSelectedFace(event);
      if (hit) {
        this.ghostPanel.visible = true;
        this._positionOnFace(this.ghostPanel, hit);
      } else {
        this.ghostPanel.visible = false;
      }
    }
  }

  _onMouseDown(event) {
    if (event.button !== 0) return;

    // SELECT_PLANE: pick face
    if (this.state === PlacerState.SELECT_PLANE) {
      const hit = this._raycastRoof(event);
      if (hit && hit.face) {
        const faceData = this._getFaceData(hit);
        if (faceData) {
          this.enterSketchMode(faceData);
        }
      }
      return;
    }

    // SKETCH: place panel
    if (this.state === PlacerState.SKETCH && this.isDragging) {
      const hit = this._raycastSelectedFace(event);
      if (hit) {
        this._placePanel(hit);
        // Keep ghost for next placement
        this._startGhost();
      }
    }
  }

  _onMouseUp(event) {
    // Nothing needed for now
  }

  _onKeyDown(event) {
    if (this.state === PlacerState.SKETCH) {
      if (event.key === 'Escape') {
        if (this.isDragging) {
          this._cancelGhost();
        } else {
          this.cancelSketch();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        if (event.shiftKey) this.redo();
        else this.undo();
        return;
      }
    }
    if (this.state === PlacerState.SELECT_PLANE && event.key === 'Escape') {
      this.exitSelectPlane();
    }
  }

  // ──────────────── CLEANUP ────────────────

  _removePanel(panel) {
    this.viewer.scene.remove(panel);
    panel.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
        else c.material.dispose();
      }
    });
  }

  clearAll() {
    [...this.confirmedPanels, ...this.sessionPanels].forEach(p => this._removePanel(p));
    this.confirmedPanels = [];
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];
    this._cancelGhost();
    this._removeFaceHighlight();
    this._removeHoverHighlight();
  }

  destroy() {
    this.clearAll();
    const c = this.viewer.renderer.domElement;
    c.removeEventListener('mousemove', this._onMouseMove);
    c.removeEventListener('mousedown', this._onMouseDown);
    c.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);
  }
}

window.PanelPlacer = PanelPlacer;
window.PlacerState = PlacerState;
