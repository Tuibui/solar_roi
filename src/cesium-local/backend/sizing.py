"""
PV system sizing for self-consumption (daytime only).
Pure Python helpers (no Flask dependencies).
"""

from typing import Dict, List, Tuple
import math


PANEL_SPECS = [
    {"watt": 400, "width_m": 1.134, "height_m": 1.722, "area_m2": 1.95},
    {"watt": 450, "width_m": 1.134, "height_m": 1.762, "area_m2": 2.00},
    {"watt": 500, "width_m": 1.134, "height_m": 1.903, "area_m2": 2.16},
    {"watt": 550, "width_m": 1.134, "height_m": 2.094, "area_m2": 2.37},
]


def _parse_hhmm(value: str) -> int:
    try:
        parts = value.split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        h = max(0, min(23, h))
        m = max(0, min(59, m))
        return h * 60 + m
    except Exception:
        return 0


def _split_interval(start_min: int, end_min: int) -> List[Tuple[int, int]]:
    if end_min <= start_min:
        return [(start_min, 1440), (0, end_min)]
    return [(start_min, end_min)]


def _overlap_minutes(a: Tuple[int, int], b: Tuple[int, int]) -> int:
    return max(0, min(a[1], b[1]) - max(a[0], b[0]))


def compute_daytime_consumption(
    appliances: List[Dict],
    solar_start: str = "06:00",
    solar_end: str = "18:00"
) -> Dict:
    solar_start_min = _parse_hhmm(solar_start)
    solar_end_min = _parse_hhmm(solar_end)
    solar_intervals = _split_interval(solar_start_min, solar_end_min)

    total_daily_kwh = 0.0
    daytime_kwh = 0.0
    appliances_out = []

    for app in appliances or []:
        name = app.get("name") or "Appliance"
        power = float(app.get("power") or 0)
        qty = int(app.get("quantity") or 1)
        usage_start = app.get("usage_start") or "00:00"
        usage_end = app.get("usage_end") or "00:00"

        start_min = _parse_hhmm(usage_start)
        end_min = _parse_hhmm(usage_end)
        app_intervals = _split_interval(start_min, end_min)

        overlap_min = 0
        for a in app_intervals:
            for s in solar_intervals:
                overlap_min += _overlap_minutes(a, s)

        overlap_hours = round(overlap_min / 60, 2)
        total_hours = 0.0
        for a in app_intervals:
            total_hours += (a[1] - a[0]) / 60.0

        total_kwh = power * qty * total_hours / 1000.0
        day_kwh = power * qty * overlap_hours / 1000.0

        total_daily_kwh += total_kwh
        daytime_kwh += day_kwh

        appliances_out.append({
            "name": name,
            "power": power,
            "quantity": qty,
            "usage_start": usage_start,
            "usage_end": usage_end,
            "overlap_hours": round(overlap_hours, 2),
            "daytime_kwh": round(day_kwh, 3),
            "total_kwh": round(total_kwh, 3)
        })

    nighttime_kwh = max(0.0, total_daily_kwh - daytime_kwh)

    return {
        "total_daily_kwh": round(total_daily_kwh, 3),
        "daytime_kwh": round(daytime_kwh, 3),
        "nighttime_kwh": round(nighttime_kwh, 3),
        "appliances": appliances_out
    }


