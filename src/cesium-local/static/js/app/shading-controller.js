/**
 * ShadingController - Main controller for monthly solar shading analysis
 * Automatically computes monthly shading and displays heatmap
 */

class ShadingController {
  constructor(options = {}) {
    this.options = {
      gridSize: 8,   // 8×8 = 81 samples (was 20→441); fast + accurate enough
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

  /**
   * Initialize the shading controller.
   *
   * Fix #14 — accept an existing Cesium viewer so we don't create a second
   * WebGL context when the caller already has one running.
   *
   * @param {Object} houseLocation  { lat, lon, height }
   * @param {Object} [opts]
   * @param {Cesium.Viewer}        [opts.viewer]       Existing Cesium viewer to reuse.
   * @param {Cesium.Cesium3DTileset} [opts.osmBuildings] Pre-loaded OSM Buildings tileset.
   *
   * When opts.viewer is supplied:
   *   • No hidden <div> is created.
   *   • No second WebGL context is allocated.
   *   • destroy() will NOT destroy the viewer (caller owns it).
   *
   * When opts.viewer is omitted (legacy / standalone use):
   *   • A minimal hidden viewer is created with requestRenderMode:true so
   *     its render loop fires only on demand — minimal GPU cost.
   *   • destroy() will destroy the viewer.
   */
  async initialize(houseLocation, { viewer = null, osmBuildings = null } = {}) {
    this.houseLocation = houseLocation;

    if (typeof CONFIG !== 'undefined' && CONFIG.CESIUM_TOKEN) {
      Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_TOKEN;
    }

    if (viewer) {
      // ── Reuse existing viewer — zero extra GPU cost ──────────────────────
      this.cesiumViewer = viewer;
      this.osmBuildings = osmBuildings || null;
      this._ownsViewer = false;
      console.log('[ShadingController] Reusing existing Cesium viewer');

    } else {
      // ── Fallback: create a minimal hidden viewer ─────────────────────────
      this._ownsViewer = true;

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
        terrainProvider,
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
        shadows: false,
        // Only render when something changes — eliminates continuous render loop
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity
      });

      this.cesiumViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          houseLocation.lon,
          houseLocation.lat,
          houseLocation.height + 100
        )
      });

      // Load Google Photorealistic 3D Tiles so shading uses the same dataset as map view
      try {
        const google = await Cesium.createGooglePhotorealistic3DTileset();
        this.cesiumViewer.scene.primitives.add(google);
        console.log('[ShadingController] Google 3D Tiles loaded in hidden viewer');
      } catch (err) {
        console.warn('[ShadingController] Failed to load Google 3D tiles in hidden viewer:', err);
      }

      // Load OSM Buildings into the hidden viewer (kept for other features but excluded from raycasts)
      try {
        if (typeof Cesium.createOsmBuildings === 'function') {
          console.log('[ShadingController] Using Cesium.createOsmBuildings()');
          this.osmBuildings = await Cesium.createOsmBuildings();
          this.cesiumViewer.scene.primitives.add(this.osmBuildings);
        } else {
          console.log('[ShadingController] Using Cesium Ion OSM Buildings asset');
          this.osmBuildings = await Cesium.Cesium3DTileset.fromIonAssetId(96188, { show: true });
          this.cesiumViewer.scene.primitives.add(this.osmBuildings);
          await this.osmBuildings.readyPromise;
          console.log('[ShadingController] OSM Buildings tileset ready');
        }

        if (this.osmBuildings) {
          this.osmBuildings.style = new Cesium.Cesium3DTileStyle({
            color: 'rgba(255, 255, 255, 0.01)'
          });
        }

        console.log('[ShadingController] OSM Buildings loaded successfully');
      } catch (error) {
        console.error('[ShadingController] Failed to load OSM Buildings:', error);
        this.osmBuildings = null;
      }
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
      // Force a scene render so Cesium starts loading tiles near the camera position
      if (this.cesiumViewer && this.cesiumViewer.scene) {
        this.cesiumViewer.scene.requestRender();
      }

      // Wait for all tilesets (OSM + Google) to load tiles near the house
      const googleTiles = typeof getGoogleTiles === 'function' ? getGoogleTiles() : null;
      // Collect all active tilesets so we wait for the full scene
      const tilesets = [googleTiles, this.osmBuildings].filter(Boolean);

      if (tilesets.length === 0) {
        console.log('[ShadingController] No tilesets to wait for');
        resolve();
        return;
      }

      const checkInterval = 200;
      const maxWait = 15000; // 15s max — Google Photorealistic tiles can be slow
      let waited = 0;

      const check = () => {
        // Trigger another render each tick to keep tile loading pipeline active
        if (this.cesiumViewer && this.cesiumViewer.scene) {
          this.cesiumViewer.scene.requestRender();
        }

        const allLoaded = tilesets.every(ts =>
          ts.tilesLoaded || (ts.allTilesLoaded !== undefined && ts.allTilesLoaded)
        );

        if (allLoaded) {
          // Extra settle time after all tiles report ready
          setTimeout(() => {
            console.log('[ShadingController] 3D tiles ready');
            resolve();
          }, 500);
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
      const targetMesh = this._resolveMesh(roofMesh);

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
      const roofMeshResolved = this._resolveMesh(roofMesh);
      roofMesh = roofMeshResolved;

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
   * Resolve the first mesh with geometry from a mesh or Group.
   * Extracted from computeMonthlyShading / computeSingleTimeShading to avoid duplication.
   * @param {THREE.Object3D} roofMesh
   * @returns {THREE.Mesh}
   */
  _resolveMesh(roofMesh) {
    if (roofMesh.geometry) return roofMesh;

    let found = null;
    roofMesh.traverse(child => {
      if (child.isMesh && child.geometry && !found) found = child;
    });

    if (!found) throw new Error('No mesh with geometry found in roof model');
    console.log('[ShadingController] Resolved child mesh:', found.name || '(unnamed)');
    return found;
  }

  /**
   * Compute full-year (12-month) shading analysis.
   *
   * Samples the roof surface ONCE and reuses the same sample set for all 12
   * months — avoids redundant geometry work and ensures consistent comparison.
   *
   * Returns:
   *   results          – annual-average per-sample shading ratios (for heatmap)
   *   monthlyResults   – array[12] of per-sample result arrays
   *   monthlyStats     – array[12] of { month, avgShading, avgShadingPercent, heavilyShaded }
   *   stats            – overall { totalSamples, avgShading, monthlyShading[12], duration }
   *
   * Progress callback receives (completedRays, totalRays, currentMonth).
   */
  async computeAnnualShading(roofMesh, progressCallback = null) {
    if (this.isComputing) throw new Error('Shading computation already in progress');
    if (!this.shadingEngine) throw new Error('Controller not initialized');

    this.isComputing = true;
    this.currentResults = null;

    try {
      const targetMesh = this._resolveMesh(roofMesh);

      // Sample once — reused across all 12 months
      this.roofSampler = new RoofSampler(targetMesh, { gridSize: this.options.gridSize });
      const samples = this.roofSampler.sample();
      if (samples.length === 0) throw new Error('No samples generated from roof mesh');

      const year = this.options.year;
      const MONTHS = 12;
      // 4 representative days × 5 hours × samples = total ray casts
      const monthOps = samples.length * 4;
      const totalOps = monthOps * MONTHS;

      console.log(`[ShadingController] Annual shading: ${samples.length} samples × 12 months (${totalOps} ray casts)`);
      const startTime = performance.now();

      const monthlyResults = []; // length 12 — each entry is array of per-sample results
      const monthlyStats = []; // length 12 — summary per month

      for (let m = 1; m <= MONTHS; m++) {
        const monthResults = await this.shadingEngine.computeMonthlyShading(
          samples,
          targetMesh.matrixWorld,
          m,
          year,
          (doneInMonth) => {
            if (progressCallback) {
              const overall = (m - 1) * monthOps + doneInMonth;
              progressCallback(overall, totalOps, m);
            }
          }
        );

        const avgShading = monthResults.reduce((s, r) => s + (r.shadingRatio || 0), 0) / monthResults.length;
        monthlyResults.push(monthResults);
        monthlyStats.push({
          month: m,
          avgShading,
          avgShadingPercent: (avgShading * 100).toFixed(1),
          heavilyShaded: monthResults.filter(r => (r.shadingRatio || 0) > 0.5).length
        });
      }

      // Annual result: average each sample's shading ratio across all 12 months
      const annualResults = samples.map((_, i) => {
        const annualRatio = monthlyResults.reduce((s, mRes) => s + (mRes[i]?.shadingRatio || 0), 0) / MONTHS;
        return {
          ...monthlyResults[0][i],
          shadingRatio: annualRatio,
          isShaded: annualRatio > 0.3
        };
      });

      const annualAvg = annualResults.reduce((s, r) => s + r.shadingRatio, 0) / annualResults.length;
      const duration = ((performance.now() - startTime) / 1000).toFixed(2);

      console.log(`[ShadingController] Annual analysis done in ${duration}s — avg shading ${(annualAvg * 100).toFixed(1)}%`);

      this.currentResults = annualResults;

      return {
        results: annualResults,
        monthlyResults,
        monthlyStats,
        stats: {
          totalSamples: annualResults.length,
          avgShading: annualAvg,
          avgShadingPercent: (annualAvg * 100).toFixed(1),
          monthlyShading: monthlyStats.map(m => m.avgShading), // [jan…dec]
          duration
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
   * Auto-run: initialize, compute, and visualize (single month)
   */
  async autoAnalyze(threeScene, houseLocation, roofMesh) {
    try {
      if (!this.cesiumViewer) {
        await this.initialize(houseLocation);
      }

      // Progress callback only receives what's available at call time (current, total)
      // stats are only ready after computeMonthlyShading resolves — not during it
      const { results, stats } = await this.computeMonthlyShading(roofMesh, (current, total) => {
        if (this.onProgress) this.onProgress(current, total);
      });

      this.visualize(threeScene, results);

      if (this.onComplete) this.onComplete(stats);

      return stats;

    } catch (error) {
      console.error('[ShadingController] Auto-analysis failed:', error);
      if (this.onError) this.onError(error);
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

    // Only destroy the viewer if we created it — never destroy a borrowed viewer
    if (this._ownsViewer && this.cesiumViewer) {
      this.cesiumViewer.destroy();
      console.log('[ShadingController] Hidden viewer destroyed');
    }
    this.cesiumViewer = null;

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }

    this.osmBuildings = null;
    this.roofSampler = null;
    this.currentResults = null;
    this._ownsViewer = false;

    console.log('[ShadingController] Destroyed');
  }
}

window.ShadingController = ShadingController;
