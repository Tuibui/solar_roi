"""
Irradiation calculation module using PVGIS API.
Computes monthly POA (Plane of Array) irradiation for a given location and roof configuration.

PVGIS (Photovoltaic Geographical Information System) is provided by the European Commission
Joint Research Centre. It provides solar radiation data globally.

API Documentation: https://joint-research-centre.ec.europa.eu/pvgis-online-tool/getting-started-pvgis/api-non-interactive-service_en

Aggregation method: Area-weighted average for multiple roofs.
- Each roof's irradiation is weighted by its area
- Total energy = sum of (irradiation * area) for all roofs
"""
import requests
from functools import lru_cache
from typing import List, Dict, Optional


# PVGIS API base URL (v5.2)
PVGIS_BASE_URL = "https://re.jrc.ec.europa.eu/api/v5_2"


class PVGISError(Exception):
    """Custom exception for PVGIS API errors"""
    pass


@lru_cache(maxsize=64)
def fetch_pvgis_monthly_irradiation(
    lat: float,
    lon: float,
    tilt: float,
    azimuth: float,
    startyear: int = 2020,
    endyear: int = 2020
) -> Dict:
    """
    Fetch monthly irradiation data from PVGIS API.
    Results are cached to avoid repeated API calls for the same parameters.

    Args:
        lat: Latitude (-90 to 90)
        lon: Longitude (-180 to 180)
        tilt: Panel tilt angle in degrees (0 = horizontal)
        azimuth: Panel azimuth in degrees (0 = North, 90 = East, 180 = South, 270 = West)
                 PVGIS uses: -180 to 180 where 0 = South, so we convert
        startyear: Start year for data (PVGIS-SARAH2: 2005-2020)
        endyear: End year for data

    Returns:
        Dict with monthly irradiation data
    """
    # Round coordinates for caching efficiency
    lat = round(lat, 4)
    lon = round(lon, 4)
    tilt = round(tilt, 1)

    # Convert azimuth from geographic (0=North) to PVGIS convention (0=South)
    # Geographic: 0=N, 90=E, 180=S, 270=W
    # PVGIS: -180 to 180 where 0=South, -90=East, 90=West
    pvgis_azimuth = (azimuth - 180) % 360
    if pvgis_azimuth > 180:
        pvgis_azimuth -= 360
    pvgis_azimuth = round(pvgis_azimuth, 1)

    # PVGIS MRcalc endpoint for monthly radiation
    url = f"{PVGIS_BASE_URL}/MRcalc"
    params = {
        "lat": lat,
        "lon": lon,
        "startyear": startyear,
        "endyear": endyear,
        "horirrad": 1,  # Include horizontal irradiation
        "optrad": 0,    # Don't optimize angle
        "selectrad": 1, # Use specified tilt/azimuth
        "angle": tilt,
        "aspect": pvgis_azimuth,
        "outputformat": "json"
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data
    except requests.exceptions.Timeout:
        raise PVGISError("PVGIS API timeout. Please try again.")
    except requests.exceptions.HTTPError as e:
        if response.status_code == 400:
            error_msg = "Invalid parameters or location outside PVGIS coverage area."
            try:
                error_data = response.json()
                if "message" in error_data:
                    error_msg = error_data["message"]
            except:
                pass
            raise PVGISError(f"PVGIS API error: {error_msg}")
        raise PVGISError(f"PVGIS API HTTP error: {e}")
    except requests.exceptions.RequestException as e:
        raise PVGISError(f"PVGIS API request failed: {e}")
    except ValueError as e:
        raise PVGISError(f"PVGIS API returned invalid JSON: {e}")


def compute_monthly_poa_irradiation(
    lat: float,
    lon: float,
    tilt: float,
    azimuth: float
) -> Dict:
    """
    Compute monthly POA (Plane of Array) irradiation using PVGIS.

    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        tilt: Surface tilt angle in degrees (0 = horizontal, 90 = vertical)
        azimuth: Surface azimuth in degrees (0 = North, 90 = East, 180 = South, 270 = West)

    Returns:
        dict with:
            - monthly: list of 12 floats (kWh/m² for each month)
            - annual: float (total annual kWh/m²)
            - daily_avg: float (average daily kWh/m²/day)
    """
    # Validate inputs
    if not (-90 <= lat <= 90):
        raise ValueError(f"Invalid latitude: {lat}")
    if not (-180 <= lon <= 180):
        raise ValueError(f"Invalid longitude: {lon}")
    if tilt is None:
        tilt = 15  # Default tilt
    if azimuth is None:
        azimuth = 180  # Default facing south

    # Clamp tilt to valid range
    tilt = max(0, min(90, tilt))

    # Fetch PVGIS data
    data = fetch_pvgis_monthly_irradiation(lat, lon, tilt, azimuth)

    # Parse monthly data from PVGIS response
    # PVGIS MRcalc returns "outputs" -> "monthly" array with "H(i)_m" (monthly irradiation on tilted plane)
    outputs = data.get("outputs", {})
    monthly_data = outputs.get("monthly", [])

    if not monthly_data:
        raise PVGISError("PVGIS response missing monthly data")

    # Extract monthly irradiation values (kWh/m²)
    # PVGIS returns H(i)_m in kWh/m² for each month
    monthly_values = []
    for month_entry in monthly_data:
        # H(i)_m is the monthly irradiation on the inclined plane
        irrad = month_entry.get("H(i)_m", 0)
        monthly_values.append(round(float(irrad), 2))

    # Ensure we have 12 months
    while len(monthly_values) < 12:
        monthly_values.append(0.0)
    monthly_values = monthly_values[:12]

    annual_total = sum(monthly_values)
    daily_avg = annual_total / 365

    return {
        "monthly": monthly_values,
        "annual": round(annual_total, 2),
        "daily_avg": round(daily_avg, 3)
    }


@lru_cache(maxsize=64)
def fetch_pvgis_monthly_pvcalc(
    lat: float,
    lon: float,
    tilt: float,
    azimuth: float,
    peakpower_kwp: float,
    loss: float = 14.0,
    startyear: int = 2020,
    endyear: int = 2020
) -> Dict:
    """
    Fetch PVGIS PVcalc monthly PV output (grid-connected PV).

    Returns JSON with outputs->monthly->fixed entries containing E_m (kWh/month).
    """
    lat = round(lat, 4)
    lon = round(lon, 4)
    tilt = round(tilt, 1)
    peakpower_kwp = round(float(peakpower_kwp or 0), 3)
    loss = round(float(loss or 0), 2)

    pvgis_azimuth = (azimuth - 180) % 360
    if pvgis_azimuth > 180:
        pvgis_azimuth -= 360
    pvgis_azimuth = round(pvgis_azimuth, 1)

    url = f"{PVGIS_BASE_URL}/PVcalc"
    params = {
        "lat": lat,
        "lon": lon,
        "startyear": startyear,
        "endyear": endyear,
        "peakpower": peakpower_kwp,  # kWp
        "loss": loss,                 # %
        "angle": tilt,
        "aspect": pvgis_azimuth,
        "outputformat": "json"
    }

    try:
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.Timeout:
        raise PVGISError("PVGIS PVcalc timeout. Please try again.")
    except requests.exceptions.HTTPError as e:
        if response.status_code == 400:
            error_msg = "Invalid parameters or location outside PVGIS coverage area."
            try:
                error_data = response.json()
                if "message" in error_data:
                    error_msg = error_data["message"]
            except:
                pass
            raise PVGISError(f"PVGIS PVcalc error: {error_msg}")
        raise PVGISError(f"PVGIS PVcalc HTTP error: {e}")
    except requests.exceptions.RequestException as e:
        raise PVGISError(f"PVGIS PVcalc request failed: {e}")
    except ValueError as e:
        raise PVGISError(f"PVGIS PVcalc returned invalid JSON: {e}")


def compute_monthly_pv_output(
    lat: float,
    lon: float,
    tilt: float,
    azimuth: float,
    peakpower_kwp: float,
    loss: float = 14.0
) -> Dict:
    """
    Compute monthly PV output (kWh) using PVGIS PVcalc.
    """
    data = fetch_pvgis_monthly_pvcalc(lat, lon, tilt, azimuth, peakpower_kwp, loss)
    outputs = data.get("outputs", {})
    monthly = outputs.get("monthly", {}).get("fixed", [])

    if not monthly:
        # PVGIS sometimes returns list at outputs->monthly
        monthly = outputs.get("monthly", []) or []

    monthly_values = []
    for entry in monthly:
        # E_m = monthly energy output (kWh)
        val = entry.get("E_m", 0)
        monthly_values.append(round(float(val), 2))

    while len(monthly_values) < 12:
        monthly_values.append(0.0)
    monthly_values = monthly_values[:12]

    annual_total = sum(monthly_values)
    return {
        "monthly": monthly_values,
        "annual": round(annual_total, 2)
    }


def compute_multi_roof_pv_output(
    lat: float,
    lon: float,
    roofs: List[Dict],
    total_kwp: float,
    roof_indices: Optional[List[int]] = None,
    loss: float = 14.0
) -> Dict:
    """
    Compute monthly PV output for multiple roofs by splitting total kWp by area ratio.
    """
    selected = roofs
    if roof_indices is not None:
        selected = [r for r in roofs if r.get("index") in roof_indices]

    total_area = sum(float(r.get("area") or 0) for r in selected) or 0.0
    if total_area <= 0 or total_kwp <= 0:
        return {"monthly": [0.0] * 12, "annual": 0.0}

    monthly_sum = [0.0] * 12
    annual_sum = 0.0

    for r in selected:
        area = float(r.get("area") or 0)
        if area <= 0:
            continue
        share_kwp = total_kwp * (area / total_area)
        tilt = r.get("tilt") or 15
        azimuth = r.get("azimuth") or 180
        pv = compute_monthly_pv_output(lat, lon, tilt, azimuth, share_kwp, loss)
        for i, v in enumerate(pv["monthly"]):
            monthly_sum[i] += v
        annual_sum += pv["annual"]

    return {
        "monthly": [round(v, 2) for v in monthly_sum],
        "annual": round(annual_sum, 2)
    }


def compute_multi_roof_irradiation(
    lat: float,
    lon: float,
    roofs: List[Dict],
    roof_indices: Optional[List[int]] = None
) -> Dict:
    """
    Compute monthly POA irradiation for multiple roofs.

    Aggregation method: Area-weighted average
    - Monthly values are weighted averages based on roof area
    - Total energy is the sum of (irradiation * area) for selected roofs

    Args:
        lat: Latitude in degrees
        lon: Longitude in degrees
        roofs: List of roof dicts with keys: index, tilt, azimuth, area, user_tilt, user_azimuth
        roof_indices: List of roof indices to include (None = all roofs)

    Returns:
        dict with:
            - monthly: list of 12 floats (area-weighted average kWh/m²)
            - annual: float (area-weighted average annual kWh/m²)
            - daily_avg: float (area-weighted average daily kWh/m²/day)
            - total_energy_monthly: list of 12 floats (total kWh for selected roofs)
            - total_energy_annual: float (total kWh/year for selected roofs)
            - total_area: float (total area of selected roofs)
            - per_roof: list of per-roof results
    """
    if not roofs:
        raise ValueError("No roofs provided")

    # Filter roofs by indices if specified
    if roof_indices is not None:
        selected_roofs = [r for r in roofs if r.get("index") in roof_indices]
    else:
        selected_roofs = roofs

    if not selected_roofs:
        raise ValueError("No matching roofs found for the specified indices")

    # Calculate total area of selected roofs
    total_area = sum(r.get("area", 0) or 1 for r in selected_roofs)
    if total_area <= 0:
        total_area = len(selected_roofs)

    # Compute irradiation for each selected roof
    per_roof_results = []
    for roof in selected_roofs:
        tilt = roof.get("user_tilt") or roof.get("tilt") or 15
        azimuth = roof.get("user_azimuth") or roof.get("azimuth") or 180
        area = roof.get("area") or 1
        roof_index = roof.get("index", 0)

        try:
            result = compute_monthly_poa_irradiation(lat, lon, tilt, azimuth)
            per_roof_results.append({
                "index": roof_index,
                "tilt": tilt,
                "azimuth": azimuth,
                "area": area,
                "monthly": result["monthly"],
                "annual": result["annual"],
                "daily_avg": result["daily_avg"],
                "error": None
            })
        except (PVGISError, ValueError) as e:
            # Include error info but continue with other roofs
            per_roof_results.append({
                "index": roof_index,
                "tilt": tilt,
                "azimuth": azimuth,
                "area": area,
                "monthly": [0] * 12,
                "annual": 0,
                "daily_avg": 0,
                "error": str(e)
            })

    # Check if all roofs failed
    successful_roofs = [r for r in per_roof_results if r["error"] is None]
    if not successful_roofs:
        errors = [r["error"] for r in per_roof_results if r["error"]]
        raise PVGISError(f"All roof calculations failed: {errors[0]}")

    # Recalculate total area for successful roofs only
    successful_total_area = sum(r["area"] for r in successful_roofs)
    if successful_total_area <= 0:
        successful_total_area = len(successful_roofs)

    # Calculate area-weighted average monthly values
    weighted_monthly = [0.0] * 12
    total_energy_monthly = [0.0] * 12

    for roof_result in successful_roofs:
        area = roof_result["area"]
        monthly = roof_result["monthly"]
        for i in range(12):
            weighted_monthly[i] += monthly[i] * area
            total_energy_monthly[i] += monthly[i] * area  # kWh/m² * m² = kWh

    # Compute averages (divide by total area of successful roofs)
    monthly_avg = [round(w / successful_total_area, 2) for w in weighted_monthly]
    annual_avg = sum(monthly_avg)
    daily_avg = annual_avg / 365

    total_energy_annual = sum(total_energy_monthly)

    return {
        "monthly": monthly_avg,
        "annual": round(annual_avg, 2),
        "daily_avg": round(daily_avg, 3),
        "total_energy_monthly": [round(e, 2) for e in total_energy_monthly],
        "total_energy_annual": round(total_energy_annual, 2),
        "total_area": round(successful_total_area, 2),
        "per_roof": per_roof_results,
        "successful_count": len(successful_roofs),
        "total_count": len(per_roof_results)
    }


# Keep backward compatibility with old function name
def compute_aggregate_irradiation(
    lat: float,
    lon: float,
    roofs: list,
    year: int = 2020,
    timezone: str = None
) -> dict:
    """
    Backward-compatible wrapper for compute_multi_roof_irradiation.
    The year and timezone parameters are ignored (PVGIS uses fixed historical data).
    """
    return compute_multi_roof_irradiation(lat, lon, roofs, roof_indices=None)
