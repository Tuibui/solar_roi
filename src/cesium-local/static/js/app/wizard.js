/**
 * Wizard State Manager & Engine
 * Handles step navigation, data persistence, and mock API calls
 */

let wizard = null;

class SolarWizard {
  constructor() {
    this.totalSteps = 6; // Steps 1-5: Questions, Step 6: Review
    this.sessionData = this.loadSessionData();
    this.currentStep = this.sessionData.currentStep || 1;
    if (this.currentStep > this.totalSteps) {
      this.currentStep = this.totalSteps;
    }
    this.roofs = this.sessionData.step1.roofs || [];
    this.selectedGeometryRoofIndex = this.sessionData.step2.q2_geometry.roofIndex;
    this.selectedUsabilityRoofIndex = this.sessionData.step2.q3_shading.roofIndex;
    if (this.roofs.length > 0) {
      if (this.selectedGeometryRoofIndex == null) {
        this.setGeometryRoof(0);
      }
      if (this.selectedUsabilityRoofIndex == null) {
        this.setUsabilityRoof(0);
      }
    }
  }

  // ============ STEP DEFINITIONS ============
  getStepDefinition(stepNum) {
    const steps = {
      1: { title: "Appliance Usage", subtitle: "Select appliances and usage type" },
      2: { title: "Electricity Bill", subtitle: "Monthly or annual usage" },
      3: { title: "Electricity Tariff", subtitle: "Price per kWh" },
      4: { title: "Grid Export", subtitle: "Permission to export to grid" },
      5: { title: "System Preference", subtitle: "Choose system type" },
      6: { title: "Review & Save", subtitle: "Confirm all data before saving" }
    };
    return steps[stepNum] || {};
  }

