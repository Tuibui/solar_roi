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

    // Precompute trig and origin once — location never changes per instance
    const latRad = Cesium.Math.toRadians(houseLocation.lat);
    const lonRad = Cesium.Math.toRadians(houseLocation.lon);
    this._cosLat = Math.cos(latRad);
    this._sinLat = Math.sin(latRad);
    this._cosLon = Math.cos(lonRad);
    this._sinLon = Math.sin(lonRad);
    this._originEcef = Cesium.Cartesian3.fromDegrees(
      houseLocation.lon,
      houseLocation.lat,
      houseLocation.height || 0
    );
  }

  /**
   * Transform Three.js local point to Cesium ECEF world coordinate
   */
  localToEcef(localPoint, roofMatrixWorld) {
    const worldPos = localPoint.clone().applyMatrix4(roofMatrixWorld);

    const east  =  worldPos.x;
    const north = -worldPos.z;
    const up    =  worldPos.y;

    const { _cosLat: cosLat, _sinLat: sinLat, _cosLon: cosLon, _sinLon: sinLon, _originEcef: origin } = this;

    const dx = -sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up;
    const dy =  cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up;
    const dz =  cosLat * north + sinLat * up;

    return new Cesium.Cartesian3(
      origin.x + dx,
      origin.y + dy,
      origin.z + dz
    );
  }

  /**
   * Get sun direction for a specific date/time
   * Does NOT mutate viewer.clock — pure computation only.
   */
  getSunDirection(dateTime) {
    const julianDate = Cesium.JulianDate.fromDate(dateTime);

    try {
      const sunInertial = Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(julianDate);
      const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(julianDate);

      if (icrfToFixed) {
        const sunEcef = Cesium.Matrix3.multiplyByVector(icrfToFixed, sunInertial, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(sunEcef, sunEcef);
        return sunEcef;
      }
    } catch (e) {
      // Fallback to approximate
    }

    return this.approximateSunDirection(dateTime);
  }

  /**
   * Fallback approximate sun direction (uses precomputed trig from constructor)
   */
  approximateSunDirection(dateTime) {
    const hour = dateTime.getUTCHours() + dateTime.getUTCMinutes() / 60
                 + this.houseLocation.lon / 15; // approx local solar time
    const dayOfYear = Math.floor(
      (dateTime - new Date(Date.UTC(dateTime.getUTCFullYear(), 0, 1))) / 86400000
    ) + 1;
    const declination = 23.45 * Math.sin(Cesium.Math.toRadians((360 / 365) * (dayOfYear - 81)));

    const hourAngle = Cesium.Math.toRadians((hour - 12) * 15);
    const decRad    = Cesium.Math.toRadians(declination);

    const { _cosLat: cosLat, _sinLat: sinLat, _cosLon: cosLon, _sinLon: sinLon } = this;
    const sinDec  = Math.sin(decRad);
    const cosDec  = Math.cos(decRad);
    const sinHour = Math.sin(hourAngle);
    const cosHour = Math.cos(hourAngle);

    const sinAltitude = sinLat * sinDec + cosLat * cosDec * cosHour;
    const cosAltitude = Math.sqrt(1 - sinAltitude * sinAltitude);

    if (cosAltitude < 0.001) {
      return new Cesium.Cartesian3(0, 0, -1); // Night time
    }

    const sinAzimuth = -(cosDec * sinHour) / cosAltitude;
    const cosAzimuth = (sinDec - sinLat * sinAltitude) / (cosLat * cosAltitude);

    const east  = -sinAzimuth * cosAltitude;
    const north = -cosAzimuth * cosAltitude;
    const up    =  sinAltitude;

    const x = -sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up;
    const y =  cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up;
    const z =  cosLat * north + sinLat * up;

    return new Cesium.Cartesian3(x, y, z);
  }

  /**
   * Cast ray from roof point toward sun — synchronous, uses current frame geometry.
   * Requires tiles to already be loaded (allTilesLoaded awaited by caller).
   * Fix #1: replaced async pickFromRayMostDetailed (1 GPU render pass/call) with
   *         sync pickFromRay (uses already-rendered frame, ~100× faster per ray).
   */
  castRay(pointEcef, sunDirection) {
    // If no OSM tileset, assume no shading
    if (!this.osmTileset) {
      return { isShaded: false, noTileset: true };
    }

    // Offset ray origin along sun direction to avoid self-intersection with roof surface
    const offset = Cesium.Cartesian3.multiplyByScalar(sunDirection, 1.5, new Cesium.Cartesian3());
    const origin = Cesium.Cartesian3.add(pointEcef, offset, new Cesium.Cartesian3());

    const ray = new Cesium.Ray(origin, sunDirection);

    try {
      const result = this.viewer.scene.pickFromRay(ray, []);

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
   * sin(solar altitude) = ECEF sun direction dotted with local up vector.
   * Used as irradiance weight: rays near horizon contribute less energy.
   * Fix #9 helper.
   */
  _sinSolarAltitude(sunDir) {
    const { _cosLat: cosLat, _sinLat: sinLat, _cosLon: cosLon, _sinLon: sinLon } = this;
    return cosLat * cosLon * sunDir.x
         + cosLat * sinLon * sunDir.y
         + sinLat           * sunDir.z;
  }

  /**
   * Check if sun is above horizon (uses precomputed trig from constructor)
   */
  isSunAboveHorizon(sunDirection) {
    const { _cosLat: cosLat, _sinLat: sinLat, _cosLon: cosLon, _sinLon: sinLon } = this;
    // ECEF dot local-up = sin(elevation)
    const up = cosLat * cosLon * sunDirection.x
             + cosLat * sinLon * sunDirection.y
             + sinLat           * sunDirection.z;
    return up > 0;
  }

  /**
   * Analyze single point at multiple times throughout a day.
   * Returns irradiance-weighted shading ratio (0 = always sunlit, 1 = always shaded).
   * Fix #9: weights each hour by sin(altitude) so noon counts more than 8 am.
   */
  analyzePointDaily(localPoint, roofMatrixWorld, date, pointEcef = null) {
    const sampleHours = [8, 10, 12, 14, 16]; // Key solar hours

    // Compute ECEF once — position doesn't change between hours
    const ecef = pointEcef ?? this.localToEcef(localPoint, roofMatrixWorld);

    let shadedWeight = 0;
    let totalWeight  = 0;

    for (const hour of sampleHours) {
      const dateTime = new Date(date);
      dateTime.setUTCHours(hour, 0, 0, 0);

      const sunDir = this.getSunDirection(dateTime);
      const sinAlt = this._sinSolarAltitude(sunDir);

      if (sinAlt <= 0) continue; // sun below horizon

      const result = this.castRay(ecef, sunDir);

      totalWeight  += sinAlt;
      if (result.isShaded) shadedWeight += sinAlt;
    }

    if (totalWeight === 0) return 1; // sun never rose — fully shaded
    return shadedWeight / totalWeight;
  }

  /**
   * Compute monthly shading by sampling representative days.
   *
   * Fix #1 + #9 — time-first loop with irradiance-weighted accumulation:
   *   • Precompute all ECEFs once (S transforms total, not S×T×H).
   *   • Outer loop = time slots (days × hours): share the getSunDirection()
   *     cost across every sample at the same time.
   *   • castRay is now synchronous — no GPU render pass per call.
   *   • Weight each time slot by sin(altitude) so noon outweighs 8 am.
   *   • Yield once per time slot (not per sample) → fewer awaits, smoother UI.
   */
  /**
   * Return 4 sampling days for a given month centered on the ISO/Klein (1977)
   * representative day — the day whose solar declination equals the monthly mean.
   * Days are spaced ±7 around the ISO day and clamped to [1, daysInMonth].
   */
  _representativeDays(month, year) {
    // Klein (1977) ISO representative day-of-month per month (1-indexed)
    const ISO_DAY = [17, 16, 16, 15, 15, 11, 17, 16, 15, 15, 14, 10];
    const center = ISO_DAY[month - 1];
    const daysInMonth = new Date(year, month, 0).getDate(); // JS: month is 1-based here

    const clamp = d => Math.min(Math.max(d, 1), daysInMonth);
    return [
      clamp(center - 10),
      clamp(center - 3),
      clamp(center + 4),
      clamp(center + 11)
    ];
  }

  async computeMonthlyShading(samples, roofMatrixWorld, month, year, progressCallback) {
    const DAYS  = this._representativeDays(month, year); // Klein (1977) ISO days
    const HOURS = [8, 10, 12, 14, 16]; // 5 solar hours

    // Precompute ECEF for every sample point — reused across all time slots
    const ecefs = samples.map(s => this.localToEcef(s.local, roofMatrixWorld));

    const shadedWeight = new Float64Array(samples.length);
    const totalWeight  = new Float64Array(samples.length);

    const maxTimeSlots = DAYS.length * HOURS.length; // ≤ 20
    let completedSlots = 0;

    for (const day of DAYS) {
      for (const hour of HOURS) {
        const dt     = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
        const sunDir = this.getSunDirection(dt);
        const sinAlt = this._sinSolarAltitude(sunDir);

        if (sinAlt > 0) {
          // All samples share the same sunDir — cast synchronously
          for (let i = 0; i < ecefs.length; i++) {
            const hit = this.castRay(ecefs[i], sunDir);
            totalWeight[i]  += sinAlt;
            if (hit.isShaded) shadedWeight[i] += sinAlt;
          }
        }

        completedSlots++;
        if (progressCallback) {
          progressCallback(completedSlots * samples.length, maxTimeSlots * samples.length);
        }

        // Yield once per time slot to keep UI responsive
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }

    return samples.map((sample, i) => {
      const shadingRatio = totalWeight[i] > 0
        ? shadedWeight[i] / totalWeight[i]
        : 1; // sun never rose — assume fully shaded
      return {
        local: sample.local,
        normal: sample.normal,
        uv: sample.uv,
        shadingRatio,
        isShaded: shadingRatio > 0.3
      };
    });
  }

  /**
   * Simple single-time analysis (for backwards compatibility).
   * Now synchronous — castRay no longer async.
   */
  analyzeSample(sample, roofMatrixWorld, sunDirection) {
    const pointEcef = this.localToEcef(sample.local, roofMatrixWorld);
    const rayResult = this.castRay(pointEcef, sunDirection);

    return {
      local: sample.local,
      normal: sample.normal,
      uv: sample.uv,
      isShaded: rayResult.isShaded,
      hitDistance: rayResult.distance
    };
  }

  /**
   * Compute shading for all samples at a single point in time.
   * Fix #1: synchronous castRay — no Promise.all batching needed.
   * Yields once per batchSize iterations to keep the UI responsive.
   */
  async computeShading(samples, roofMatrixWorld, dateTime, progressCallback) {
    const sunDirection = this.getSunDirection(dateTime);
    const results = [];

    for (let i = 0; i < samples.length; i++) {
      results.push(this.analyzeSample(samples[i], roofMatrixWorld, sunDirection));

      if (progressCallback) progressCallback(results.length, samples.length);

      // Yield every batchSize samples to avoid blocking the main thread
      if (i % this.batchSize === this.batchSize - 1) {
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