def compute_system_sizing(
    daytime_kwh: float,
    peak_sun_hours: float,
    available_area_m2: float,
    performance_ratio: float = 0.80
) -> Dict:
    peak_sun_hours = float(peak_sun_hours or 0)
    available_area_m2 = float(available_area_m2 or 0)
    performance_ratio = float(performance_ratio or 0)

    if daytime_kwh <= 0 or peak_sun_hours <= 0 or performance_ratio <= 0:
        return {
            "target_kwp": 0.0,
            "performance_ratio": performance_ratio,
            "panel_watt": 450,
            "panel_count": 0,
            "system_kwp": 0.0,
            "panel_dimensions": {
                "width_m": 1.134,
                "height_m": 1.762,
                "area_m2": 2.00
            },
            "total_panel_area_m2": 0.0,
            "available_roof_area_m2": round(available_area_m2, 2),
            "fits_on_roof": True,
            "daily_production_kwh": 0.0,
            "annual_production_kwh": 0.0,
            "surplus_daily_kwh": 0.0,
            "self_consumption_ratio": 0.0,
            "self_consumption_note": "No daytime load detected"
        }

    target_kwp = daytime_kwh / (peak_sun_hours * performance_ratio)

    def panel_count_for(watt: int) -> int:
        return int(math.ceil(target_kwp * 1000 / watt))

    best = None
    for spec in PANEL_SPECS:
        count = panel_count_for(spec["watt"])
        total_area = count * spec["area_m2"]
        fits = total_area <= available_area_m2 if available_area_m2 > 0 else True
        candidate = (fits, -spec["watt"], count, total_area, spec)
        if best is None:
            best = candidate
        else:
            # prefer fits_on_roof, then fewer panels, then higher watt
            if candidate[0] and not best[0]:
                best = candidate
            elif candidate[0] == best[0]:
                if candidate[2] < best[2]:
                    best = candidate
                elif candidate[2] == best[2] and candidate[1] < best[1]:
                    best = candidate

    if best is None:
        best_spec = PANEL_SPECS[1]
        count = panel_count_for(best_spec["watt"])
        total_area = count * best_spec["area_m2"]
    else:
        best_spec = best[4]
        count = best[2]
        total_area = best[3]

    system_kwp = count * best_spec["watt"] / 1000.0
    daily_production = system_kwp * peak_sun_hours * performance_ratio
    annual_production = daily_production * 365
    surplus = daily_production - daytime_kwh
    self_consumption_ratio = 0.0 if daily_production <= 0 else min(daytime_kwh, daily_production) / daily_production

    fits_on_roof = total_area <= available_area_m2 if available_area_m2 > 0 else True

    return {
        "target_kwp": round(target_kwp, 2),
        "performance_ratio": round(performance_ratio, 2),
        "panel_watt": best_spec["watt"],
        "panel_count": int(count),
        "system_kwp": round(system_kwp, 2),
        "panel_dimensions": {
            "width_m": best_spec["width_m"],
            "height_m": best_spec["height_m"],
            "area_m2": best_spec["area_m2"]
        },
        "total_panel_area_m2": round(total_area, 2),
        "available_roof_area_m2": round(available_area_m2, 2),
        "fits_on_roof": bool(fits_on_roof),
        "daily_production_kwh": round(daily_production, 2),
        "annual_production_kwh": round(annual_production, 0),
        "surplus_daily_kwh": round(surplus, 2),
        "self_consumption_ratio": round(self_consumption_ratio, 2),
        "self_consumption_note": "System sized to cover ~100% of daytime demand"
    }


def size_pv_system(
    appliances: List[Dict],
    irradiation_data: Dict,
    roofs: List[Dict],
    shading_ratio: float = 0.80
) -> Dict:
    consumption = compute_daytime_consumption(appliances)

    peak_sun_hours = float(irradiation_data.get("daily_avg", 0) or 0)
    annual_kwh_m2 = float(irradiation_data.get("annual", 0) or 0)
    total_area = sum(float(r.get("area") or 0) for r in (roofs or []))
    available_area = total_area * float(shading_ratio or 0)

    sizing = compute_system_sizing(
        consumption["daytime_kwh"],
        peak_sun_hours,
        available_area,
        performance_ratio=0.86
    )

    irradiation = {
        "daily_avg_kwh_m2": round(peak_sun_hours, 3),
        "annual_kwh_m2": round(annual_kwh_m2, 2),
        "total_area_m2": round(total_area, 2)
    }

    per_roof = []
    per_roof_results = irradiation_data.get("per_roof") or []
    for roof in roofs or []:
        roof_index = roof.get("index")
        roof_area = float(roof.get("area") or 0)
        roof_irrad = next((r for r in per_roof_results if r.get("index") == roof_index), None)
        roof_psh = float((roof_irrad or {}).get("daily_avg") or 0)
        roof_annual = float((roof_irrad or {}).get("annual") or 0)
        roof_available = roof_area * float(shading_ratio or 0)
        roof_sizing = compute_system_sizing(
            consumption["daytime_kwh"],
            roof_psh,
            roof_available,
            performance_ratio=0.86
        )
        per_roof.append({
            "index": roof_index,
            "area_m2": round(roof_area, 2),
            "irradiation": {
                "daily_avg_kwh_m2": round(roof_psh, 3),
                "annual_kwh_m2": round(roof_annual, 2)
            },
            "sizing": roof_sizing
        })

    return {
        "consumption": consumption,
        "irradiation": irradiation,
        "sizing": sizing,
        "per_roof": per_roof
    }
