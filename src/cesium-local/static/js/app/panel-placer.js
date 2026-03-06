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
const DEFAULT_SCENE_UNITS_PER_METER = 0.2;

class PanelPlacer {
  constructor(viewer) {
    this.viewer = viewer;
    this.state = PlacerState.IDLE;

    // Panel types cache: key → normalized spec
    this.panelModels = {};
    this.activeModelKey = null;
    this.activeModelLabel = '';
    this.roofAreasM2 = new Map();          // roofIndex -> analyzed area in m²
    this.sceneUnitsPerMeter = new Map();   // roofIndex -> calibrated scene units per meter

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
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // UI callbacks (set by wiring code)
    this.onStateChange = null;
    this.onFinish = null;   // (placedPanels, roofIndex)
    this.onCancel = null;   // (roofIndex)
    this.onPanelSelected = null;   // (panelName)
    this.onPanelDeselected = null; // ()
    this.onPanelDeleted = null;    // (roofIndex)
    this.onPanelsChanged = null;   // (summary)

    // 3D context menu element
    this._ctxMenu = null;

    // Transform gizmo (single instance, mode switched by UI buttons)
    this._gizmo = null;
    this._gizmoMode = 'translate';
    this._gizmoActive = false;
    this._rotateAxisArrow = null;
    this._gizmoHud = null;
    this._gizmoScaleBaseDistance = 10;
    this._gizmoScaleMin = 0.45;
    this._gizmoScaleMax = 1.35;
  }

  // ──────────────── INIT ────────────────

  init() {
    this._cacheRoofMeshes();
    const c = this.viewer.renderer.domElement;
    c.addEventListener('mousemove', this._onMouseMove);
    c.addEventListener('mousedown', this._onMouseDown);
    c.addEventListener('mouseup', this._onMouseUp);
    c.addEventListener('wheel', this._onWheel, { passive: true });
    c.addEventListener('contextmenu', this._onContextMenu);
    document.addEventListener('keydown', this._onKeyDown);
  }

  setLoaderClass() {}

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

  // ──────────────── PANEL TYPE REGISTRY ────────────────

  registerPanelType(key, spec) {
    if (!key || !spec) return null;
    const lengthM = Number(spec.lengthM) > 0 ? Number(spec.lengthM) : 1.722;
    const widthM = Number(spec.widthM) > 0 ? Number(spec.widthM) : 1.134;
    const thicknessM = Number(spec.thicknessM) > 0 ? Number(spec.thicknessM) : 0.03;
    const normalized = {
      panelId: key,
      brand: spec.brand || '',
      model: spec.model || '',
      type: spec.type || '',
      watt: Number(spec.watt) || 0,
      price: Number(spec.price) || 0,
      eff: spec.eff != null ? Number(spec.eff) : null,
      lengthM,
      widthM,
      thicknessM
    };
    this.panelModels[key] = normalized;
    return normalized;
  }

  setRoofArea(roofIndex, areaM2) {
    const idx = Number(roofIndex);
    const area = Number(areaM2);
    if (!Number.isInteger(idx) || idx < 0 || !Number.isFinite(area) || area <= 0) return;
    this.roofAreasM2.set(idx, area);
    this.sceneUnitsPerMeter.delete(idx);
  }

  _computeTriangleArea(a, b, c) {
    return new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .length() * 0.5;
  }

  _computeCoplanarArea(verts) {
    if (!verts || verts.length < 3) return 0;
    let total = 0;
    for (let i = 0; i + 2 < verts.length; i += 3) {
      total += this._computeTriangleArea(verts[i], verts[i + 1], verts[i + 2]);
    }
    return total;
  }

