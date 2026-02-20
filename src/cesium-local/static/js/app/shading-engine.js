/**
 * ShadingEngine - Computes solar shading using Cesium ray casting against OSM buildings
 * Monthly aggregation version - computes average shading over representative days
 */

class ShadingEngine {
  constructor(cesiumViewer, osmTileset, houseLocation) {
    this.viewer = cesiumViewer;
    this.osmTileset = osmTileset;
    this.houseLocation = houseLocation;
    this.batchSize = 50;
  }

  /**
   * Transform Three.js local point to Cesium ECEF world coordinate
   */
  localToEcef(localPoint, roofMatrixWorld) {
    const worldPos = localPoint.clone().applyMatrix4(roofMatrixWorld);
    
    const enu = {
      east: worldPos.x,
      north: -worldPos.z,
      up: worldPos.y
    };
    
    const originEcef = Cesium.Cartesian3.fromDegrees(
      this.houseLocation.lon,
      this.houseLocation.lat,
      this.houseLocation.height || 0
    );
    
    const latRad = Cesium.Math.toRadians(this.houseLocation.lat);
    const lonRad = Cesium.Math.toRadians(this.houseLocation.lon);
    
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const cosLon = Math.cos(lonRad);
    const sinLon = Math.sin(lonRad);
    
    const dx = -sinLon * enu.east - sinLat * cosLon * enu.north + cosLat * cosLon * enu.up;
    const dy = cosLon * enu.east - sinLat * sinLon * enu.north + cosLat * sinLon * enu.up;
    const dz = cosLat * enu.north + sinLat * enu.up;
    
    return new Cesium.Cartesian3(
      originEcef.x + dx,
      originEcef.y + dy,
      originEcef.z + dz
    );
  }

