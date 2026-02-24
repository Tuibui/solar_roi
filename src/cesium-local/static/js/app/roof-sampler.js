/**
 * RoofSampler - Samples roof surface points for shading analysis
 * Works with Three.js mesh geometry
 */

class RoofSampler {
  /**
   * @param {THREE.Mesh} roofMesh - The roof mesh to sample
   * @param {Object} options - Sampling options
   */
  constructor(roofMesh, options = {}) {
    this.mesh = roofMesh;
    this.gridSize = options.gridSize || 15;
    this.sampleOffset = options.sampleOffset || 0.02; // Offset above surface
  }

  /**
   * Primary sampling method.
   * Delegates to area-weighted uniform sampling — works for any mesh orientation,
   * no axis-aligned ray assumption needed.
   * Count matches the old (gridSize+1)² resolution so callers need no change.
   */
  sample() {
    return this.sampleUniform((this.gridSize + 1) ** 2);
  }

  /**
   * Grid-based sampling along the mesh's own dominant normal direction.
   * Fixed version of the original sample() — no longer assumes world -Y is "up".
   * Use this when a structured grid layout is needed (e.g. visualisation).
   */
  sampleGrid() {
    this.mesh.updateMatrixWorld();

    // Cast rays along -normal so tilted roofs are sampled correctly
    const normal  = this._computeDominantNormal();
    const rayDir  = normal.clone().negate();
    const { u, v } = this._planeBasis(normal);

    // Project all vertices onto (u, v, n) basis to get 2-D grid bounds
    const positions = this.mesh.geometry.attributes.position;
    const tmp = new THREE.Vector3();
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    let maxN = -Infinity;

    for (let i = 0; i < positions.count; i++) {
      tmp.fromBufferAttribute(positions, i).applyMatrix4(this.mesh.matrixWorld);
      const pu = tmp.dot(u);
      const pv = tmp.dot(v);
      const pn = tmp.dot(normal);
      if (pu < minU) minU = pu; if (pu > maxU) maxU = pu;
      if (pv < minV) minV = pv; if (pv > maxV) maxV = pv;
      if (pn > maxN) maxN = pn;
    }

    const stepU = (maxU - minU) / this.gridSize;
    const stepV = (maxV - minV) / this.gridSize;
    const raycaster = new THREE.Raycaster();
    const samples   = [];

    for (let i = 0; i <= this.gridSize; i++) {
      for (let j = 0; j <= this.gridSize; j++) {
        const pu = minU + i * stepU;
        const pv = minV + j * stepV;

        // Ray origin: above the surface along the normal axis
        const origin = new THREE.Vector3()
          .addScaledVector(u, pu)
          .addScaledVector(v, pv)
          .addScaledVector(normal, maxN + 1.0);

        raycaster.set(origin, rayDir);
        const hits = raycaster.intersectObject(this.mesh, true);

        if (hits.length > 0) {
          const hit = hits[0];
          const hitNormal = hit.face
            ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
            : normal.clone();

          samples.push({
            local: hit.point.clone(),
            normal: hitNormal,
            uv: hit.uv ? hit.uv.clone() : null,
            faceIndex: hit.faceIndex,
            gridI: i,
            gridJ: j
          });
        }
      }
    }

    console.log(`[RoofSampler] sampleGrid: ${samples.length} samples (${this.gridSize}×${this.gridSize})`);
    return samples;
  }

  /**
   * Area-weighted uniform sampling on mesh triangles.
   * Correct for any mesh orientation — no ray casting required.
   * Triangle selection uses a CDF + binary search: O(N log N) build, O(log N) per sample.
   */
  sampleUniform(count = 200) {
    const samples  = [];
    const geometry = this.mesh.geometry;

    if (!geometry.attributes.position) {
      console.warn('[RoofSampler] Geometry has no position attribute');
      return samples;
    }

    const positions = geometry.attributes.position.array;
    const normals   = geometry.attributes.normal ? geometry.attributes.normal.array : null;

    // Build index array (handle non-indexed geometry)
    let indices = geometry.index ? geometry.index.array : null;
    if (!indices) {
      indices = new Int32Array(positions.length / 3);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
    }

    const triCount = Math.floor(indices.length / 3);

    // --- Build triangle-area CDF in one pass: O(N) ---
    const cdf = new Float64Array(triCount);
    let totalArea = 0;

    for (let t = 0; t < triCount; t++) {
      const i0 = indices[t * 3]     * 3;
      const i1 = indices[t * 3 + 1] * 3;
      const i2 = indices[t * 3 + 2] * 3;

      const v0 = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      const v1 = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const v2 = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);

      totalArea += this.triangleArea(v0, v1, v2);
      cdf[t] = totalArea;
    }