  // ============ NAVIGATION ============
  nextStep() {
    if (this.currentStep < this.totalSteps) {
      if (this.validateCurrentStep()) {
        this.currentStep++;
        this.saveSessionData();
        return true;
      }
      return false;
    }
    return false;
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.saveSessionData();
      return true;
    }
    return false;
  }

  goToStep(stepNum) {
    if (stepNum >= 1 && stepNum <= this.totalSteps) {
      this.currentStep = stepNum;
      this.saveSessionData();
      return true;
    }
    return false;
  }

  // ============ VALIDATION ============
  validateCurrentStep() {
    switch (this.currentStep) {
      case 1: return this.validateStep4(); // Appliances
      case 2: return this.validateStep5(); // Electricity Bill
      case 3: return this.validateStep6(); // Tariff
      case 4: return this.validateStep7(); // Grid export
      case 5: return this.validateStep8(); // System type
      case 6: return this.validateStep9(); // Review & save (full validation)
      default: return true;
    }
  }

  validateStep1() {
    const loc = this.sessionData.step2.q1_location;
    return this.roofs.length > 0 && loc.lat != null && loc.lon != null;
  }

  validateStep2() {
    const geo = this.sessionData.step2.q2_geometry;
    return geo.roofIndex != null && this.getRoofByIndex(geo.roofIndex) != null;
  }

  validateStep3() {
    const shading = this.sessionData.step2.q3_shading;
    // With per-roof ratios, just verify we have roofs and byRoof data
    if (this.roofs.length === 0) return false;
    this.initPerRoofShading();
    // Check that all roofs have valid shading data
    for (let i = 0; i < this.roofs.length; i++) {
      const roofShading = shading.byRoof[i];
      if (!roofShading) return false;
      if (shading.method === 'ratio' && roofShading.ratio == null) return false;
      if (shading.method === 'level' && !roofShading.level) return false;
    }
    return true;
  }

  validateStep4() {
    return this.sessionData.step2.q4_appliances.length > 0;
  }

  validateStep5() {
    const bill = this.sessionData.step2.q5_bill;
    return bill.monthly_kwh != null || bill.annual_kwh != null;
  }

  validateStep6() {
    return this.sessionData.step2.q6_tariff.price != null;
  }

  validateStep7() {
    return this.sessionData.step2.q7_export.allowed != null;
  }

  validateStep8() {
    return !!this.sessionData.step2.q8_system.type;
  }

  validateStep9() {
    return (
      this.validateStep1() &&
      this.validateStep2() &&
      this.validateStep3() &&
      this.validateStep4() &&
      this.validateStep5() &&
      this.validateStep6() &&
      this.validateStep7() &&
      this.validateStep8()
    );
  }

  // ============ DATA MANAGEMENT ============
  loadSessionData() {
    const stored = localStorage.getItem('solar_wizard_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return this.normalizeSessionData(parsed);
      } catch (e) {
        console.warn('Failed to parse session data', e);
      }
    }
    return this.getDefaultSessionData();
  }

  normalizeSessionData(data) {
    const defaults = this.getDefaultSessionData();
    if (!data || typeof data !== 'object') return defaults;

    if (!data.step1 || !data.step2) {
      const legacy = {
        latitude: data.latitude,
        longitude: data.longitude,
        locationName: data.locationName,
        roofs: data.roofs || [],
        shadingRatio: data.shadingRatio,
        appliances: data.appliances || [],
        monthlyKwh: data.monthlyKwh,
        annualKwh: data.annualKwh,
        tariff: data.tariff,
        currency: data.currency,
        gridExport: data.gridExport,
        systemType: data.systemType
      };
      return this.migrateLegacySession(legacy, defaults, data.currentStep);
    }

    return {
      ...defaults,
      ...data,
      step1: { ...defaults.step1, ...data.step1 },
      step2: {
        ...defaults.step2,
        ...data.step2,
        q1_location: { ...defaults.step2.q1_location, ...data.step2.q1_location },
        q2_geometry: { ...defaults.step2.q2_geometry, ...data.step2.q2_geometry },
        q3_shading: { ...defaults.step2.q3_shading, ...data.step2.q3_shading, byRoof: data.step2.q3_shading?.byRoof || [] },
        q4_appliances: data.step2.q4_appliances || [],
        q5_bill: { ...defaults.step2.q5_bill, ...data.step2.q5_bill },
        q6_tariff: { ...defaults.step2.q6_tariff, ...data.step2.q6_tariff },
        q7_export: { ...defaults.step2.q7_export, ...data.step2.q7_export },
        q8_system: { ...defaults.step2.q8_system, ...data.step2.q8_system }
      }
    };
  }

  migrateLegacySession(legacy, defaults, currentStep) {
    const lat = legacy.latitude ?? null;
    const lon = legacy.longitude ?? null;
    const shadingRatio = legacy.shadingRatio ?? defaults.step2.q3_shading.ratio;
    const gridAllowed = legacy.gridExport ? legacy.gridExport === 'yes' : defaults.step2.q7_export.allowed;
    const systemType = legacy.systemType || defaults.step2.q8_system.type;

    return {
      ...defaults,
      currentStep: currentStep || 1,
      step1: {
        location: { lat, lon, address: legacy.locationName || '' },
        roofs: legacy.roofs || []
      },
      step2: {
        ...defaults.step2,
        q1_location: { lat, lon },
        q2_geometry: defaults.step2.q2_geometry,
        q3_shading: { ...defaults.step2.q3_shading, ratio: shadingRatio },
        q4_appliances: legacy.appliances || [],
        q5_bill: {
          monthly_kwh: legacy.monthlyKwh ?? null,
          annual_kwh: legacy.annualKwh ?? null
        },
        q6_tariff: {
          price: legacy.tariff ?? defaults.step2.q6_tariff.price,
          currency: legacy.currency || defaults.step2.q6_tariff.currency
        },
        q7_export: { allowed: gridAllowed },
        q8_system: { type: systemType }
      }
    };
  }

  getDefaultSessionData() {
    return {
      currentStep: 1,
      sessionId: this.generateSessionId(),
      step1: {
        location: { lat: null, lon: null, address: '' },
        roofs: []
      },
      step2: {
        q1_location: { lat: null, lon: null },
        q2_geometry: { tilt: null, azimuth: null, area: null, roofIndex: null },
        q3_shading: { method: 'ratio', ratio: 0.8, level: null, roofIndex: null, byRoof: [] },
        q4_appliances: [],
        q5_bill: { monthly_kwh: null, annual_kwh: null },
        q6_tariff: { price: 4.5, currency: 'THB' },
        q7_export: { allowed: true, price: null },
        q8_system: { type: 'auto' }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  generateSessionId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  saveSessionData() {
    this.sessionData.currentStep = this.currentStep;
    this.sessionData.step1.roofs = this.roofs;
    this.sessionData.updatedAt = new Date().toISOString();
    localStorage.setItem('solar_wizard_session', JSON.stringify(this.sessionData));
  }

  clearSessionData() {
    localStorage.removeItem('solar_wizard_session');
    this.sessionData = this.getDefaultSessionData();
    this.roofs = [];
    this.currentStep = 1;
  }

  // ============ ROOF MANAGEMENT ============
  setRoofs(roofList) {
    this.roofs = roofList || [];
    this.sessionData.step1.roofs = this.roofs;
    if (this.roofs.length > 0) {
      if (this.selectedGeometryRoofIndex == null || this.selectedGeometryRoofIndex >= this.roofs.length) {
        this.setGeometryRoof(0);
      }
      if (this.selectedUsabilityRoofIndex == null || this.selectedUsabilityRoofIndex >= this.roofs.length) {
        this.setUsabilityRoof(0);
      }
    } else {
      this.selectedGeometryRoofIndex = null;
      this.selectedUsabilityRoofIndex = null;
    }
    this.saveSessionData();
  }

  getRoofByIndex(index) {
    return this.roofs[index] || null;
  }

  setGeometryRoof(index) {
    const roof = this.getRoofByIndex(index);
    if (!roof) return null;
    this.selectedGeometryRoofIndex = index;
    this.sessionData.step2.q2_geometry = {
      tilt: roof.tilt,
      azimuth: roof.azimuth,
      area: roof.area,
      roofIndex: index
    };
    this.saveSessionData();
    return roof;
  }

  setUsabilityRoof(index) {
    const roof = this.getRoofByIndex(index);
    if (!roof) return null;
    this.selectedUsabilityRoofIndex = index;
    this.sessionData.step2.q3_shading.roofIndex = index;
    this.saveSessionData();
    return roof;
  }

  // ============ MOCK API CALLS ============
  async analyzeRoof(boundaries) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const roofs = (boundaries || []).map((boundary, index) => {
          const polygon = this.convertBoundaryToLatLon(boundary);
          const area = this.getMockArea(index);
          return {
            polygon: polygon,
            tilt: this.getMockTilt(index),
            azimuth: this.getMockAzimuth(index),
            area: area,
            index: index
          };
        });

        const center = roofs.length > 0 ? this.getPolygonCenter(roofs[0].polygon) : { lat: null, lon: null };
        this.sessionData.step1.location = {
          lat: center.lat,
          lon: center.lon,
          address: this.sessionData.step1.location.address || 'Analyzed Location'
        };
        this.setLocationData(center.lat, center.lon, this.sessionData.step1.location.address);
        this.setRoofs(roofs);

        resolve({
          roofs: roofs,
          house_lat: center.lat,
          house_lon: center.lon
        });
      }, 1200);
    });
  }

  async saveDataset(name) {
    // Get current user from localStorage
    const authData = sessionStorage.getItem('solar_auth_user');
    let userId = null;

    if (authData) {
      try {
        const user = JSON.parse(authData);
        userId = user.id;
      } catch (e) {
        console.warn('Failed to parse auth data');
      }
    }

    // If no user logged in, fall back to localStorage (demo mode)
    if (!userId) {
      return this.saveDatasetLocal(name);
    }

    // Prepare project data for API
    const projectData = {
      user_id: userId,
      name: name || `Project ${new Date().toLocaleDateString()}`,
      latitude: this.sessionData.step2.q1_location.lat,
      longitude: this.sessionData.step2.q1_location.lon,
      address: this.sessionData.step1.location.address,
      shading_method: this.sessionData.step2.q3_shading.method,
      shading_ratio: this.sessionData.step2.q3_shading.ratio,
      shading_level: this.sessionData.step2.q3_shading.level,
      monthly_kwh: this.sessionData.step2.q5_bill.monthly_kwh,
      annual_kwh: this.sessionData.step2.q5_bill.annual_kwh,
      tariff_price: this.sessionData.step2.q6_tariff.price,
      tariff_currency: this.sessionData.step2.q6_tariff.currency,
      grid_export_allowed: this.sessionData.step2.q7_export.allowed,
      grid_export_price: this.sessionData.step2.q7_export.price,
      system_type: this.sessionData.step2.q8_system.type,
      selected_roof_index: this.sessionData.step2.q2_geometry.roofIndex || 0,
      roofs: this.roofs.map((roof, i) => {
        const roofShading = this.getRoofShading(i);
        return {
          index: roof.index ?? i,
          tilt: roof.tilt,
          azimuth: roof.azimuth,
          area: roof.area,
          panel_width: roof.panel_width,
          panel_height: roof.panel_height,
          panel_area: roof.panel_area,
          color_name: roof.color_name,
          is_flat: roof.is_flat,
          needs_user_input: roof.needs_user_input,
          user_tilt: roof.user_tilt,
          user_azimuth: roof.user_azimuth,
          polygon: roof.polygon || [],
          usable_ratio: roofShading.ratio,
          shading_level: roofShading.level
        };
      }),
      appliances: this.sessionData.step2.q4_appliances.map(app => ({
        name: app.name,
        power: app.power,
        quantity: app.quantity || 1,
        usage_start: app.usage_start || '06:00',
        usage_end: app.usage_end || '22:00'
      }))
    };

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save project');
      }

      return {
        id: result.project.id,
        timestamp: result.project.created_at,
        success: true,
        project: result.project
      };
    } catch (error) {
      console.error('Error saving project:', error);
      // Fall back to localStorage on error
      return this.saveDatasetLocal(name);
    }
  }

  // Fallback method for demo mode (no user logged in)
  saveDatasetLocal(name) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const timestamp = new Date().toISOString();
        const dataset = {
          id: `dataset_${Date.now()}`,
          name: name,
          timestamp: timestamp,
          roofData: this.sessionData.step1,
          inputs: this.sessionData.step2
        };

        const datasets = JSON.parse(localStorage.getItem('solar_saved_datasets') || '[]');
        datasets.push(dataset);
        localStorage.setItem('solar_saved_datasets', JSON.stringify(datasets));

        resolve({ id: dataset.id, timestamp: timestamp, success: true, dataset: dataset });
      }, 100);
    });
  }

  async loadDatasets() {
    // Get current user from localStorage
    const authData = sessionStorage.getItem('solar_auth_user');
    let userId = null;

    if (authData) {
      try {
        const user = JSON.parse(authData);
        userId = user.id;
      } catch (e) {
        console.warn('Failed to parse auth data');
      }
    }

    // If no user logged in, fall back to localStorage (demo mode)
    if (!userId) {
      return this.loadDatasetsLocal();
    }

    try {
      const response = await fetch(`/api/projects?user_id=${userId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load projects');
      }

      // Transform projects to dataset format for compatibility
      const datasets = result.projects.map(project => ({
        id: project.id,
        name: project.name,
        timestamp: project.created_at,
        roofData: {
          location: project.location,
          roofs: project.roofs
        },
        inputs: {
          q1_location: { lat: project.location.lat, lon: project.location.lon },
          q2_geometry: {
            tilt: project.roofs[0]?.tilt,
            azimuth: project.roofs[0]?.azimuth,
            area: project.roofs[0]?.area,
            roofIndex: project.selected_roof_index
          },
          q3_shading: project.shading,
          q4_appliances: project.appliances,
          q5_bill: project.bill,
          q6_tariff: project.tariff,
          q7_export: project.grid_export,
          q8_system: project.system
        }
      }));

      return { datasets };
    } catch (error) {
      console.error('Error loading projects:', error);
      // Fall back to localStorage on error
      return this.loadDatasetsLocal();
    }
  }

  // Fallback method for demo mode
  loadDatasetsLocal() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const datasets = JSON.parse(localStorage.getItem('solar_saved_datasets') || '[]');
        resolve({ datasets: datasets });
      }, 100);
    });
  }

  async deleteDataset(datasetId) {
    // Get current user from localStorage
    const authData = sessionStorage.getItem('solar_auth_user');
    let userId = null;

    if (authData) {
      try {
        const user = JSON.parse(authData);
        userId = user.id;
      } catch (e) {
        console.warn('Failed to parse auth data');
      }
    }

    // If this is a database project (numeric id), use API
    if (userId && typeof datasetId === 'number') {
      try {
        const response = await fetch(`/api/projects/${datasetId}`, {
          method: 'DELETE'
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to delete project');
        }

        return { success: true };
      } catch (error) {
        console.error('Error deleting project:', error);
        return { success: false, error: error.message };
      }
    }

    // Fall back to localStorage deletion
    return new Promise((resolve) => {
      const datasets = JSON.parse(localStorage.getItem('solar_saved_datasets') || '[]');
      const filtered = datasets.filter(d => d.id !== datasetId);
      localStorage.setItem('solar_saved_datasets', JSON.stringify(filtered));
      resolve({ success: true });
    });
  }

  // ============ STEP DATA GETTERS/SETTERS ============
  setLocationData(latitude, longitude, locationName) {
    const parsedLat = latitude != null ? parseFloat(latitude) : null;
    const parsedLon = longitude != null ? parseFloat(longitude) : null;
    const lat = Number.isFinite(parsedLat) ? parsedLat : null;
    const lon = Number.isFinite(parsedLon) ? parsedLon : null;
    this.sessionData.step1.location = { lat: lat, lon: lon, address: locationName || '' };
    this.sessionData.step2.q1_location = { lat: lat, lon: lon };
    this.saveSessionData();
  }

  setShadingMethod(method) {
    const shading = this.sessionData.step2.q3_shading;
    shading.method = method;
    if (method === 'ratio' && shading.ratio == null) {
      shading.ratio = 0.8;
    }
    if (method === 'level' && !shading.level) {
      shading.level = 'medium';
    }
    this.saveSessionData();
  }

  setShadingRatio(ratio) {
    this.sessionData.step2.q3_shading.method = 'ratio';
    const value = parseFloat(ratio);
    this.sessionData.step2.q3_shading.ratio = Number.isFinite(value) ? value : null;
    this.saveSessionData();
  }

  setShadingLevel(level) {
    this.sessionData.step2.q3_shading.method = 'level';
    this.sessionData.step2.q3_shading.level = level;
    this.saveSessionData();
  }

  // Per-roof shading ratio methods
  initPerRoofShading() {
    const shading = this.sessionData.step2.q3_shading;
    if (!shading.byRoof) shading.byRoof = [];

    // Ensure byRoof array matches roof count
    while (shading.byRoof.length < this.roofs.length) {
      shading.byRoof.push({ ratio: 0.8, level: 'medium' });
    }
    // Trim if roofs were removed
    if (shading.byRoof.length > this.roofs.length && this.roofs.length > 0) {
      shading.byRoof = shading.byRoof.slice(0, this.roofs.length);
    }
    this.saveSessionData();
  }

  setRoofShadingRatio(roofIndex, ratio) {
    this.initPerRoofShading();
    const shading = this.sessionData.step2.q3_shading;
    if (roofIndex >= 0 && roofIndex < shading.byRoof.length) {
      const value = parseFloat(ratio);
      shading.byRoof[roofIndex].ratio = Number.isFinite(value) ? value : 0.8;
      // Update global ratio to selected roof's ratio (backward compat)
      if (roofIndex === shading.roofIndex) {
        shading.ratio = shading.byRoof[roofIndex].ratio;
      }
      this.saveSessionData();
    }
  }

  setRoofShadingLevel(roofIndex, level) {
    this.initPerRoofShading();
    const shading = this.sessionData.step2.q3_shading;
    if (roofIndex >= 0 && roofIndex < shading.byRoof.length) {
      shading.byRoof[roofIndex].level = level;
      // Update global level to selected roof's level (backward compat)
      if (roofIndex === shading.roofIndex) {
        shading.level = shading.byRoof[roofIndex].level;
      }
      this.saveSessionData();
    }
  }

  getRoofShading(roofIndex) {
    this.initPerRoofShading();
    const shading = this.sessionData.step2.q3_shading;
    if (roofIndex >= 0 && roofIndex < shading.byRoof.length) {
      return shading.byRoof[roofIndex];
    }
    return { ratio: 0.8, level: 'medium' };
  }

  getAverageUsableRatio() {
    this.initPerRoofShading();
    const byRoof = this.sessionData.step2.q3_shading.byRoof;
    if (byRoof.length === 0) return 0.8;
    const sum = byRoof.reduce((acc, r) => acc + (r.ratio || 0.8), 0);
    return sum / byRoof.length;
  }

  addAppliance(appliance) {
    const list = this.sessionData.step2.q4_appliances;
    list.push(appliance);
    this.saveSessionData();
  }

  removeAppliance(index) {
    const list = this.sessionData.step2.q4_appliances;
    if (index >= 0 && index < list.length) {
      list.splice(index, 1);
      this.saveSessionData();
    }
  }

  updateAppliance(index, updates) {
    const list = this.sessionData.step2.q4_appliances;
    if (index >= 0 && index < list.length) {
      const appliance = list[index];
      if (updates.name !== undefined) {
        appliance.name = updates.name;
      }
      if (updates.power !== undefined) {
        const power = parseInt(updates.power, 10);
        if (Number.isFinite(power) && power > 0) {
          appliance.power = power;
        }
      }
      if (updates.usage_start !== undefined) {
        appliance.usage_start = updates.usage_start;
      }
      if (updates.usage_end !== undefined) {
        appliance.usage_end = updates.usage_end;
      }
      this.saveSessionData();
    }
  }

  setBillUsage(monthlyKwh, annualKwh) {
    const bill = this.sessionData.step2.q5_bill;
    const monthly = monthlyKwh != null && monthlyKwh !== '' ? parseFloat(monthlyKwh) : null;
    const annual = annualKwh != null && annualKwh !== '' ? parseFloat(annualKwh) : null;
    bill.monthly_kwh = Number.isFinite(monthly) ? monthly : null;
    bill.annual_kwh = Number.isFinite(annual) ? annual : null;
    this.saveSessionData();
  }

  setTariff(tariff, currency) {
    const price = parseFloat(tariff);
    this.sessionData.step2.q6_tariff.price = Number.isFinite(price) ? price : null;
    this.sessionData.step2.q6_tariff.currency = currency;
    this.saveSessionData();
  }

  setGridExportAllowed(allowed) {
    this.sessionData.step2.q7_export.allowed = allowed;
    this.saveSessionData();
  }

  setGridExportPrice(price) {
    const val = parseFloat(price);
    this.sessionData.step2.q7_export.price = Number.isFinite(val) ? val : null;
    this.saveSessionData();
  }

  setSystemType(type) {
    this.sessionData.step2.q8_system.type = type;
    this.saveSessionData();
  }

  // ============ DATA SUMMARY ============
  getSummary() {
    const geometry = this.sessionData.step2.q2_geometry;
    const roof = geometry.roofIndex != null ? this.getRoofByIndex(geometry.roofIndex) : null;
    return {
      location: {
        latitude: this.sessionData.step2.q1_location.lat,
        longitude: this.sessionData.step2.q1_location.lon,
        name: this.sessionData.step1.location.address
      },
      roof: roof ? {
        area: roof.area,
        tilt: roof.tilt,
        azimuth: roof.azimuth,
        index: roof.index
      } : null,
      shading: this.sessionData.step2.q3_shading,
      appliances: this.sessionData.step2.q4_appliances,
      usage: this.sessionData.step2.q5_bill,
      tariff: this.sessionData.step2.q6_tariff,
      gridExport: this.sessionData.step2.q7_export,
      systemType: this.sessionData.step2.q8_system
    };
  }

  // ============ HELPERS ============
  convertBoundaryToLatLon(boundary) {
    if (!window.Cesium || !boundary) return [];
    return boundary.map((point) => {
      const carto = Cesium.Cartographic.fromCartesian(point);
      return {
        lat: Cesium.Math.toDegrees(carto.latitude),
        lon: Cesium.Math.toDegrees(carto.longitude),
        height: carto.height || 0
      };
    });
  }

  getPolygonCenter(polygon) {
    if (!polygon || polygon.length === 0) return { lat: null, lon: null };
    const sum = polygon.reduce((acc, p) => ({
      lat: acc.lat + p.lat,
      lon: acc.lon + p.lon
    }), { lat: 0, lon: 0 });
    return {
      lat: sum.lat / polygon.length,
      lon: sum.lon / polygon.length
    };
  }

  getMockArea(index) {
    return Math.round((Math.random() * 50 + 10 + index * 2) * 100) / 100;
  }

  getMockTilt(index) {
    return Math.round((Math.random() * 30 + 15 + index) * 10) / 10;
  }

  getMockAzimuth(index) {
    return Math.round((Math.random() * 180 + 90 + index) * 10) / 10;
  }
}

// wizard instance is initialized in main.js
function initWizard() {
  wizard = new SolarWizard();
  return wizard;
}

function getWizard() {
  if (!wizard) {
    wizard = initWizard();
  }
  return wizard;
}