  /**
   * Get sun direction for a specific date/time
   */
  getSunDirection(dateTime) {
    const julianDate = Cesium.JulianDate.fromDate(dateTime);
    this.viewer.clock.currentTime = julianDate;
    
    try {
      const sunInertial = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(julianDate);
      const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(julianDate);
      
      if (icrfToFixed) {
        const sunEcef = Cesium.Matrix3.multiplyByVector(icrfToFixed, sunInertial, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(sunEcef, sunEcef);
        return sunEcef;
      }
    } catch (e) {
      // Fallback
    }
    
    return this.approximateSunDirection(dateTime);
  }

  /**
   * Fallback approximate sun direction
   */
  approximateSunDirection(dateTime) {
    const hour = dateTime.getHours() + dateTime.getMinutes() / 60;
    const dayOfYear = Math.floor((dateTime - new Date(dateTime.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const declination = 23.45 * Math.sin(Cesium.Math.toRadians((360 / 365) * (dayOfYear - 81)));
    
    const latRad = Cesium.Math.toRadians(this.houseLocation.lat);
    const lonRad = Cesium.Math.toRadians(this.houseLocation.lon);
    const hourAngle = Cesium.Math.toRadians((hour - 12) * 15);
    const decRad = Cesium.Math.toRadians(declination);
    
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinDec = Math.sin(decRad);
    const cosDec = Math.cos(decRad);
    const sinHour = Math.sin(hourAngle);
    const cosHour = Math.cos(hourAngle);
    
    const sinAltitude = sinLat * sinDec + cosLat * cosDec * cosHour;
    const cosAltitude = Math.sqrt(1 - sinAltitude * sinAltitude);
    
    if (cosAltitude < 0.001) {
      return new Cesium.Cartesian3(0, 0, -1); // Night time
    }
    
    const sinAzimuth = -(cosDec * sinHour) / cosAltitude;
    const cosAzimuth = (sinDec - sinLat * sinAltitude) / (cosLat * cosAltitude);
    
    const east = -sinAzimuth * cosAltitude;
    const north = -cosAzimuth * cosAltitude;
    const up = sinAltitude;
    
    const cosLon = Math.cos(lonRad);
    const sinLon = Math.sin(lonRad);
    
    const x = -sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up;
    const y = cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up;
    const z = cosLat * north + sinLat * up;
    
    return new Cesium.Cartesian3(x, y, z);
  }

  /**
   * Cast ray from roof point toward sun
   */
  async castRay(pointEcef, sunDirection) {
    // If no OSM tileset, assume no shading
    if (!this.osmTileset) {
      return { isShaded: false, noTileset: true };
    }
    
    // Offset ray origin along sun direction to avoid self-intersection with roof surface
    const offset = Cesium.Cartesian3.multiplyByScalar(sunDirection, 1.5, new Cesium.Cartesian3());
    const origin = Cesium.Cartesian3.add(pointEcef, offset, new Cesium.Cartesian3());
    
    const ray = new Cesium.Ray(origin, sunDirection);
    
    try {
      // Do NOT exclude OSM tileset — it's what we want to detect.
      // This offscreen viewer has no Google tiles, so no self-intersection risk.
      const result = await this.viewer.scene.pickFromRayMostDetailed(ray, []);
      
      if (!result || !result.object) {
        return { isShaded: false };
      }
      
      const isOsmHit = result.object.tileset === this.osmTileset;
      const isValidHit = result.distance > 0.5;
      
      return {
        isShaded: isOsmHit && isValidHit,
        distance: result.distance
      };
    } catch (error) {
      return { isShaded: false, error: true };
    }
  }

  /**
   * Check if sun is above horizon
   */
  isSunAboveHorizon(sunDirection) {
    // Transform sun direction to local up frame
    const latRad = Cesium.Math.toRadians(this.houseLocation.lat);
    const lonRad = Cesium.Math.toRadians(this.houseLocation.lon);
    
    const cosLat = Math.cos(latRad);
    const sinLat = Math.sin(latRad);
    const cosLon = Math.cos(lonRad);
    const sinLon = Math.sin(lonRad);
    
    // ECEF to ENU
    const up = cosLat * cosLon * sunDirection.x + cosLat * sinLon * sunDirection.y + sinLat * sunDirection.z;
    
    return up > 0;
  }

  /**
   * Analyze single point at multiple times throughout a day
   * Returns shading ratio (0 = always sunlit, 1 = always shaded)
   */
  async analyzePointDaily(localPoint, roofMatrixWorld, date) {
    const sampleHours = [8, 10, 12, 14, 16]; // Key solar hours
    let shadedCount = 0;
    let validSamples = 0;
    
    for (const hour of sampleHours) {
      const dateTime = new Date(date);
      dateTime.setHours(hour, 0, 0, 0);
      
      const sunDir = this.getSunDirection(dateTime);
      
      // Skip if sun below horizon
      if (!this.isSunAboveHorizon(sunDir)) {
        continue;
      }
      
      validSamples++;
      const pointEcef = this.localToEcef(localPoint, roofMatrixWorld);
      const result = await this.castRay(pointEcef, sunDir);
      
      if (result.isShaded) {
        shadedCount++;
      }
    }
    
    if (validSamples === 0) return 1; // Night = fully shaded
    return shadedCount / validSamples;
  }

  /**
   * Compute monthly shading by sampling representative days
   */
  async computeMonthlyShading(samples, roofMatrixWorld, month, year, progressCallback) {
    const representativeDays = [1, 8, 15, 22]; // Sample 4 days per month
    const results = [];
    
    const totalOperations = samples.length * representativeDays.length;
    let completedOperations = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      let totalShading = 0;
      
      for (const day of representativeDays) {
        const date = new Date(year, month - 1, day);
        const dailyShading = await this.analyzePointDaily(sample.local, roofMatrixWorld, date);
        totalShading += dailyShading;
        
        completedOperations++;
        if (progressCallback) {
          progressCallback(completedOperations, totalOperations);
        }
      }
      
      const avgShading = totalShading / representativeDays.length;
      
      results.push({
        local: sample.local,
        normal: sample.normal,
        uv: sample.uv,
        shadingRatio: avgShading, // 0 = good (sunlit), 1 = bad (shaded)
        isShaded: avgShading > 0.3 // Threshold for "significantly shaded"
      });
      
      // Yield to prevent UI freeze
      if (i % 5 === 0 && i < samples.length - 1) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    
    return results;
  }

  /**
   * Simple single-time analysis (for backwards compatibility)
   */
  async analyzeSample(sample, roofMatrixWorld, sunDirection) {
    const pointEcef = this.localToEcef(sample.local, roofMatrixWorld);
    const rayResult = await this.castRay(pointEcef, sunDirection);
    
    return {
      local: sample.local,
      normal: sample.normal,
      uv: sample.uv,
      isShaded: rayResult.isShaded,
      hitDistance: rayResult.distance
    };
  }

  /**
   * Compute shading for all samples (batch - single time)
   */
  async computeShading(samples, roofMatrixWorld, dateTime, progressCallback) {
    const sunDirection = this.getSunDirection(dateTime);
    const results = [];
    
    for (let i = 0; i < samples.length; i += this.batchSize) {
      const batch = samples.slice(i, i + this.batchSize);
      
      const batchResults = await Promise.all(
        batch.map(sample => this.analyzeSample(sample, roofMatrixWorld, sunDirection))
      );
      
      results.push(...batchResults);
      
      if (progressCallback) {
        progressCallback(results.length, samples.length);
      }
      
      if (i + this.batchSize < samples.length) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }
    
    return results;
  }

  destroy() {
    this.viewer = null;
    this.osmTileset = null;
  }
}

window.ShadingEngine = ShadingEngine;