  _calibrateSceneUnitsForRoof(roofIndex) {
    if (this.sceneUnitsPerMeter.has(roofIndex)) {
      return this.sceneUnitsPerMeter.get(roofIndex);
    }

    const areaM2 = this.roofAreasM2.get(roofIndex);
    if (!Number.isFinite(areaM2) || areaM2 <= 0) return null;

    const mesh = this.getRoofMeshByIndex(roofIndex);
    if (!mesh) return null;
    const faceData = this.getBestFaceForMesh(mesh);
    if (!faceData || !faceData.coplanarVerts || faceData.coplanarVerts.length < 3) return null;

    const sceneArea = this._computeCoplanarArea(faceData.coplanarVerts);
    if (!Number.isFinite(sceneArea) || sceneArea <= 0) return null;

    const scale = Math.sqrt(sceneArea / areaM2);
    if (!Number.isFinite(scale) || scale <= 0) return null;

    this.sceneUnitsPerMeter.set(roofIndex, scale);
    console.log('[PanelPlacer] Calibrated scale roof', roofIndex, '->', scale.toFixed(6), 'scene units / meter');
    return scale;
  }

  _edgeKey(v) {
    return `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  }

  _getPrincipalAxisDirection(points, normal) {
    if (!points || points.length < 2) return null;
    const n = (normal && normal.clone) ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    let uAxis = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x);
    if (uAxis.lengthSq() < 1e-8) {
      uAxis = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z);
    }
    uAxis.normalize();
    const vAxis = new THREE.Vector3().crossVectors(n, uAxis).normalize();

    let meanU = 0;
    let meanV = 0;
    points.forEach(p => {
      meanU += p.dot(uAxis);
      meanV += p.dot(vAxis);
    });
    meanU /= points.length;
    meanV /= points.length;

    let covUU = 0;
    let covUV = 0;
    let covVV = 0;
    points.forEach(p => {
      const du = p.dot(uAxis) - meanU;
      const dv = p.dot(vAxis) - meanV;
      covUU += du * du;
      covUV += du * dv;
      covVV += dv * dv;
    });
    covUU /= points.length;
    covUV /= points.length;
    covVV /= points.length;

    if (!Number.isFinite(covUU + covVV)) return null;

    const angle = 0.5 * Math.atan2(2 * covUV, covUU - covVV);
    const dir2 = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const dir = uAxis.clone().multiplyScalar(dir2.x).add(vAxis.clone().multiplyScalar(dir2.y));
    if (dir.lengthSq() < 1e-10) return null;
    dir.normalize();

    const trace = covUU + covVV;
    const det = covUU * covVV - covUV * covUV;
    const disc = Math.max(0, trace * trace - 4 * det);
    const lambda1 = 0.5 * (trace + Math.sqrt(disc));
    const lambda2 = 0.5 * (trace - Math.sqrt(disc));
    const anisotropy = lambda1 - lambda2;

    const ref = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x);
    if (ref.lengthSq() > 1e-8) {
      ref.normalize();
      if (dir.dot(ref) < 0) dir.negate();
    }

    return { dir, anisotropy };
  }

  _scoreDirectionOnFace(dir, points, normal) {
    if (!dir || !points || points.length === 0) return -Infinity;
    const u = dir.clone().normalize();
    const v = new THREE.Vector3().crossVectors(normal, u);
    if (v.lengthSq() < 1e-10) return -Infinity;
    v.normalize();
    let minU = Infinity; let maxU = -Infinity;
    let minV = Infinity; let maxV = -Infinity;
    points.forEach(p => {
      const uVal = p.dot(u);
      const vVal = p.dot(v);
      minU = Math.min(minU, uVal);
      maxU = Math.max(maxU, uVal);
      minV = Math.min(minV, vVal);
      maxV = Math.max(maxV, vVal);
    });
    const spanU = maxU - minU;
    const spanV = maxV - minV;
    return spanU - spanV * 0.1;
  }

  _getPrimaryEdgeDirection(coplanarVerts, normal) {
    if (!coplanarVerts || coplanarVerts.length < 3) return null;
    const n = (normal && normal.clone) ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);

    const edgeMap = new Map();
    const edgePairs = [[0, 1], [1, 2], [2, 0]];

    for (let i = 0; i + 2 < coplanarVerts.length; i += 3) {
      const tri = [coplanarVerts[i], coplanarVerts[i + 1], coplanarVerts[i + 2]];
      for (const [aIdx, bIdx] of edgePairs) {
        const a = tri[aIdx];
        const b = tri[bIdx];
        const edge = new THREE.Vector3().subVectors(b, a);
        const len = edge.length();
        if (!Number.isFinite(len) || len < 1e-5) continue;

        // Tangential edge direction on roof plane
        edge.addScaledVector(normal, -edge.dot(normal));
        const tangentialLen = edge.length();
        if (!Number.isFinite(tangentialLen) || tangentialLen < 1e-5) continue;
        edge.divideScalar(tangentialLen);

        const ka = this._edgeKey(a);
        const kb = this._edgeKey(b);
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const curr = edgeMap.get(key);
        if (!curr || len > curr.len) edgeMap.set(key, { len, dir: edge.clone() });
      }
    }

    let edgeDir = null;
    let edgeScore = -Infinity;
    if (edgeMap.size) {
      let best = null;
      for (const entry of edgeMap.values()) {
        if (!best || entry.len > best.len) best = entry;
      }
      if (best && best.dir) {
        edgeDir = best.dir.clone().normalize();
        edgeScore = this._scoreDirectionOnFace(edgeDir, coplanarVerts, n);
      }
    }

    const pca = this._getPrincipalAxisDirection(coplanarVerts, n);
    const candidates = [];
    if (edgeDir) candidates.push({ dir: edgeDir, score: edgeScore });
    if (pca && pca.dir) {
      const pcaScore = this._scoreDirectionOnFace(pca.dir, coplanarVerts, n) + (pca.anisotropy || 0) * 0.001;
      candidates.push({ dir: pca.dir, score: pcaScore });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.score - a.score));
    let dir = candidates[0].dir.clone().normalize();

    const ref = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x);
    if (ref.lengthSq() > 1e-8) {
      ref.normalize();
      if (dir.dot(ref) < 0) dir.negate();
    }
    return dir;
  }

  _getPanelBaseQuaternion(faceData) {
    const normal = (faceData && faceData.normal)
      ? faceData.normal.clone().normalize()
      : new THREE.Vector3(0, 1, 0);

    let zAxis = (faceData && faceData.edgeDir) ? faceData.edgeDir.clone() : null;
    if (!zAxis || zAxis.lengthSq() < 1e-8) {
      zAxis = new THREE.Vector3(1, 0, 0).addScaledVector(normal, -normal.x);
      if (zAxis.lengthSq() < 1e-8) {
        zAxis = new THREE.Vector3(0, 0, 1).addScaledVector(normal, -normal.z);
      }
    }
    zAxis.normalize();

    const xAxis = new THREE.Vector3().crossVectors(normal, zAxis).normalize();
    zAxis = new THREE.Vector3().crossVectors(xAxis, normal).normalize();

    const basis = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(basis);
  }

  _getSceneUnitsPerMeter() {
    const roofIndex = this._sketchRoofIndex;
    if (Number.isInteger(roofIndex) && roofIndex >= 0) {
      const calibrated = this._calibrateSceneUnitsForRoof(roofIndex);
      if (calibrated) return calibrated;
    }
    return DEFAULT_SCENE_UNITS_PER_METER;
  }

  _ensureFaceEdgeDir(faceData) {
    if (!faceData || !faceData.normal || !faceData.coplanarVerts) return;
    if (!faceData.edgeDir || faceData.edgeDir.lengthSq() < 1e-8) {
      faceData.edgeDir = this._getPrimaryEdgeDirection(faceData.coplanarVerts, faceData.normal);
    }
  }

  _createPanelObject(spec, asGhost, overrideUnitsPerMeter) {
    const unitsPerMeter = overrideUnitsPerMeter || this._getSceneUnitsPerMeter();
    const length = spec.lengthM * unitsPerMeter;
    const width = spec.widthM * unitsPerMeter;
    const thicknessScale = 1.9;
    const thickness = Math.max(0.008, spec.thicknessM * unitsPerMeter * thicknessScale);
    const frameThickness = Math.min(0.008, thickness * 0.35);
    const glassThickness = Math.max(0.004, thickness - frameThickness);

    const root = new THREE.Group();
    root.name = 'solar-panel-procedural';

    const frameGeo = new THREE.BoxGeometry(width, thickness, length);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xc4c9cf,
      metalness: 0.22,
      roughness: 0.33
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    root.add(frameMesh);

    const glassGeo = new THREE.BoxGeometry(
      Math.max(0.01, width - frameThickness * 2),
      glassThickness,
      Math.max(0.01, length - frameThickness * 2)
    );
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xd5dae0,
      metalness: 0.08,
      roughness: 0.24,
      transparent: true,
      opacity: asGhost ? 0.45 : 0.93
    });
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.y = (thickness - glassThickness) * 0.5;
    root.add(glassMesh);
    root.userData._panelThickness = thickness;
    root.userData._surfaceClearance = Math.max(0.002, thickness * 0.5 + 0.001);

    root.traverse((child) => {
      child.userData._isSolarPanel = true;
      if (asGhost && child.isMesh) {
        child.material.transparent = true;
        child.material.opacity = Math.min(child.material.opacity ?? 1, 0.5);
        child.material.depthWrite = false;
      }
    });
    return root;
  }

  _styleMoveGizmoHandles(moveGizmo) {
    if (!moveGizmo) return;
    moveGizmo.traverse((obj) => {
      if (!obj || !obj.material || obj.name !== 'XYZ') return;
      const applyMat = (mat) => {
        if (!mat || !mat.color) return;
        mat.color.setHex(0x111111);
        mat.opacity = 0.95;
        mat.transparent = true;
      };
      if (Array.isArray(obj.material)) obj.material.forEach(applyMat);
      else applyMat(obj.material);
    });
  }

  _getPanelSurfaceClearance(panel) {
    if (!panel || !panel.userData) return 0.005;
    const c = Number(panel.userData._surfaceClearance);
    if (Number.isFinite(c) && c > 0) return c;
    const t = Number(panel.userData._panelThickness);
    if (Number.isFinite(t) && t > 0) return Math.max(0.002, t * 0.5 + 0.001);
    return 0.005;
  }

  setActiveModel(key) {
    if (!this.panelModels[key]) {
      console.warn('[PanelPlacer] Panel type not loaded:', key);
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
    const edgeDir = this._getPrimaryEdgeDirection(coplanarVerts, chosen.normal);

    return { mesh, faceIndex: chosen.faceIndex, normal: chosen.normal, center, vertices: chosen.vertices, coplanarVerts, edgeDir };
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

  getPanelCostSummary(includeSession = true) {
    const allPanels = includeSession
      ? [...this.confirmedPanels, ...this.sessionPanels]
      : [...this.confirmedPanels];

    let totalPrice = 0;
    for (const panel of allPanels) {
      const meta = this.panelMeta.get(panel.name);
      if (!meta) continue;
      const metaPrice = Number(meta.modelPrice);
      if (Number.isFinite(metaPrice) && metaPrice > 0) {
        totalPrice += metaPrice;
        continue;
      }
      const model = this.panelModels[meta.modelKey];
      const modelPrice = Number(model && model.price);
      if (Number.isFinite(modelPrice) && modelPrice > 0) {
        totalPrice += modelPrice;
      }
    }

    return {
      count: allPanels.length,
      totalPrice
    };
  }

  _emitPanelsChanged() {
    if (this.onPanelsChanged) {
      this.onPanelsChanged(this.getPanelCostSummary(true));
    }
  }

  // ──────────────── SERIALIZE / RESTORE ────────────────

  serializePanels() {
    const panels = [];
    const currentScale = this._getSceneUnitsPerMeter();
    for (const p of this.confirmedPanels) {
      const meta = this.panelMeta.get(p.name);
      if (!meta) continue;
      const spec = this.panelModels[meta.modelKey];
      // Use calibrated scale for the panel's roof, or current default
      const roofIdx = meta.roofIndex;
      const savedScale = (Number.isInteger(roofIdx) && this.sceneUnitsPerMeter.has(roofIdx))
        ? this.sceneUnitsPerMeter.get(roofIdx) : currentScale;
      panels.push({
        name: p.name,
        modelKey: meta.modelKey,
        modelLabel: meta.modelLabel,
        roofIndex: meta.roofIndex,
        modelPrice: meta.modelPrice || 0,
        sceneUnitsPerMeter: savedScale,
        spec: spec ? { lengthM: spec.lengthM, widthM: spec.widthM, thicknessM: spec.thicknessM, watt: spec.watt, price: spec.price, brand: spec.brand, model: spec.model } : null,
        position: { x: p.position.x, y: p.position.y, z: p.position.z },
        quaternion: { x: p.quaternion.x, y: p.quaternion.y, z: p.quaternion.z, w: p.quaternion.w }
      });
    }
    return panels;
  }

  restorePanels(data) {
    if (!Array.isArray(data) || !data.length) return;
    for (const entry of data) {
      let spec = this.panelModels[entry.modelKey];
      // Auto-register panel type from saved spec if not in catalog
      if (!spec && entry.spec) {
        spec = this.registerPanelType(entry.modelKey, entry.spec);
      }
      if (!spec) {
        // Last resort: use default dimensions so panel still appears
        spec = this.registerPanelType(entry.modelKey, {
          lengthM: 1.722, widthM: 1.134, thicknessM: 0.03,
          watt: 0, price: entry.modelPrice || 0,
          brand: '', model: entry.modelLabel || entry.modelKey
        });
      }
      // Use saved scale to match original panel size
      const scale = entry.sceneUnitsPerMeter || undefined;
      const panel = this._createPanelObject(spec, false, scale);
      panel.name = entry.name;
      panel.position.set(entry.position.x, entry.position.y, entry.position.z);
      panel.quaternion.set(entry.quaternion.x, entry.quaternion.y, entry.quaternion.z, entry.quaternion.w);

      this.viewer.scene.add(panel);
      this.confirmedPanels.push(panel);
      this.panelMeta.set(panel.name, {
        modelKey: entry.modelKey,
        modelLabel: entry.modelLabel || entry.modelKey,
        roofIndex: entry.roofIndex,
        modelPrice: entry.modelPrice || 0
      });
    }
    console.log('[PanelPlacer] Restored', data.length, 'panels');
    this._emitPanelsChanged();
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
    this._ensureFaceEdgeDir(faceData);
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

    this._emitPanelsChanged();
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

    this._emitPanelsChanged();
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
      console.warn('[PanelPlacer] No panel type selected');
      return;
    }
    this._startGhost();
  }

  _startGhost() {
    // Keep current pre-rotation across successive placements
    this._cancelGhost(false);
    const spec = this.panelModels[this.activeModelKey];
    if (!spec) return;

    this.ghostPanel = this._createPanelObject(spec, true);
    this.ghostPanel.name = 'solar-panel-ghost';
    this.ghostPanel.visible = false;
    this.viewer.scene.add(this.ghostPanel);
    this.isDragging = true;
    this.viewer.renderer.domElement.style.cursor = 'crosshair';
  }

  _cancelGhost(resetRotation = true) {
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
    if (resetRotation) this._ghostRotationDeg = 0;
    if (this.state === PlacerState.SKETCH) {
      this.viewer.renderer.domElement.style.cursor = 'default';
    }
  }

  _placePanel(hit) {
    if (!this.activeModelKey || !this.panelModels[this.activeModelKey]) return;

    const spec = this.panelModels[this.activeModelKey];
    const panel = this._createPanelObject(spec, false);
    const id = this.confirmedPanels.length + this.sessionPanels.length;
    panel.name = `solar-panel-${id}`;

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
      roofIndex: this._sketchRoofIndex,
      modelPrice: Number(spec.price) || 0
    });

    // Push to undo stack
    this.undoStack.push({ action: 'place', panel });
    this.redoStack = [];

    console.log('[PanelPlacer] Placed panel', panel.name);
    this._emitPanelsChanged();
  }

  _projectFace2D(faceData) {
    if (!faceData || !faceData.coplanarVerts || !faceData.normal) return null;
    this._ensureFaceEdgeDir(faceData);
    const normal = faceData.normal.clone().normalize();
    const zAxis = (faceData.edgeDir && faceData.edgeDir.lengthSq() > 1e-6)
      ? faceData.edgeDir.clone().normalize()
      : new THREE.Vector3(1, 0, 0).addScaledVector(normal, -normal.x).normalize();
    const xAxis = new THREE.Vector3().crossVectors(normal, zAxis).normalize();
    const origin = faceData.center ? faceData.center.clone() : new THREE.Vector3();

    const pts2d = (faceData.coplanarVerts || []).map(v => {
      const dv = v.clone().sub(origin);
      return { u: dv.dot(zAxis), v: dv.dot(xAxis) };
    });

    return { origin, normal, uAxis: zAxis, vAxis: xAxis, pts2d };
  }

  _computeConvexHull(points) {
    if (!points || points.length < 3) return points || [];
    const pts = points.slice().sort((a, b) => (a.u === b.u ? a.v - b.v : a.u - b.u));
    const cross = (o, a, b) => (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);

    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  _pointInPolygon(pt, poly) {
    if (!poly || poly.length === 0) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].u, yi = poly[i].v;
      const xj = poly[j].u, yj = poly[j].v;
      const intersect = ((yi > pt.v) !== (yj > pt.v)) &&
        (pt.u < ((xj - xi) * (pt.v - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  autoPlacePanels(count) {
    if (this.state !== PlacerState.SKETCH || !this.selectedFace) return false;
    if (!this.activeModelKey || !this.panelModels[this.activeModelKey]) return false;
    const spec = this.panelModels[this.activeModelKey];
    const basis = this._projectFace2D(this.selectedFace);
    if (!basis) return false;

    // Clear any in-session panels to avoid duplicates
    this.sessionPanels.forEach(p => {
      this.panelMeta.delete(p.name);
      this._removePanel(p);
    });
    this.sessionPanels = [];
    this.undoStack = [];
    this.redoStack = [];

    const hull = this._computeConvexHull(basis.pts2d);
    const unitsPerMeter = this._getSceneUnitsPerMeter();
    const gap = 0.05 * unitsPerMeter; // 5 cm spacing
    const panelLen = spec.lengthM * unitsPerMeter;
    const panelWid = spec.widthM * unitsPerMeter;

    const minU = Math.min(...basis.pts2d.map(p => p.u));
    const maxU = Math.max(...basis.pts2d.map(p => p.u));
    const minV = Math.min(...basis.pts2d.map(p => p.v));
    const maxV = Math.max(...basis.pts2d.map(p => p.v));

    const stepU = panelLen + gap;
    const stepV = panelWid + gap;
    const startU = minU + panelLen * 0.5 + gap * 0.5;
    const startV = minV + panelWid * 0.5 + gap * 0.5;

    let placed = 0;
    for (let u = startU; u <= maxU - panelLen * 0.5; u += stepU) {
      for (let v = startV; v <= maxV - panelWid * 0.5; v += stepV) {
        if (placed >= count) break;
        // Corner-in-polygon check to avoid overhang
        const halfL = panelLen * 0.5;
        const halfW = panelWid * 0.5;
        const corners = [
          { u: u - halfL, v: v - halfW },
          { u: u + halfL, v: v - halfW },
          { u: u + halfL, v: v + halfW },
          { u: u - halfL, v: v + halfW }
        ];
        const allInside = hull.length
          ? corners.every(c => this._pointInPolygon(c, hull))
          : true;
        if (!allInside) continue;

        const worldPt = basis.origin.clone()
          .add(basis.uAxis.clone().multiplyScalar(u))
          .add(basis.vAxis.clone().multiplyScalar(v));
        this._placePanel({ point: worldPt });
        placed++;
      }
      if (placed >= count) break;
    }

    if (placed < count) {
      console.warn(`[PanelPlacer] Auto place requested ${count}, placed ${placed}`);
    }
    // Fallback: try face center once with corner guard
    if (placed === 0 && count > 0) {
      const halfL = panelLen * 0.5;
      const halfW = panelWid * 0.5;
      const centerCorners = [
        { u: -halfL, v: -halfW },
        { u: +halfL, v: -halfW },
        { u: +halfL, v: +halfW },
        { u: -halfL, v: +halfW }
      ];
      const centerInside = hull.length
        ? centerCorners.every(c => this._pointInPolygon(c, hull))
        : true;
      if (centerInside) {
        const worldPt = basis.origin.clone();
        this._placePanel({ point: worldPt });
        placed = 1;
      }
    }
    // _placePanel already calls _emitPanelsChanged per panel; no extra emit needed
    return placed;
  }

  _positionOnFace(panel, hit) {
    if (this.selectedFace) this._ensureFaceEdgeDir(this.selectedFace);
    // Project hit point onto actual roof surface plane (avoid highlight offset)
    const normal = this.selectedFace ? this.selectedFace.normal.clone() : new THREE.Vector3(0, 1, 0);
    const center = this.selectedFace ? this.selectedFace.center : hit.point;
    // Project hit.point onto the plane defined by (center, normal)
    const d = normal.dot(center);
    const dist = normal.dot(hit.point) - d;
    const projected = hit.point.clone().addScaledVector(normal, -dist);

    panel.position.copy(projected);

    // Align panel to roof: local Y = roof normal, local Z = primary roof edge direction
    const baseQuat = this._getPanelBaseQuaternion(this.selectedFace);

    // Apply ghost pre-rotation if this is the ghost panel
    if (panel === this.ghostPanel && this._ghostRotationDeg !== 0) {
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(
        normal, (this._ghostRotationDeg * Math.PI) / 180
      );
      panel.quaternion.copy(baseQuat).premultiply(rotQuat);
    } else {
      panel.quaternion.copy(baseQuat);
    }

    // Offset by panel half-thickness + small clearance so it never sinks into roof
    panel.position.addScaledVector(normal, this._getPanelSurfaceClearance(panel));
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
      this._emitPanelsChanged();
    }
  }

  redo() {
    if (this.state !== PlacerState.SKETCH || !this.redoStack.length) return;
    const entry = this.redoStack.pop();

    if (entry.action === 'place') {
      this.viewer.scene.add(entry.panel);
      this.sessionPanels.push(entry.panel);
      this.undoStack.push(entry);
      this._emitPanelsChanged();
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
    this._updateGizmoScale();
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

  _onWheel() {
    this._updateGizmoScale();
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
        { label: 'Rotate +90', fn: () => this._rotateGhost(90) },
        { label: 'Rotate -90', fn: () => this._rotateGhost(-90) },
      ];
    } else {
      // Placed panel context menu
      items = [
        { label: 'Rotate +90', fn: () => this.rotateEditPanel(90) },
        { label: 'Rotate -90', fn: () => this.rotateEditPanel(-90) },
        { sep: true },
        { label: 'Move/Rotate', fn: () => this._enableMoveGizmo(panel) },
        { sep: true },
        { label: 'Delete', fn: () => {
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
    const baseQuat = this._getPanelBaseQuaternion(this.selectedFace);
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
    gizmo.setSpace('local');
    gizmo.setSize(1.35);
    gizmo.attach(panel);
    this.viewer.scene.add(gizmo);

    // Visual rotate axis indicator: bright, thicker line-only axis (no arrowheads)
    const axisLen = 0.62;
    const axisColor = 0xffde66;
    const axisRadius = 0.009;
    const axisGeo = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLen, 20, 1, false);
    const axisMat = new THREE.MeshBasicMaterial({
      color: axisColor,
      transparent: true,
      opacity: 0.5
    });
    const axisMesh = new THREE.Mesh(axisGeo, axisMat);
    const axisGroup = new THREE.Group();
    axisGroup.name = 'rotate-axis-indicator';
    axisGroup.add(axisMesh);
    panel.add(axisGroup);

    gizmo.addEventListener('dragging-changed', (e) => {
      this.viewer.controls.enabled = !e.value;
      if (!e.value) this._snapPanelToRoof(panel);
    });

    gizmo.addEventListener('change', () => {
      if (gizmo.dragging) this._snapPanelToRoof(panel);
    });

    this._gizmo = gizmo;
    this._rotateAxisArrow = axisGroup;
    this._gizmoActive = true;
    this._setGizmoMode('translate');
    this._styleMoveGizmoHandles(gizmo);
    this._ensureGizmoHud();
    this._updateGizmoScale(true);
    this.viewer.renderer.domElement.style.cursor = 'move';
    console.log('[PanelPlacer] Move/Rotate gizmo enabled for', panel.name);
  }

  _setGizmoMode(mode) {
    if (!this._gizmo) return;
    this._gizmoMode = mode === 'rotate' ? 'rotate' : 'translate';
    this._gizmo.setMode(this._gizmoMode);

    if (this._gizmoMode === 'translate') {
      this._gizmo.showX = true;
      this._gizmo.showY = false;
      this._gizmo.showZ = true;
      if (this._rotateAxisArrow) this._rotateAxisArrow.visible = false;
      this.viewer.renderer.domElement.style.cursor = 'move';
    } else {
      this._gizmo.showX = false;
      this._gizmo.showY = true;
      this._gizmo.showZ = false;
      if (this._rotateAxisArrow) this._rotateAxisArrow.visible = true;
      this.viewer.renderer.domElement.style.cursor = 'crosshair';
    }
  }

  _ensureGizmoHud() {
    this._removeGizmoHud();
    const host = this.viewer.renderer?.domElement?.parentElement;
    if (!host) return;

    const hud = document.createElement('div');
    hud.className = 'gizmo-mode-hud';
    hud.style.position = 'absolute';
    hud.style.right = '10px';
    hud.style.bottom = '10px';
    hud.style.zIndex = '12';
    hud.style.display = 'flex';
    hud.style.gap = '6px';
    hud.innerHTML = `
      <button type="button" data-mode="translate" style="padding:4px 8px;border:1px solid #a0a0a0;background:#f3f3f3;color:#222;cursor:pointer;">Move</button>
      <button type="button" data-mode="rotate" style="padding:4px 8px;border:1px solid #a0a0a0;background:#f3f3f3;color:#222;cursor:pointer;">Rotate</button>
    `;

    const setActive = () => {
      hud.querySelectorAll('button').forEach((btn) => {
        const active = btn.dataset.mode === this._gizmoMode;
        btn.style.background = active ? '#4a5568' : '#f3f3f3';
        btn.style.color = active ? '#fff' : '#222';
      });
    };

    hud.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._setGizmoMode(btn.dataset.mode);
        setActive();
      });
    });
    setActive();

    host.style.position = host.style.position || 'relative';
    host.appendChild(hud);
    this._gizmoHud = hud;
  }

  _removeGizmoHud() {
    if (!this._gizmoHud) return;
    this._gizmoHud.remove();
    this._gizmoHud = null;
  }

  _updateGizmoScale(force) {
    if (!this._gizmoActive || !this._editPanel || !this._gizmo) return;
    const dist = this.viewer.camera.position.distanceTo(this._editPanel.position);
    if (!Number.isFinite(dist) || dist <= 0.001) return;

    const ratio = this._gizmoScaleBaseDistance / dist;
    const size = THREE.MathUtils.clamp(
      ratio,
      this._gizmoScaleMin,
      this._gizmoScaleMax
    );

    if (force || this._gizmo) this._gizmo?.setSize(size);
  }

  _snapPanelToRoof(panel) {
    if (!this.selectedFace) return;
    const normal = this.selectedFace.normal;
    const center = this.selectedFace.center;
    // Project panel position onto the roof plane
    const d = normal.dot(center);
    const dist = normal.dot(panel.position) - d;
    panel.position.addScaledVector(normal, -dist + this._getPanelSurfaceClearance(panel));
  }

  _disableMoveGizmo() {
    if (this._gizmo) {
      this._gizmo.detach();
      this.viewer.scene.remove(this._gizmo);
      this._gizmo.dispose();
      this._gizmo = null;
    }
    if (this._rotateAxisArrow) {
      if (this._rotateAxisArrow.parent) this._rotateAxisArrow.parent.remove(this._rotateAxisArrow);
      this._rotateAxisArrow.traverse((obj) => {
        if (obj.isLine && obj.geometry) obj.geometry.dispose();
        if (obj.isMesh && obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose && m.dispose());
          else if (obj.material.dispose) obj.material.dispose();
        }
      });
      this._rotateAxisArrow = null;
    }
    this._removeGizmoHud();
    this._gizmoActive = false;
    this._gizmoMode = 'translate';
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
    this._emitPanelsChanged();
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
        this._editPanel.position.addScaledVector(
          this._editFaceNormal,
          this._getPanelSurfaceClearance(this._editPanel)
        );
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
    this._emitPanelsChanged();
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
    this._emitPanelsChanged();
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
    c.removeEventListener('wheel', this._onWheel);
    c.removeEventListener('contextmenu', this._onContextMenu);
    document.removeEventListener('keydown', this._onKeyDown);
    this._hide3dContextMenu();
  }
}

window.PanelPlacer = PanelPlacer;
window.PlacerState = PlacerState;
