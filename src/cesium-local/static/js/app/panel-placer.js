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
    this.activeModelLabel = '';
    this.loaderClass = null;

    // Roof
    this.roofMeshes = [];
    this.selectedFace = null;       // { mesh, faceIndex, normal, center, vertices }
    this.faceHighlight = null;      // THREE.Mesh overlay for selected face
    this.hoverHighlight = null;     // THREE.Mesh overlay for hovered face
    this._sketchRoofIndex = null;

    // Panels placed in current sketch session
    this.sessionPanels = [];
    // Panels confirmed (from previous sessions)
    this.confirmedPanels = [];
    // Panel metadata: panel.name → { modelKey, modelLabel, roofIndex }
    this.panelMeta = new Map();

    // Undo / redo
    this.undoStack = [];
    this.redoStack = [];

    // Selected confirmed panel for edit (IDLE mode)
    this._editPanel = null;         // THREE.Object3D
    this._editOrigMaterials = [];   // save originals for unhighlight
    this._editDragging = false;
    this._editFaceNormal = null;    // THREE.Vector3 — roof face normal for move constraint
    this._editPlane = null;         // THREE.Plane — for drag projection

    // Ghost
    this.ghostPanel = null;
    this.isDragging = false;
    this._ghostRotationDeg = 0;   // cumulative rotation applied to ghost before placement

    // Camera state before sketch
    this._savedCamera = null;

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Cache for split roof meshes (single-mesh GLB fallback)
    this._splitRoofMeshes = null;
    this._splitRoofMeshesSourceUuid = null;

    // Bindings
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // UI callbacks (set by wiring code)
    this.onStateChange = null;
    this.onFinish = null;   // (placedPanels, roofIndex)
    this.onCancel = null;   // (roofIndex)
    this.onPanelSelected = null;   // (panelName)
    this.onPanelDeselected = null; // ()
    this.onPanelDeleted = null;    // (roofIndex)

    // 3D context menu element
    this._ctxMenu = null;

    // Transform gizmo (TransformControls) for "Move" mode
    this._gizmo = null;
    this._gizmoActive = false;
  }

  // ──────────────── INIT ────────────────

  init() {
    this._cacheRoofMeshes();
    const c = this.viewer.renderer.domElement;
    c.addEventListener('mousemove', this._onMouseMove);
    c.addEventListener('mousedown', this._onMouseDown);
    c.addEventListener('mouseup', this._onMouseUp);
    c.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('keydown', this._onKeyDown);
  }

  setLoaderClass(cls) { this.loaderClass = cls; }

  _cacheRoofMeshes() {
    this.roofMeshes = [];
    const root = this.viewer.modelRoot;
    if (root) {
      // Collect all descendant meshes named roof_N (skip axes, panels, highlights)
      root.traverse(obj => {
        if (obj.isMesh && obj.geometry &&
            !obj.userData._isSolarPanel &&
            !obj.name.includes('face-highlight') &&
            !obj.name.includes('model-axes')) {
          this.roofMeshes.push(obj);
        }
      });
    }
    if (this.roofMeshes.length === 0) {
      // Fallback: scan entire scene
      this.viewer.scene.traverse((obj) => {
        if (obj.isMesh && obj.geometry &&
            !obj.userData._isSolarPanel &&
            !obj.name.includes('face-highlight') &&
            !obj.name.includes('model-axes')) {
          this.roofMeshes.push(obj);
        }
      });
    }
    // Sort by roof index extracted from name (roof_0, roof_1, ...)
    this.roofMeshes.sort((a, b) => {
      const ai = parseInt(((a.name || '').match(/roof[_-](\d+)/i) || [])[1], 10);
      const bi = parseInt(((b.name || '').match(/roof[_-](\d+)/i) || [])[1], 10);
      if (isNaN(ai) && isNaN(bi)) return 0;
      if (isNaN(ai)) return 1;
      if (isNaN(bi)) return -1;
      return ai - bi;
    });
    console.log('[PanelPlacer] Cached roof meshes:', this.roofMeshes.length,
      this.roofMeshes.map((m, i) => `[${i}] ${m.name}`).join(', '));
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

  // ──────────────── AUTO-FACE ROOF ────────────────

  getRoofMeshByIndex(roofIndex) {
    this._cacheRoofMeshes();
    return this.roofMeshes[roofIndex] || null;
  }

  getBestFaceForMesh(mesh) {
    if (!mesh || !mesh.geometry) return null;
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    if (!posAttr || posAttr.count === 0) return null;

    const index = geo.index;
    const faceCount = index ? index.count / 3 : posAttr.count / 3;
    if (faceCount === 0) return null;

    const meshBox = new THREE.Box3().setFromObject(mesh);
    const meshCenter = meshBox.getCenter(new THREE.Vector3());
    const worldUp = new THREE.Vector3(0, 1, 0);

    let best = null;
    let bestScore = -Infinity;
    let bestArea = -Infinity;
    let bestAreaFace = null;

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

      const v0 = new THREE.Vector3().fromBufferAttribute(posAttr, i0).applyMatrix4(mesh.matrixWorld);
      const v1 = new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(mesh.matrixWorld);
      const v2 = new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(mesh.matrixWorld);

      const edge1 = new THREE.Vector3().subVectors(v1, v0);
      const edge2 = new THREE.Vector3().subVectors(v2, v0);
      const cross = new THREE.Vector3().crossVectors(edge1, edge2);
      const area = cross.length() * 0.5;
      if (!isFinite(area) || area <= 0) continue;

      const normal = cross.normalize();
      const triCenter = v0.clone().add(v1).add(v2).divideScalar(3);

      // Ensure normal points outward (away from mesh center)
      if (normal.dot(triCenter.clone().sub(meshCenter)) < 0) {
        normal.negate();
      }
      // Prefer upward-facing normals
      if (normal.dot(worldUp) < 0) {
        normal.negate();
      }

      const upDot = normal.dot(worldUp);
      const score = area * Math.max(0, upDot);

      if (area > bestArea) {
        bestArea = area;
        bestAreaFace = { faceIndex: f, normal: normal.clone(), center: triCenter, vertices: [v0, v1, v2] };
      }

      if (score > bestScore) {
        bestScore = score;
        best = { faceIndex: f, normal: normal.clone(), center: triCenter, vertices: [v0, v1, v2] };
      }
    }

    const chosen = best || bestAreaFace;
    if (!chosen) return null;

    const coplanarVerts = this._findCoplanarFace(mesh, chosen.faceIndex, chosen.normal, 0.12);
    const center = new THREE.Vector3();
    coplanarVerts.forEach(v => center.add(v));
    center.divideScalar(coplanarVerts.length || 1);

    return { mesh, faceIndex: chosen.faceIndex, normal: chosen.normal, center, vertices: chosen.vertices, coplanarVerts };
  }

  snapToRoof(roofIndex) {
    const mesh = this.getRoofMeshByIndex(roofIndex);
    if (!mesh) return null;
    const faceData = this.getBestFaceForMesh(mesh);
    if (faceData) this._snapCameraToFace(faceData);
    return faceData;
  }

  enterSketchForRoof(roofIndex) {
    if (this.state === PlacerState.SKETCH) {
      console.warn('[PanelPlacer] Already in SKETCH mode');
      return false;
    }
    this._sketchRoofIndex = roofIndex;
    this._cacheRoofMeshes();
    console.log('[PanelPlacer] Found', this.roofMeshes.length, 'roof meshes for sketch');
    const mesh = this.getRoofMeshByIndex(roofIndex);
    if (!mesh) {
      console.warn('[PanelPlacer] No mesh found for roof index', roofIndex, '— available:', this.roofMeshes.length);
      // Fallback: allow manual plane selection if model is a single merged mesh
      if (this.roofMeshes.length === 1) {
        this.enterSelectPlane();
        return true;
      }
      return false;
    }
    const faceData = this.getBestFaceForMesh(mesh);
    if (!faceData) {
      console.warn('[PanelPlacer] No face data for mesh');
      return false;
    }
    console.log('[PanelPlacer] Entering sketch for roof', roofIndex, 'center:', faceData.center);
    this.enterSketchMode(faceData);
    return true;
  }

  getPanelsForRoof(roofIndex) {
    const panels = [];
    for (const p of this.confirmedPanels) {
      const meta = this.panelMeta.get(p.name);
      if (meta && meta.roofIndex === roofIndex) {
        panels.push({ ...meta, panelName: p.name });
      }
    }
    return panels;
  }

  get sketchRoofIndex() { return this._sketchRoofIndex; }

  // ──────────────── STATE MACHINE ────────────────

  enterSelectPlane() {
    if (this.state === PlacerState.SKETCH) return;
    this.deselectPanel();
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
    this.deselectPanel();
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
    if (this.state !== PlacerState.SKETCH) return [];

    this.confirmedPanels.push(...this.sessionPanels);
    const placed = this.sessionPanels.map(p => ({
      name: p.name,
      ...(this.panelMeta.get(p.name) || {})
    }));
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];

    this._exitSketchCommon();
    if (this.onFinish) this.onFinish(placed, this._sketchRoofIndex);
    return placed;
  }

  cancelSketch() {
    if (this.state !== PlacerState.SKETCH) return;

    this.sessionPanels.forEach(p => {
      this.panelMeta.delete(p.name);
      this._removePanel(p);
    });
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];

    this._exitSketchCommon();
    if (this.onCancel) this.onCancel(this._sketchRoofIndex);
  }

  _exitSketchCommon() {
    this._cancelGhost();
    this._removeFaceHighlight();
    this._hide3dContextMenu();
    this.deselectPanel();
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
    const { center, normal, coplanarVerts } = faceData;
    // Compute distance from face extent so camera stays well outside
    let faceRadius = 2;
    if (coplanarVerts && coplanarVerts.length > 0) {
      for (const v of coplanarVerts) {
        const d = v.distanceTo(center);
        if (d > faceRadius) faceRadius = d;
      }
    }
    const dist = Math.max(8, faceRadius * 3);
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
    const meshBox = new THREE.Box3().setFromObject(mesh);
    const meshCenter = meshBox.getCenter(new THREE.Vector3());
    const triCenter = v0.clone().add(v1).add(v2).divideScalar(3);
    if (normal.dot(triCenter.clone().sub(meshCenter)) < 0) {
      normal.negate();
    }
    if (normal.dot(new THREE.Vector3(0, 1, 0)) < 0) {
      normal.negate();
    }

    // Find all coplanar triangles (same normal ± tolerance) to form the full face
    const coplanarVerts = this._findCoplanarFace(mesh, idx, normal, 0.12);

    const center = new THREE.Vector3();
    coplanarVerts.forEach(v => center.add(v));
    center.divideScalar(coplanarVerts.length || 1);

    return {
      mesh, faceIndex: idx, normal, center,
      vertices: [v0, v1, v2],
      coplanarVerts
    };
  }

  _findCoplanarFace(mesh, startFaceIdx, worldNormal, angleTol, planeTol) {
    const geo = mesh.geometry;
    const posAttr = geo.attributes.position;
    const index = geo.index;
    const faceCount = index ? index.count / 3 : posAttr.count / 3;

    const coplanarVerts = [];
    const refNormal = worldNormal.clone();

    // Reference plane from the start face (world space)
    let refI0, refI1, refI2;
    if (index) {
      refI0 = index.getX(startFaceIdx * 3);
      refI1 = index.getX(startFaceIdx * 3 + 1);
      refI2 = index.getX(startFaceIdx * 3 + 2);
    } else {
      refI0 = startFaceIdx * 3;
      refI1 = startFaceIdx * 3 + 1;
      refI2 = startFaceIdx * 3 + 2;
    }
    const rv0 = new THREE.Vector3().fromBufferAttribute(posAttr, refI0).applyMatrix4(mesh.matrixWorld);
    const rv1 = new THREE.Vector3().fromBufferAttribute(posAttr, refI1).applyMatrix4(mesh.matrixWorld);
    const rv2 = new THREE.Vector3().fromBufferAttribute(posAttr, refI2).applyMatrix4(mesh.matrixWorld);
    const refD = refNormal.dot(rv0);
    if (planeTol == null) {
      const e0 = rv0.distanceTo(rv1);
      const e1 = rv1.distanceTo(rv2);
      const e2 = rv2.distanceTo(rv0);
      const maxEdge = Math.max(e0, e1, e2) || 1;
      planeTol = Math.max(0.02, maxEdge * 0.05);
    }

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
        const wa = a.clone().applyMatrix4(mesh.matrixWorld);
        const wb = b.clone().applyMatrix4(mesh.matrixWorld);
        const wc = c.clone().applyMatrix4(mesh.matrixWorld);
        const center = wa.clone().add(wb).add(wc).divideScalar(3);
        const dist = Math.abs(refNormal.dot(center) - refD);
        if (dist <= planeTol) {
          coplanarVerts.push(wa, wb, wc);
        }
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
      child.userData._isSolarPanel = true;
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
    this._ghostRotationDeg = 0;
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
      child.userData._isSolarPanel = true;
      if (child.isMesh) child.material = child.material.clone();
    });

    this._positionOnFace(panel, hit);

    // Apply ghost pre-rotation to placed panel
    if (this._ghostRotationDeg !== 0 && this.selectedFace) {
      const normal = this.selectedFace.normal;
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(
        normal, (this._ghostRotationDeg * Math.PI) / 180
      );
      panel.quaternion.premultiply(rotQuat);
    }

    this.viewer.scene.add(panel);
    this.sessionPanels.push(panel);

    this.panelMeta.set(panel.name, {
      modelKey: this.activeModelKey,
      modelLabel: this.activeModelLabel || this.activeModelKey,
      roofIndex: this._sketchRoofIndex
    });

    // Push to undo stack
    this.undoStack.push({ action: 'place', panel });
    this.redoStack = [];

    console.log('[PanelPlacer] Placed panel', panel.name);
  }

  _positionOnFace(panel, hit) {
    // Project hit point onto actual roof surface plane (avoid highlight offset)
    const normal = this.selectedFace ? this.selectedFace.normal.clone() : new THREE.Vector3(0, 1, 0);
    const center = this.selectedFace ? this.selectedFace.center : hit.point;
    // Project hit.point onto the plane defined by (center, normal)
    const d = normal.dot(center);
    const dist = normal.dot(hit.point) - d;
    const projected = hit.point.clone().addScaledVector(normal, -dist);

    panel.position.copy(projected);

    // Align panel flat against the selected roof face
    const up = new THREE.Vector3(0, 1, 0);
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(up, normal);

    // Apply ghost pre-rotation if this is the ghost panel
    if (panel === this.ghostPanel && this._ghostRotationDeg !== 0) {
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(
        normal, (this._ghostRotationDeg * Math.PI) / 180
      );
      panel.quaternion.copy(baseQuat).premultiply(rotQuat);
    } else {
      panel.quaternion.copy(baseQuat);
    }

    // Offset slightly above surface
    panel.position.addScaledVector(normal, 0.005);
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
    if (!this.selectedFace || !this.selectedFace.mesh) return null;
    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
    if (!this.roofMeshes.length) this._cacheRoofMeshes();

    const hits = this.raycaster.intersectObjects(this.roofMeshes, true);
    if (hits.length === 0) return null;

    const firstHit = hits[0];
    let obj = firstHit.object;
    let isSelected = false;
    while (obj) {
      if (obj === this.selectedFace.mesh) { isSelected = true; break; }
      obj = obj.parent;
    }
    if (!isSelected || !firstHit.face) return null;

    const hitNormal = firstHit.face.normal.clone()
      .transformDirection(firstHit.object.matrixWorld).normalize();
    if (Math.abs(hitNormal.dot(this.selectedFace.normal)) < 0.8) return null;

    // Ensure hit is on the same plane as selected face
    const planeD = this.selectedFace.normal.dot(this.selectedFace.center);
    const dist = Math.abs(this.selectedFace.normal.dot(firstHit.point) - planeD);
    if (dist > 0.1) return null;

    return firstHit;
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

    // SKETCH: ghost follows mouse on selected face (only when not editing a panel)
    if (this.state === PlacerState.SKETCH && this.isDragging && this.ghostPanel && !this._editPanel && !this._gizmoActive) {
      const hit = this._raycastSelectedFace(event);
      if (hit) {
        this.ghostPanel.visible = true;
        this._positionOnFace(this.ghostPanel, hit);
      } else {
        this.ghostPanel.visible = false;
      }
    }

    // SKETCH: drag selected confirmed panel
    if (this.state === PlacerState.SKETCH && this._editDragging && this._editPanel) {
      this._moveEditPanel(event);
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
          if (this.activeModelKey) this.startInstall();
        }
      }
      return;
    }

    // SKETCH: click confirmed panel to select, or place new panel
    if (this.state === PlacerState.SKETCH) {
      // If gizmo is active, let TransformControls handle the click
      if (this._gizmoActive) return;

      // Click empty space while editing → deselect, resume ghost
      if (this._editPanel) {
        this.deselectPanel();
        if (this.isDragging && this.ghostPanel) this.ghostPanel.visible = true;
        return;
      }
      // Place new panel
      if (this.isDragging) {
        const hit = this._raycastSelectedFace(event);
        if (hit) {
          this._placePanel(hit);
          this._startGhost();
        }
      }
    }
  }

  _onMouseUp(event) {
    if (this._editDragging) {
      this._editDragging = false;
      if (this._editPanel) this.viewer.renderer.domElement.style.cursor = 'grab';
    }
  }

  _onKeyDown(event) {
    if (this.state === PlacerState.SKETCH) {
      // Editing a selected panel
      if (this._editPanel) {
        if (event.key === 'Escape') {
          this.deselectPanel();
          if (this.isDragging && this.ghostPanel) this.ghostPanel.visible = true;
          return;
        }
        if (event.key === 'r' || event.key === 'R') {
          event.preventDefault();
          this.rotateEditPanel(event.shiftKey ? -90 : 90);
          return;
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          const roofIndex = this.deleteEditPanel();
          if (roofIndex != null && this.onPanelDeleted) this.onPanelDeleted(roofIndex);
          if (this.isDragging && this.ghostPanel) this.ghostPanel.visible = true;
          return;
        }
      }
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

  _onContextMenu(event) {
    if (this.state !== PlacerState.SKETCH) return;

    // Right-click while dragging ghost → rotate ghost before placement
    if (this.isDragging && this.ghostPanel && !this._editPanel) {
      event.preventDefault();
      event.stopPropagation();
      this._show3dContextMenu(event.clientX, event.clientY, null, true);
      return;
    }

    const hitPanel = this._raycastConfirmedPanels(event);
    if (!hitPanel) return;
    event.preventDefault();
    event.stopPropagation();
    // Select the panel visually
    this.selectPanel(hitPanel);
    if (this.ghostPanel) this.ghostPanel.visible = false;
    // Show 3D context menu at click position
    this._show3dContextMenu(event.clientX, event.clientY, hitPanel, false);
  }

  _show3dContextMenu(x, y, panel, isGhost) {
    this._hide3dContextMenu();
    const menu = document.createElement('div');
    menu.className = 'ptree-ctx-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    let items;
    if (isGhost) {
      // Ghost panel context menu — rotate before placement
      items = [
        { label: '↻ Rotate +90°', fn: () => this._rotateGhost(90) },
        { label: '↺ Rotate −90°', fn: () => this._rotateGhost(-90) },
      ];
    } else {
      // Placed panel context menu
      items = [
        { label: '↻ Rotate +90°', fn: () => this.rotateEditPanel(90) },
        { label: '↺ Rotate −90°', fn: () => this.rotateEditPanel(-90) },
        { sep: true },
        { label: '✥ Move', fn: () => this._enableMoveGizmo(panel) },
        { sep: true },
        { label: '🗑 Delete', fn: () => {
          const ri = this.deleteEditPanel();
          if (ri != null && this.onPanelDeleted) this.onPanelDeleted(ri);
        }}
      ];
    }

    items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'ptree-ctx-sep';
        menu.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'ptree-ctx-item';
      btn.textContent = item.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._hide3dContextMenu();
        item.fn();
      });
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    // Clamp to viewport
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + rect.width > vw) menu.style.left = (vw - rect.width - 4) + 'px';
    if (y + rect.height > vh) menu.style.top = (vh - rect.height - 4) + 'px';

    this._ctxMenu = menu;
    setTimeout(() => {
      const dismiss = () => { this._hide3dContextMenu(); };
      document.addEventListener('click', dismiss, { once: true });
      document.addEventListener('contextmenu', dismiss, { once: true });
    }, 0);
  }

  _hide3dContextMenu() {
    if (this._ctxMenu) { this._ctxMenu.remove(); this._ctxMenu = null; }
  }

  // ──────────────── GHOST ROTATION ────────────────

  _rotateGhost(angleDeg) {
    this._ghostRotationDeg = (this._ghostRotationDeg + angleDeg) % 360;
    if (!this.ghostPanel || !this.selectedFace) return;
    const normal = this.selectedFace.normal.clone();
    const up = new THREE.Vector3(0, 1, 0);
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(up, normal);
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(
      normal, (this._ghostRotationDeg * Math.PI) / 180
    );
    this.ghostPanel.quaternion.copy(baseQuat).premultiply(rotQuat);
  }

  // ──────────────── MOVE GIZMO (TransformControls) ────────────────

  _enableMoveGizmo(panel) {
    if (!panel) return;
    this._disableMoveGizmo();

    const TC = window.TransformControls;
    if (!TC) {
      console.warn('[PanelPlacer] TransformControls not available');
      return;
    }

    const gizmo = new TC(this.viewer.camera, this.viewer.renderer.domElement);
    gizmo.setMode('translate');
    gizmo.setSize(0.6);
    gizmo.setSpace('local');

    // Constrain movement to the roof plane: build a local basis
    // X = tangent along roof, Y = normal (locked out), Z = bitangent
    const normal = this._editFaceNormal || new THREE.Vector3(0, 1, 0);

    // Hide the Y (normal) axis so user can only move along roof surface
    gizmo.showY = false;

    gizmo.attach(panel);
    this.viewer.scene.add(gizmo);

    // Disable orbit when dragging gizmo
    gizmo.addEventListener('dragging-changed', (e) => {
      this.viewer.controls.enabled = !e.value;
      if (!e.value) {
        // When drag ends, snap panel back to roof surface
        this._snapPanelToRoof(panel);
      }
    });

    // While dragging, constrain to roof plane in real-time
    gizmo.addEventListener('change', () => {
      if (gizmo.dragging) {
        this._snapPanelToRoof(panel);
      }
    });

    this._gizmo = gizmo;
    this._gizmoActive = true;
    this.viewer.renderer.domElement.style.cursor = 'move';
    console.log('[PanelPlacer] Move gizmo enabled for', panel.name);
  }

  _snapPanelToRoof(panel) {
    if (!this.selectedFace) return;
    const normal = this.selectedFace.normal;
    const center = this.selectedFace.center;
    // Project panel position onto the roof plane
    const d = normal.dot(center);
    const dist = normal.dot(panel.position) - d;
    panel.position.addScaledVector(normal, -dist + 0.005);
  }

  _disableMoveGizmo() {
    if (this._gizmo) {
      this._gizmo.detach();
      this.viewer.scene.remove(this._gizmo);
      this._gizmo.dispose();
      this._gizmo = null;
    }
    this._gizmoActive = false;
    this.viewer.controls.enabled = true;
  }

  // ──────────────── PANEL EDIT (confirmed) ────────────────

  deleteConfirmedPanel(panelName) {
    const idx = this.confirmedPanels.findIndex(p => p.name === panelName);
    if (idx < 0) return null;
    const panel = this.confirmedPanels[idx];
    const meta = this.panelMeta.get(panelName);
    this._removePanel(panel);
    this.confirmedPanels.splice(idx, 1);
    this.panelMeta.delete(panelName);
    return meta ? meta.roofIndex : null;
  }

  rotateConfirmedPanel(panelName, angleDeg) {
    const panel = this.confirmedPanels.find(p => p.name === panelName);
    if (!panel) return false;
    const meta = this.panelMeta.get(panelName);
    // Rotate around the face normal axis
    let normal = new THREE.Vector3(0, 1, 0);
    if (meta) {
      const mesh = this.getRoofMeshByIndex(meta.roofIndex);
      if (mesh) {
        const faceData = this.getBestFaceForMesh(mesh);
        if (faceData) normal.copy(faceData.normal);
      }
    }
    const angleRad = (angleDeg * Math.PI) / 180;
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(normal, angleRad);
    panel.quaternion.premultiply(rotQuat);
    return true;
  }

  // ──────────────── 3D PANEL SELECT / MOVE / ROTATE ────────────────

  _raycastConfirmedPanels(event) {
    // Check both confirmed and session panels, filtered to current roof
    const allPanels = [...this.confirmedPanels, ...this.sessionPanels];
    const roofPanels = allPanels.filter(p => {
      const meta = this.panelMeta.get(p.name);
      return meta && meta.roofIndex === this._sketchRoofIndex;
    });
    if (roofPanels.length === 0) return null;
    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
    const meshes = [];
    roofPanels.forEach(p => p.traverse(c => { if (c.isMesh) meshes.push(c); }));
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    for (const cp of roofPanels) {
      let obj = hits[0].object;
      while (obj) {
        if (obj === cp) return cp;
        obj = obj.parent;
      }
    }
    return null;
  }

  selectPanel(panel) {
    if (this._editPanel === panel) return;
    this.deselectPanel();
    this._editPanel = panel;
    this._editOrigMaterials = [];
    panel.traverse(c => {
      if (c.isMesh) {
        this._editOrigMaterials.push({ mesh: c, emissive: c.material.emissive ? c.material.emissive.getHex() : 0 });
        if (c.material.emissive) c.material.emissive.setHex(0x2563eb);
      }
    });
    // Build drag plane from roof face normal
    const meta = this.panelMeta.get(panel.name);
    if (meta != null) {
      const mesh = this.getRoofMeshByIndex(meta.roofIndex);
      if (mesh) {
        const fd = this.getBestFaceForMesh(mesh);
        if (fd) {
          this._editFaceNormal = fd.normal.clone();
          this._editPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(fd.normal, panel.position);
        }
      }
    }
    if (!this._editPlane) {
      this._editFaceNormal = new THREE.Vector3(0, 1, 0);
      this._editPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -panel.position.y);
    }
    this.viewer.renderer.domElement.style.cursor = 'grab';
    if (this.onPanelSelected) this.onPanelSelected(panel.name);
  }

  deselectPanel() {
    if (!this._editPanel) return;
    this._hide3dContextMenu();
    this._disableMoveGizmo();
    // Restore materials
    for (const entry of this._editOrigMaterials) {
      if (entry.mesh.material.emissive) entry.mesh.material.emissive.setHex(entry.emissive);
    }
    this._editOrigMaterials = [];
    this._editPanel = null;
    this._editDragging = false;
    this._editFaceNormal = null;
    this._editPlane = null;
    this.viewer.renderer.domElement.style.cursor = 'default';
    if (this.onPanelDeselected) this.onPanelDeselected();
  }

  _moveEditPanel(event) {
    if (!this._editPanel || !this._editPlane) return;
    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.viewer.camera);
    const target = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this._editPlane, target)) {
      // Offset above surface
      this._editPanel.position.copy(target);
      if (this._editFaceNormal) {
        this._editPanel.position.addScaledVector(this._editFaceNormal, 0.005);
      }
    }
  }

  rotateEditPanel(angleDeg) {
    if (!this._editPanel) return false;
    const normal = this._editFaceNormal || new THREE.Vector3(0, 1, 0);
    const angleRad = (angleDeg * Math.PI) / 180;
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(normal, angleRad);
    this._editPanel.quaternion.premultiply(rotQuat);
    return true;
  }

  deleteEditPanel() {
    if (!this._editPanel) return null;
    const name = this._editPanel.name;
    this.deselectPanel();
    // Try confirmed first, then session
    const ri = this.deleteConfirmedPanel(name);
    if (ri != null) return ri;
    return this._deleteSessionPanel(name);
  }

  _deleteSessionPanel(panelName) {
    const idx = this.sessionPanels.findIndex(p => p.name === panelName);
    if (idx < 0) return null;
    const panel = this.sessionPanels[idx];
    const meta = this.panelMeta.get(panelName);
    this._removePanel(panel);
    this.sessionPanels.splice(idx, 1);
    this.panelMeta.delete(panelName);
    // Remove from undo stack too
    this.undoStack = this.undoStack.filter(e => e.panel !== panel);
    this.redoStack = this.redoStack.filter(e => e.panel !== panel);
    return meta ? meta.roofIndex : this._sketchRoofIndex;
  }

  get editingPanel() { return this._editPanel; }

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
    this._disableMoveGizmo();
    [...this.confirmedPanels, ...this.sessionPanels].forEach(p => this._removePanel(p));
    this.confirmedPanels = [];
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];
    this.panelMeta.clear();
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
    c.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('keydown', this._onKeyDown);
    this._hide3dContextMenu();
  }
}

window.PanelPlacer = PanelPlacer;
window.PlacerState = PlacerState;
