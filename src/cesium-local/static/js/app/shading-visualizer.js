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
    // Find all meshes in the roof model
    const meshes = [];
    roofMesh.traverse((child) => {
      if (child.isMesh && child.geometry) {
        meshes.push(child);
      }
    });
    
    if (meshes.length === 0) {
      console.warn('[ShadingVisualizer] No meshes found for heatmap');
      return;
    }

    // Build spatial index from samples
    const samplesWithPos = shadingResults.filter(r => r.local);
    
    console.log(`[ShadingVisualizer] Creating B/W heatmap with ${samplesWithPos.length} samples for ${meshes.length} meshes`);

    // Apply vertex colors to each mesh directly
    meshes.forEach((mesh, meshIndex) => {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position;
      
      // Skip if no position attribute
      if (!positions) return;
      
      const colors = new Float32Array(positions.count * 3);
      const vertex = new THREE.Vector3();

      for (let i = 0; i < positions.count; i++) {
        vertex.set(positions.getX(i), positions.getY(i), positions.getZ(i));
        
        // Transform vertex to world space for comparison with samples
        vertex.applyMatrix4(mesh.matrixWorld);

        // Find nearest sample using distance
        let nearest = null;
        let minDist = Infinity;
        
        for (const sample of samplesWithPos) {
          const sampleWorld = sample.local.clone().applyMatrix4(mesh.matrixWorld);
          const dist = vertex.distanceToSquared(sampleWorld);
          if (dist < minDist) {
            minDist = dist;
            nearest = sample;
          }
        }

        // Get black/white shade based on shading intensity
        const intensity = nearest ? (nearest.shadingRatio || (nearest.isShaded ? 1 : 0)) : 0;
        
        // White base (1.0) mixed with black based on intensity
        const brightness = 1.0 - (intensity * 0.8);
        
        colors[i * 3] = brightness;
        colors[i * 3 + 1] = brightness;
        colors[i * 3 + 2] = brightness;
      }

      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Update material to show vertex colors
      mesh.material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide
      });
    });

    this.heatmaps.push({
      roof: roofMesh,
      meshes: meshes,
      type: 'direct-vertex'
    });

    console.log('[ShadingVisualizer] Black/white heatmap applied directly to roof');
    return roofMesh;
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
