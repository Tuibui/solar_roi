/**
 * ShadingController - Main controller for monthly solar shading analysis
 * Automatically computes monthly shading and displays heatmap
 */

class ShadingController {
  constructor(options = {}) {
    this.options = {
      gridSize: 20,
      month: new Date().getMonth() + 1, // Current month
      year: new Date().getFullYear(),
      ...options
    };
    
    this.cesiumViewer = null;
    this.osmBuildings = null;
    this.shadingEngine = null;
    this.visualizer = null;
    this.roofSampler = null;
    
    this.isComputing = false;
    this.currentResults = null;
    this.houseLocation = null;
    
    this.container = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
  }

  async initialize(houseLocation) {
    this.houseLocation = houseLocation;
    
    // Ensure Cesium token is set
    if (typeof CONFIG !== 'undefined' && CONFIG.CESIUM_TOKEN) {
      Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_TOKEN;
      console.log('[ShadingController] Cesium token set');
    }
    
    this.container = document.createElement('div');
    this.container.id = 'cesium-shading-container';
    this.container.style.cssText = `
      position: fixed;
      width: 2px;
      height: 2px;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      z-index: -1;
      left: -100px;
      top: -100px;
    `;
    document.body.appendChild(this.container);
    
    // Terrain provider with fallback
    let terrainProvider;
    if (Cesium.createWorldTerrain) {
      terrainProvider = Cesium.createWorldTerrain();
    } else if (Cesium.EllipsoidTerrainProvider) {
      terrainProvider = new Cesium.EllipsoidTerrainProvider();
    } else {
      terrainProvider = new Cesium.CesiumTerrainProvider({
        url: 'https://assets.agi.com/stk-terrain/world'
      });
    }
    
    this.cesiumViewer = new Cesium.Viewer(this.container, {
      terrainProvider: terrainProvider,
      skyBox: false,
      skyAtmosphere: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      shadows: false
    });
    
    this.cesiumViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        houseLocation.lon,
        houseLocation.lat,
        houseLocation.height + 100
      )
    });
    
    try {
      // Method 1: Try createOsmBuildings() (Cesium 1.95+)
      if (typeof Cesium.createOsmBuildings === 'function') {
        console.log('[ShadingController] Using Cesium.createOsmBuildings()');
        this.osmBuildings = await Cesium.createOsmBuildings();
        this.cesiumViewer.scene.primitives.add(this.osmBuildings);
      } 
      // Method 2: Try ion asset ID directly with new token
      else {
        console.log('[ShadingController] Using Cesium Ion OSM Buildings asset');
        
        // OSM Buildings asset ID on Cesium Ion is 96188
        this.osmBuildings = await Cesium.Cesium3DTileset.fromIonAssetId(96188, {
          show: true
        });
        
        this.cesiumViewer.scene.primitives.add(this.osmBuildings);
        
        // Wait for tileset to be ready
        await this.osmBuildings.readyPromise;
        console.log('[ShadingController] OSM Buildings tileset ready');
      }
      
      // Make nearly transparent but still pickable
      if (this.osmBuildings) {
        this.osmBuildings.style = new Cesium.Cesium3DTileStyle({
          color: 'rgba(255, 255, 255, 0.01)'
        });
      }
      
      console.log('[ShadingController] OSM Buildings loaded successfully');
    } catch (error) {
      console.error('[ShadingController] Failed to load OSM Buildings:', error);
      console.warn('[ShadingController] Continuing without OSM Buildings');
      this.osmBuildings = null;
    }
    
    this.shadingEngine = new ShadingEngine(
      this.cesiumViewer,
      this.osmBuildings,
      houseLocation
    );
    
    await this._waitForTiles();
    
    return this;
  }

  _waitForTiles() {
    return new Promise((resolve) => {
      // If no OSM buildings, resolve immediately
      if (!this.osmBuildings) {
        console.log('[ShadingController] No OSM buildings, skipping tile wait');
        resolve();
        return;
      }
      
      const checkInterval = 100;
      const maxWait = 30000;
      let waited = 0;
      
      const check = () => {
        if (this.osmBuildings.allTilesLoaded) {
          setTimeout(() => {
            console.log('[ShadingController] OSM tiles ready');
            resolve();
          }, 1000);
          return;
        }
        
        waited += checkInterval;
        if (waited >= maxWait) {
          console.warn('[ShadingController] Timeout waiting for tiles, proceeding anyway');
          resolve();
          return;
        }
        
        setTimeout(check, checkInterval);
      };
      
      check();
    });
  }

  /**
   * Compute shading at a single specific time
   */
  async computeSingleTimeShading(roofMesh, dateTime, progressCallback = null) {
    if (this.isComputing) {
      throw new Error('Shading computation already in progress');
    }
    
    if (!this.shadingEngine) {
      throw new Error('Controller not initialized');
    }
    
    this.isComputing = true;
    this.currentResults = null;
    
    try {
      console.log(`[ShadingController] Starting single-time shading analysis for ${dateTime}`);
      
      // Find mesh with geometry
      let targetMesh = roofMesh;
      if (!roofMesh.geometry) {
        let foundMesh = null;
        roofMesh.traverse((child) => {
          if (child.isMesh && child.geometry && !foundMesh) {
            foundMesh = child;
          }
        });
        if (foundMesh) {
          targetMesh = foundMesh;
        } else {
          throw new Error('No mesh with geometry found in roof model');
        }
      }
      
      // Sample roof
      this.roofSampler = new RoofSampler(targetMesh, {
        gridSize: this.options.gridSize
      });
      
      const samples = this.roofSampler.sample();
      
      if (samples.length === 0) {
        throw new Error('No samples generated from roof mesh');
      }
      
      console.log(`[ShadingController] Generated ${samples.length} samples`);
      
      // Compute shading at specific time
      const startTime = performance.now();
      
      const results = await this.shadingEngine.computeShading(
        samples,
        targetMesh.matrixWorld,
        dateTime,
        progressCallback
      );
      
      // Convert isShaded boolean to shadingRatio for consistent visualization
      const normalizedResults = results.map(r => ({
        ...r,
        shadingRatio: r.isShaded ? 1 : 0
      }));
      
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      
      const shadedCount = normalizedResults.filter(r => r.isShaded).length;
      
      console.log(`[ShadingController] Single-time analysis complete in ${duration}s: ${shadedCount}/${normalizedResults.length} points shaded`);
      
      this.currentResults = normalizedResults;
      
      return {
        results: normalizedResults,
        stats: {
          totalSamples: normalizedResults.length,
          shadedCount: shadedCount,
          shadedPercent: ((shadedCount / normalizedResults.length) * 100).toFixed(1),
          sunlitCount: normalizedResults.length - shadedCount,
          duration: duration,
          analysisTime: dateTime.toISOString()
        }
      };
      
    } finally {
      this.isComputing = false;
    }
  }

  /**
   * Compute monthly shading for a roof
   */
  async computeMonthlyShading(roofMesh, progressCallback = null) {
    if (this.isComputing) {
      throw new Error('Shading computation already in progress');
    }
    
    if (!this.shadingEngine) {
      throw new Error('Controller not initialized');
    }
    
    this.isComputing = true;
    this.currentResults = null;
    
    try {
      console.log(`[ShadingController] Starting monthly shading analysis for ${this.options.month}/${this.options.year}`);
      
      // Ensure the mesh has geometry
      if (!roofMesh.geometry) {
        console.warn('[ShadingController] Roof mesh has no geometry, looking for child meshes...');
        // If it's a Group, find the first child with geometry
        let foundMesh = null;
        roofMesh.traverse((child) => {
          if (child.isMesh && child.geometry && !foundMesh) {
            foundMesh = child;
          }
        });
        if (foundMesh) {
          console.log('[ShadingController] Found child mesh:', foundMesh.name);
          roofMesh = foundMesh;
        } else {
          throw new Error('No mesh with geometry found in roof model');
        }
      }
      
      // Sample roof
      this.roofSampler = new RoofSampler(roofMesh, {
        gridSize: this.options.gridSize
      });
      
      const samples = this.roofSampler.sample();
      
      if (samples.length === 0) {
        throw new Error('No samples generated from roof mesh');
      }
      
      console.log(`[ShadingController] Generated ${samples.length} samples`);
      
      // Compute monthly shading
      const startTime = performance.now();
      
      const results = await this.shadingEngine.computeMonthlyShading(
        samples,
        roofMesh.matrixWorld,
        this.options.month,
        this.options.year,
        progressCallback
      );
      
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      
      // Calculate statistics
      const avgShading = results.reduce((sum, r) => sum + (r.shadingRatio || 0), 0) / results.length;
      const heavilyShaded = results.filter(r => (r.shadingRatio || 0) > 0.5).length;
      
      console.log(`[ShadingController] Analysis complete in ${duration}s: ${(avgShading * 100).toFixed(1)}% avg shading`);
      
      this.currentResults = results;
      
      return {
        results,
        stats: {
          totalSamples: results.length,
          avgShading: avgShading,
          avgShadingPercent: (avgShading * 100).toFixed(1),
          heavilyShaded: heavilyShaded,
          heavilyShadedPercent: ((heavilyShaded / results.length) * 100).toFixed(1),
          duration: duration
        }
      };
      
    } finally {
      this.isComputing = false;
    }
  }

  /**
   * Create heatmap visualization
   */
  visualize(threeScene, results = null) {
    const data = results || this.currentResults;
    
    if (!data || data.length === 0) {
      console.warn('[ShadingController] No results to visualize');
      return null;
    }
    
    if (!this.visualizer) {
      this.visualizer = new ShadingVisualizer(threeScene);
    }
    
    // Find roof mesh in scene (largest mesh)
    let roofMesh = null;
    let maxVertices = 0;
    threeScene.traverse((obj) => {
      if (obj.isMesh && !obj.name.includes('shading') && !obj.name.includes('heatmap')) {
        const vertices = obj.geometry?.attributes?.position?.count || 0;
        if (vertices > maxVertices) {
          maxVertices = vertices;
          roofMesh = obj;
        }
      }
    });
    
    if (roofMesh) {
      console.log('[ShadingController] Creating heatmap on mesh:', roofMesh.name || 'unnamed');
      this.visualizer.createHeatmap(roofMesh, data);
      return this.visualizer;
    }
    
    console.warn('[ShadingController] No roof mesh found for visualization');
    return null;
  }

  /**
   * Auto-run: initialize, compute, and visualize
   */
  async autoAnalyze(threeScene, houseLocation, roofMesh) {
    try {
      if (!this.cesiumViewer) {
        await this.initialize(houseLocation);
      }
      
      const { results, stats } = await this.computeMonthlyShading(roofMesh, (current, total) => {
        if (this.onProgress) {
          this.onProgress(current, total, stats);
        }
      });
      
      this.visualize(threeScene, results);
      
      if (this.onComplete) {
        this.onComplete(stats);
      }
      
      return stats;
      
    } catch (error) {
      console.error('[ShadingController] Auto-analysis failed:', error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  clearVisualization() {
    if (this.visualizer) {
      this.visualizer.clear();
    }
  }

  toggleVisualization() {
    if (this.visualizer) {
      return this.visualizer.toggle();
    }
    return false;
  }

  isReady() {
    if (!this.osmBuildings) return true; // Ready if no buildings to load
    return this.osmBuildings.allTilesLoaded;
  }

  destroy() {
    this.clearVisualization();
    
    if (this.visualizer) {
      this.visualizer.dispose();
      this.visualizer = null;
    }
    
    if (this.shadingEngine) {
      this.shadingEngine.destroy();
      this.shadingEngine = null;
    }
    
    if (this.cesiumViewer) {
      this.cesiumViewer.destroy();
      this.cesiumViewer = null;
    }
    
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
    
    this.osmBuildings = null;
    this.roofSampler = null;
    this.currentResults = null;
    
    console.log('[ShadingController] Destroyed');
  }
}

window.ShadingController = ShadingController;
