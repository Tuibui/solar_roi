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
   * Sample roof surface using grid-based ray casting
   * Casts rays downward in X-Z plane to find actual roof surface
   * @returns {Array} Array of sample points with local position, normal, uv
   */
  sample() {
    const samples = [];
    
    // Ensure world matrix is up to date
    this.mesh.updateMatrixWorld();
    
    // Get bounding box in local space
    const box = new THREE.Box3().setFromObject(this.mesh);
    const size = box.getSize(new THREE.Vector3());
    
    console.log('[RoofSampler] Mesh size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
    
    // Calculate step sizes
    const stepX = size.x / this.gridSize;
    const stepZ = size.z / this.gridSize;
    
    // Raycaster setup
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    
    // Sample grid
    for (let i = 0; i <= this.gridSize; i++) {
      for (let j = 0; j <= this.gridSize; j++) {
        const x = box.min.x + (i * stepX);
        const z = box.min.z + (j * stepZ);
        
        // Start ray from above bounding box
        const origin = new THREE.Vector3(x, box.max.y + 1.0, z);
        raycaster.set(origin, down);
        
        // Find intersection with roof
        const intersects = raycaster.intersectObject(this.mesh, true);
        
        if (intersects.length > 0) {
          const hit = intersects[0];
          
          // Get normal - handle case where face is null
          let normal;
          if (hit.face && hit.face.normal) {
            normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          } else if (hit.object.geometry && hit.object.geometry.attributes.normal) {
            // Use vertex normal if face normal not available
            const normals = hit.object.geometry.attributes.normal;
            normal = new THREE.Vector3(
              normals.getX(0),
              normals.getY(0),
              normals.getZ(0)
            ).transformDirection(hit.object.matrixWorld);
          } else {
            // Default to up
            normal = new THREE.Vector3(0, 1, 0);
          }
          
          // Store sample
          samples.push({
            local: hit.point.clone(),
            normal: normal,
            uv: hit.uv ? hit.uv.clone() : null,
            faceIndex: hit.faceIndex,
            gridI: i,
            gridJ: j
          });
        }
      }
    }
    
    console.log(`[RoofSampler] Generated ${samples.length} samples (${this.gridSize}x${this.gridSize} grid)`);
    return samples;
  }

  /**
   * Sample using uniform distribution on mesh triangles
   * More accurate for irregular shapes but slower
   */
  sampleUniform(count = 200) {
    const samples = [];
    const geometry = this.mesh.geometry;
    
    if (!geometry.attributes.position) {
      console.warn('[RoofSampler] Geometry has no position attribute');
      return samples;
    }
    
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal ? geometry.attributes.normal.array : null;
    
    // Get indices (or generate if non-indexed)
    let indices = geometry.index ? geometry.index.array : null;
    if (!indices) {
      indices = [];
      for (let i = 0; i < positions.length / 3; i++) {
        indices.push(i);
      }
    }
    
    // Calculate triangle areas
    const triangleAreas = [];
    let totalArea = 0;
    
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      
      const v0 = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      const v1 = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const v2 = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);
      
      const area = this.triangleArea(v0, v1, v2);
      triangleAreas.push(area);
      totalArea += area;
    }
    
    // Sample triangles weighted by area
    for (let s = 0; s < count; s++) {
      let r = Math.random() * totalArea;
      let triangleIndex = 0;
      
      for (let i = 0; i < triangleAreas.length; i++) {
        r -= triangleAreas[i];
        if (r <= 0) {
          triangleIndex = i;
          break;
        }
      }
      
      // Get random point in triangle
      const i0 = indices[triangleIndex * 3] * 3;
      const i1 = indices[triangleIndex * 3 + 1] * 3;
      const i2 = indices[triangleIndex * 3 + 2] * 3;
      
      const a = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      const b = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      const c = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);
      
      const point = this.randomPointInTriangle(a, b, c);
      
      // Calculate normal
      let normal;
      if (normals) {
        const n0 = new THREE.Vector3(normals[i0], normals[i0 + 1], normals[i0 + 2]);
        const n1 = new THREE.Vector3(normals[i1], normals[i1 + 1], normals[i1 + 2]);
        const n2 = new THREE.Vector3(normals[i2], normals[i2 + 1], normals[i2 + 2]);
        normal = new THREE.Vector3().addVectors(n0, n1).add(n2).normalize();
      } else {
        normal = new THREE.Vector3().crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a)
        ).normalize();
      }
      
      samples.push({
        local: point,
        normal: normal,
        uv: null,
        faceIndex: triangleIndex,
        gridI: null,
        gridJ: null
      });
    }
    
    console.log(`[RoofSampler] Generated ${samples.length} uniform samples`);
    return samples;
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
