/**
 * ShadingVisualizer - Displays solar shading heatmap on Three.js roof
 * White roof base with black overlay gradient
 * Good = white/transparent, Poor = black (darker = more shaded)
 */

class ShadingVisualizer {
  constructor(threeScene, options = {}) {
    this.scene = threeScene;
    this.heatmaps = []; // Store heatmap meshes per roof
    this.originalMaterials = new Map(); // Store original materials
  }

  /**
   * Make roof white with black edges before applying heatmap
   */
  makeRoofWhiteWithEdges(roofMesh) {
    // Store original material if not already stored
    if (!this.originalMaterials.has(roofMesh.uuid)) {
      this.originalMaterials.set(roofMesh.uuid, roofMesh.material);
    }
    
    roofMesh.traverse((child) => {
      if (child.isMesh) {
        if (!this.originalMaterials.has(child.uuid)) {
          this.originalMaterials.set(child.uuid, child.material);
        }
        
        // Create white material with black edges using a group
        const whiteMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.5,
          metalness: 0.1,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
        
        child.material = whiteMaterial;
      }
    });
    
    console.log('[ShadingVisualizer] Roof made white with edges');
  }

  /**
   * Create black edges for the roof
   */
  createBlackEdges(roofMesh) {
    const edgesGroup = new THREE.Group();
    edgesGroup.name = 'roofEdges';
    
    roofMesh.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const edges = new THREE.EdgesGeometry(child.geometry, 15); // 15-degree threshold
        const lineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x000000,
          linewidth: 2
        });
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        
        wireframe.position.copy(child.position);
        wireframe.rotation.copy(child.rotation);
        wireframe.scale.copy(child.scale);
        
        edgesGroup.add(wireframe);
      }
    });
    
    const parent = roofMesh.parent || roofMesh;
    parent.add(edgesGroup);
    
    return edgesGroup;
  }

  /**
   * Create black/white heatmap on the roof surface
   * @param {THREE.Mesh} roofMesh - The roof mesh
   * @param {Array} shadingResults - Results with shadingRatio (0-1)
   */
  createHeatmap(roofMesh, shadingResults) {
    if (!roofMesh || !roofMesh.geometry) {
      console.warn('[ShadingVisualizer] Invalid roof mesh');
      return;
    }

    // Remove existing heatmap for this roof
    this.clearHeatmap(roofMesh);
    
    // Roof is already white with black edges from loader
    // Just apply the shading heatmap overlay

    // Create black/white vertex-colored heatmap
    return this.createBlackWhiteHeatmap(roofMesh, shadingResults);
  }

  /**
   * Create black/white vertex-colored heatmap
   * Applies vertex colors directly to existing roof mesh (no separate plate)
   */
  createBlackWhiteHeatmap(roofMesh, shadingResults) {
    const meshes = [];
    roofMesh.traverse(child => {
      if (child.isMesh && child.geometry) meshes.push(child);
    });

    if (meshes.length === 0) {
      console.warn('[ShadingVisualizer] No meshes found for heatmap');
      return;
    }

    const samplesWithPos = shadingResults.filter(r => r.local);
    if (samplesWithPos.length === 0) {
      console.warn('[ShadingVisualizer] No samples with position data');
      return;
    }

    console.log(`[ShadingVisualizer] Creating B/W heatmap — ${samplesWithPos.length} samples, ${meshes.length} meshes`);

    meshes.forEach(mesh => {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;
      if (!positions) return;

      // Step 1: Precompute all sample world positions once per mesh
      // (was: clone+transform inside the V×S inner loop — now just S transforms total)
      const sampleWorlds = samplesWithPos.map(s =>
        s.local.clone().applyMatrix4(mesh.matrixWorld)
      );

      // Step 2: Build spatial grid for O(1) average nearest-neighbor lookup
      const grid = this._buildSpatialGrid(sampleWorlds);

      // Step 3: Assign vertex colors
      const colors = new Float32Array(positions.count * 3);
      const vertex = new THREE.Vector3();

      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);

        const idx = grid.nearest(vertex);
        const sample = samplesWithPos[idx];
        const intensity = sample
          ? (sample.shadingRatio ?? (sample.isShaded ? 1 : 0))
          : 0;
        const brightness = 1.0 - intensity * 0.8;

        colors[i * 3]     = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
      }

      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mesh.material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
    });

    this.heatmaps.push({ roof: roofMesh, meshes, type: 'direct-vertex' });
    console.log('[ShadingVisualizer] Heatmap applied');
    return roofMesh;
  }

  /**
   * Build a 3-D spatial hash grid for fast nearest-neighbour queries.
   * Cell size is chosen so each cell holds ~1–4 samples on average.
   *
   * @param {THREE.Vector3[]} worldPoints  Precomputed world-space positions
   * @returns {{ nearest(query: THREE.Vector3): number }}  Returns index into worldPoints
   */
  _buildSpatialGrid(worldPoints) {
    if (worldPoints.length === 0) return { nearest: () => 0 };

    // Compute bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of worldPoints) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }

    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.01);
    // Target ~2 samples per cell; clamp to avoid degenerate cell sizes
    const cellSize = Math.max(span / Math.sqrt(worldPoints.length / 2), 0.05);

    /** @type {Map<string, number[]>} */
    const cells = new Map();

    const cellCoords = p => [
      Math.floor(p.x / cellSize),
      Math.floor(p.y / cellSize),
      Math.floor(p.z / cellSize)
    ];
    const cellKey = (cx, cy, cz) => `${cx},${cy},${cz}`;

    // Insert each sample into its grid cell
    worldPoints.forEach((p, i) => {
      const [cx, cy, cz] = cellCoords(p);
      const k = cellKey(cx, cy, cz);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(i);
    });

    return {
      nearest(query) {
        const [qx, qy, qz] = cellCoords(query);

        let bestDist = Infinity;
        let bestIdx  = 0;

        // Expand search radius shell by shell.
        // r=0 → same cell; r=1 → 3³−1³ = 26 neighbours; stop as soon as
        // the nearest candidate can't be beaten by an outer shell.
        for (let r = 0; r <= 3; r++) {
          for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
              for (let dz = -r; dz <= r; dz++) {
                // Only visit the surface of the shell (skip interior)
                if (r > 0 && Math.abs(dx) < r && Math.abs(dy) < r && Math.abs(dz) < r) continue;

                const bucket = cells.get(cellKey(qx + dx, qy + dy, qz + dz));
                if (!bucket) continue;

                for (const idx of bucket) {
                  const d = query.distanceToSquared(worldPoints[idx]);
                  if (d < bestDist) { bestDist = d; bestIdx = idx; }
                }
              }
            }
          }

          // Early exit: if best distance is within this shell,
          // no outer shell can produce a closer point.
          if (bestDist < (r * cellSize) ** 2) break;
        }

        return bestIdx;
      }
    };
  }

  /**
   * Clear heatmap for a specific roof
   */
  clearHeatmap(roofMesh) {
    const index = this.heatmaps.findIndex(h => h.roof === roofMesh);
    if (index >= 0) {
      const entry = this.heatmaps[index];
      
      // Handle direct vertex color approach
      if (entry.type === 'direct-vertex' && entry.meshes) {
        entry.meshes.forEach(mesh => {
          // Remove color attribute
          if (mesh.geometry.attributes.color) {
            mesh.geometry.deleteAttribute('color');
          }
          // Reset to white material
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide
          });
        });
      }
      
      // Handle old overlay approach
      if (entry.targetMesh) {
        entry.targetMesh.visible = true;
      }
      
      if (entry.heatmap) {
        entry.heatmap.traverse((child) => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        entry.heatmap.parent.remove(entry.heatmap);
      }
      
      this.heatmaps.splice(index, 1);
    }
  }

  /**
   * Clear all heatmaps
   */
  clear() {
    this.heatmaps.forEach(entry => {
      // Handle direct vertex color approach
      if (entry.type === 'direct-vertex' && entry.meshes) {
        entry.meshes.forEach(mesh => {
          if (mesh.geometry.attributes.color) {
            mesh.geometry.deleteAttribute('color');
          }
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide
          });
        });
      }
      
      if (entry.targetMesh) {
        entry.targetMesh.visible = true;
      }
      
      if (entry.heatmap) {
        entry.heatmap.traverse((child) => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        entry.heatmap.parent.remove(entry.heatmap);
      }
    });
    this.heatmaps = [];
  }

  /**
   * Toggle visibility
   */
  toggle() {
    if (this.heatmaps.length === 0) return false;
    
    const firstEntry = this.heatmaps[0];
    let visible;
    
    if (firstEntry.type === 'direct-vertex' && firstEntry.meshes) {
      // Check first mesh material
      const firstMesh = firstEntry.meshes[0];
      visible = !(firstMesh.material && firstMesh.material.vertexColors);
      
      this.heatmaps.forEach(entry => {
        if (entry.type === 'direct-vertex' && entry.meshes) {
          entry.meshes.forEach(mesh => {
            if (visible) {
              // Enable vertex colors (show shading)
              mesh.material.vertexColors = true;
              mesh.material.needsUpdate = true;
            } else {
              // Disable vertex colors (show white)
              mesh.material.vertexColors = false;
              mesh.material.color.setHex(0xffffff);
              mesh.material.needsUpdate = true;
            }
          });
        }
      });
    } else {
      // Old overlay approach
      visible = !firstEntry.heatmap?.visible;
      this.heatmaps.forEach(entry => {
        if (entry.heatmap) entry.heatmap.visible = visible;
        if (entry.targetMesh) {
          entry.targetMesh.visible = !visible;
        }
      });
    }
    
    return visible;
  }

  dispose() {
    this.clear();
    this.originalMaterials.clear();
  }
}

window.ShadingVisualizer = ShadingVisualizer;
