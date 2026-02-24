# Solar ROI Calculator — Calculation Reference

> File locations relative to `src/cesium-local/`

---

## Table of Contents

1. [Irradiation (POA)](#1-irradiation-poa)
2. [PV Sizing](#2-pv-sizing)
3. [PV Energy Output (PVcalc)](#3-pv-energy-output-pvcalc)
4. [Financial Model & ROI](#4-financial-model--roi)
5. [Known Limitations & Gaps](#5-known-limitations--gaps)

---

## 1. Irradiation (POA)

**Source file:** `backend/irradiation.py`
**Data source:** PVGIS API v5.2 — `MRcalc` endpoint (`H(i)_m` field)

### 1.1 Single-roof POA Irradiation

PVGIS returns monthly plane-of-array (POA) irradiation for a given tilt and azimuth.

```
H_monthly[m]   kWh/m²   monthly POA irradiation (from PVGIS H(i)_m)
H_annual       = Σ H_monthly[m]      for m = 1..12
H_daily_avg    = H_annual / 365
```

**Azimuth conversion** (geographic → PVGIS convention):

| Convention | North | East | South | West |
|------------|-------|------|-------|------|
| Geographic | 0°    | 90°  | 180°  | 270° |
| PVGIS      | ±180° | −90° | 0°    | +90° |

```python
# backend/irradiation.py:61-64
pvgis_azimuth = (azimuth - 180) % 360
if pvgis_azimuth > 180:
    pvgis_azimuth -= 360
```

**Tilt:** clamped to [0°, 90°]; defaults to 15° if `None`.
**Azimuth:** defaults to 180° (south) if `None`.

PVGIS data fixed to **year 2020** (`startyear=endyear=2020`, line 34–35).
Results are in-memory cached via `@lru_cache(maxsize=64)` on `(lat, lon, tilt, azimuth)`.

### 1.2 Multi-roof Area-Weighted Aggregation

For N roof planes, each with area Aᵢ and monthly irradiation Hᵢ[m]:

```
H_weighted[m]  = Σ( Hᵢ[m] × Aᵢ ) / Σ Aᵢ        area-weighted average [kWh/m²]
E_total[m]     = Σ( Hᵢ[m] × Aᵢ )                 total energy per month [kWh]
E_annual       = Σ E_total[m]                       total annual energy [kWh]
H_annual_avg   = Σ H_weighted[m]
H_daily_avg    = H_annual_avg / 365                  used as Peak Sun Hours (PSH)
```

Roofs that fail PVGIS are excluded from aggregation (error reported per roof).

---

## 2. PV Sizing

**Source file:** `backend/sizing.py`

### 2.1 Appliance Daytime Consumption

Fixed solar window: **06:00–18:00** (720 min).

For each appliance with `power` (W), `quantity`, `usage_start`, `usage_end`:

```
total_hours      = length of usage interval (handles midnight-wrap)
overlap_hours    = overlap( usage_interval , [06:00, 18:00] )

total_kwh        = power × quantity × total_hours  / 1000
daytime_kwh      = power × quantity × overlap_hours / 1000
nighttime_kwh    = total_kwh − daytime_kwh
```

Midnight-spanning intervals (e.g. 22:00–06:00) are split into
`[22:00, 24:00]` + `[00:00, 06:00]` before overlap calculation.

**Aggregate output:**
```
total_daily_kwh  = Σ total_kwh   (all appliances)
daytime_kwh      = Σ daytime_kwh
nighttime_kwh    = total_daily_kwh − daytime_kwh
```

### 2.2 System Sizing

```
target_kWp = daytime_kwh / ( PSH × PR )
```

| Symbol | Value | Meaning |
|--------|-------|---------|
| PSH    | H_daily_avg from §1.2 | Peak sun hours (kWh/m²/day) |
| PR     | **0.86** | Performance ratio (wiring, temp, mismatch losses) |

> **Note:** The function signature shows `performance_ratio=0.80` but `size_pv_system()` always calls it with `0.86` (`sizing.py:213`).

**Panel catalogue** (`sizing.py:10-15`):

| Watt | Width (m) | Height (m) | Area (m²) |
|------|-----------|------------|-----------|
| 400 W | 1.134 | 1.722 | 1.95 |
| 450 W | 1.134 | 1.762 | 2.00 |
| 500 W | 1.134 | 1.903 | 2.16 |
| 550 W | 1.134 | 2.094 | 2.37 |

**Panel selection algorithm** (for each panel watt rating):

```
panel_count  = ceil( target_kWp × 1000 / panel_watt )
total_area   = panel_count × panel_area_m2
fits_on_roof = total_area ≤ available_area_m2
```

Selection priority: **fits on roof** → **fewest panels** → **highest watt**.

**Installed system:**

```
system_kWp         = panel_count × panel_watt / 1000
daily_production   = system_kWp × PSH × PR
annual_production  = daily_production × 365
surplus_daily      = daily_production − daytime_kwh
self_consumption_ratio = min(daytime_kwh, daily_production) / daily_production
```

**Available roof area** is computed as:

```
available_area = total_roof_area × shading_ratio
```

> **Note:** The `/api/projects/<id>/sizing` route (`routes/projects.py:641`) hardcodes `shading_ratio=1.0`, meaning **no shading derating** is applied to roof area in the API call. The user-specified `project.shading_ratio` is stored but not used here.

---

## 3. PV Energy Output (PVcalc)

**Source file:** `backend/irradiation.py` (`compute_multi_roof_pv_output`)
**PVGIS endpoint:** `PVcalc` → `E_m` field (kWh/month, grid-connected system)

For multi-roof systems, total kWp is distributed proportionally by roof area:

```
share_kWp_i = total_kWp × ( Aᵢ / Σ Aᵢ )
```

Each roof's monthly output is fetched from PVGIS PVcalc independently using `share_kWp_i`, then summed:

```
E_monthly[m] = Σ E_monthly_i[m]
E_annual     = Σ E_monthly[m]
```

Default system loss: **14%** (`loss=14.0`, PVGIS parameter covering wiring, inverter, etc.).

---

## 4. Financial Model & ROI

**Source file:** `templates/calculate.html` (JavaScript, `renderReport()`, line 2244)

### 4.1 Annual Energy Flows

```
annualPV        = E_annual from PVcalc (§3)
selfRatio       = self_consumption_ratio from §2.2
selfConsumed    = annualPV × selfRatio
exported        = max(0,  annualPV − selfConsumed)
gridImport      = max(0,  annualLoad − selfConsumed)
```

`annualLoad` priority: `project.bill.annual_kwh` → `monthly_kwh × 12` → `total_daily_kwh × 365`.

### 4.2 Bill & Annual Savings

```
baselineBill  = annualLoad   × tariff                       [currency/year]
postBill      = gridImport   × tariff − exported × exportPrice
annualSavings = baselineBill − postBill
             = selfConsumed × tariff + exported × exportPrice
```

`tariff` and `exportPrice` are user-defined (stored in project).

### 4.3 Capital Expenditure (CAPEX)

```
panelCost     = panel_count × panel_watt × panelPricePerWatt   (from CSV, JPY)
inverterTotal = Σ inverter prices (USD → converted)
batteryTotal  = Σ battery  prices (USD → converted)

hardwareTotal = panelCost + inverterTotal + batteryTotal
capex         = hardwareTotal × (1 + bosFactor)                bosFactor = 0.20
```

BOS factor of **20%** covers Balance-of-System (mounting, cabling, installation labour).

### 4.4 25-Year Cashflow Model

**Fixed assumptions** (hardcoded, not user-configurable):

| Parameter | Value | Description |
|-----------|-------|-------------|
| Project life | 25 years | Standard IEC assumption |
| Degradation | 0.7 %/year | Typical monocrystalline |
| O&M annual | 1 % of CAPEX/year | Maintenance cost |
| Discount rate | 6 % | Real WACC |
| Inverter replacement | Year 12, 80 % of inverter cost | |
| Battery replacement | Year 10, 80 % of battery cost | |

**Annual cashflow (year y):**

```
savings_y  = annualSavings × (1 − degradation)^(y−1)
cost_y     = omAnnual
           + inverterReplaceCost   if y = 12
           + batteryReplaceCost    if y = 10
cashflow_y = savings_y − cost_y
cumulative_y = −capex + Σ cashflow_t   for t = 1..y
```

### 4.5 Financial Metrics

**Simple Payback Period:**
```
payback = capex / annualSavings                             [years]
```
(undiscounted; ignores degradation — conservative/pessimistic)

**Net Present Value:**
```
NPV = −capex + Σ( cashflow_y / (1 + r)^y )    for y = 1..25,  r = 0.06
```

**Internal Rate of Return:**
Solved by bisection on NPV = 0 over range [−0.9, 1.0] in 60 iterations.
```
NPV(IRR) = 0
```

**Levelized Cost of Energy (LCOE):**
```
discountedCost   = capex + Σ( cost_y / (1+r)^y )
discountedEnergy =         Σ( annualPV × (1−deg)^(y−1) / (1+r)^y )

LCOE = discountedCost / discountedEnergy                    [currency/kWh]
```

---

## 5. Known Limitations & Gaps

The following issues reduce robustness or accuracy:

| # | Location | Issue | Severity |
|---|----------|-------|----------|
| 1 | `irradiation.py:34` | **Single year (2020)** used instead of TMY (typical meteorological year). Interannual solar variability ~±5%. | Medium |
| 2 | `routes/projects.py:641` | **`shading_ratio=1.0`** hardcoded in sizing API — user-defined shading not applied to available area. | High |
| 3 | `sizing.py:43` | **Solar window fixed at 06:00–18:00** regardless of latitude or season. At high latitudes this misses real solar hours. | Medium |
| 4 | `sizing.py:105–106` | **PR default (0.80) vs actual call (0.86)** mismatch creates documentation confusion. | Low |
| 5 | `irradiation.py:15` | **`@lru_cache` is in-memory only** — lost on server restart; no persistent caching. | Low |
| 6 | `irradiation.py:363` | **`area = roof.get("area") or 1`** — zero-area roofs get weight=1 m², distorting aggregation. | Medium |
| 7 | `sizing.py:230–234` | **Per-roof sizing** in `size_pv_system` runs full-load sizing per roof independently. Each roof's result is "if only this roof were used," which is misleading if shown as a combined system. | Medium |
| 8 | `calculate.html:2256` | **`selfRatio` is a single scalar** applied uniformly to all months — ignores seasonal production/load mismatch. | Medium |
| 9 | `calculate.html:2267` | **Panel prices from a CSV in JPY** — brittle external dependency; if file absent, `panelCost=0`. | High |
| 10 | `calculate.html:2280–2282` | **Degradation, discount rate, BOS, O&M all hardcoded** — no user input, no sensitivity analysis. | Medium |
| 11 | `calculate.html:2315` | **Simple payback ignores degradation** — overstates payback speed slightly. | Low |
| 12 | `irradiation.py:164` | **`daily_avg = annual / 365`** — no leap-year correction (0.3% error). | Low |
| 13 | `calculate.html:2107–2116` | **IRR bisection assumes single NPV sign change** — edge cases with oscillating cashflows could return wrong IRR. | Low |

### Recommended Fixes (Priority Order)

1. Pass `project.shading_ratio` into `size_pv_system` from the API route.
2. Expose degradation, discount rate, BOS, and O&M as user-editable inputs.
3. Apply `selfRatio` monthly (use per-month load vs per-month PV production).
4. Replace hardcoded panel CSV with a database-backed price table.
5. Switch PVGIS to TMY (`startyear` omitted, or use `CMV` calculation type) for location-representative data.
6. Make solar hours latitude-adaptive (or pull from PVGIS sunrise/sunset).