    if (totalArea === 0) {
      console.warn('[RoofSampler] Mesh has zero area');
      return samples;
    }

    // --- Sample triangles weighted by area: O(log N) per sample ---
    for (let s = 0; s < count; s++) {
      const r = Math.random() * totalArea;

      // Binary search for first cdf[t] >= r
      let lo = 0, hi = triCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < r) lo = mid + 1;
        else              hi = mid;
      }
      const triIdx = lo;

      const i0 = indices[triIdx * 3]     * 3;
      const i1 = indices[triIdx * 3 + 1] * 3;
      const i2 = indices[triIdx * 3 + 2] * 3;

      const a = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      const b = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const c = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);

      const point = this.randomPointInTriangle(a, b, c);

      // Normal: interpolate vertex normals if available, else face normal
      let normal;
      if (normals) {
        const n0 = new THREE.Vector3(normals[i0], normals[i0 + 1], normals[i0 + 2]);
        const n1 = new THREE.Vector3(normals[i1], normals[i1 + 1], normals[i1 + 2]);
        const n2 = new THREE.Vector3(normals[i2], normals[i2 + 1], normals[i2 + 2]);
        normal = new THREE.Vector3().addVectors(n0, n1).add(n2).normalize();
      } else {
        normal = new THREE.Vector3()
          .crossVectors(
            new THREE.Vector3().subVectors(b, a),
            new THREE.Vector3().subVectors(c, a)
          ).normalize();
      }

      samples.push({ local: point, normal, uv: null, faceIndex: triIdx });
    }

    console.log(`[RoofSampler] sampleUniform: ${samples.length} samples`);
    return samples;
  }

  /**
   * Compute the area-weighted dominant normal of the mesh in world space.
   * Ensures the returned normal points "outward" (positive dot with world +Y).
   */
  _computeDominantNormal() {
    const geometry  = this.mesh.geometry;
    const positions = geometry.attributes.position;
    const indices   = geometry.index ? geometry.index.array : null;
    const triCount  = indices ? Math.floor(indices.length / 3) : Math.floor(positions.count / 3);

    const dominant = new THREE.Vector3();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();

    for (let t = 0; t < triCount; t++) {
      const i0 = indices ? indices[t * 3]     : t * 3;
      const i1 = indices ? indices[t * 3 + 1] : t * 3 + 1;
      const i2 = indices ? indices[t * 3 + 2] : t * 3 + 2;

      a.fromBufferAttribute(positions, i0).applyMatrix4(this.mesh.matrixWorld);
      b.fromBufferAttribute(positions, i1).applyMatrix4(this.mesh.matrixWorld);
      c.fromBufferAttribute(positions, i2).applyMatrix4(this.mesh.matrixWorld);

      // Area-weighted normal contribution (cross product magnitude = 2×area)
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      dominant.add(new THREE.Vector3().crossVectors(e1, e2));
    }

    dominant.normalize();
    // Flip so it points "away from ground" (positive Y in world)
    if (dominant.y < 0) dominant.negate();

    return dominant;
  }

  /**
   * Build an orthonormal (u, v) basis in the plane perpendicular to `normal`.
   */
  _planeBasis(normal) {
    const ref = Math.abs(normal.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);

    const u = new THREE.Vector3().crossVectors(ref, normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    return { u, v };
  }

  /**
   * Calculate triangle area
   */
  triangleArea(v0, v1, v2) {
    const ab = new THREE.Vector3().subVectors(v1, v0);
    const ac = new THREE.Vector3().subVectors(v2, v0);
    const cross = new THREE.Vector3().crossVectors(ab, ac);
    return cross.length() / 2;
  }

  /**
   * Generate random point inside triangle using barycentric coordinates
   */
  randomPointInTriangle(a, b, c) {
    let r1 = Math.random();
    let r2 = Math.random();
    
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    
    const point = new THREE.Vector3()
      .copy(a)
      .multiplyScalar(1 - r1 - r2)
      .add(new THREE.Vector3().copy(b).multiplyScalar(r1))
      .add(new THREE.Vector3().copy(c).multiplyScalar(r2));
    
    return point;
  }

  /**
   * Get sample density statistics
   */
  getStats(samples) {
    if (!samples.length) return null;
    
    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3());
    const area = size.x * size.z;
    
    return {
      totalSamples: samples.length,
      areaApprox: area,
      samplesPerM2: samples.length / area,
      gridSize: this.gridSize
    };
  }
}

// Export
window.RoofSampler = RoofSampler;
