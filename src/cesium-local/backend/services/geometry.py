import numpy as np

# ======================================================
# Basic utilities
# ======================================================

def normalize(v):
    n = np.linalg.norm(v)
    if n < 1e-12:
        return v
    return v / n


# ======================================================
# ECEF <-> LATLON
# ======================================================

def latlon_to_ecef(lat, lon, altitude=0.0):
    a = 6378137.0
    f = 1 / 298.257223563
    e2 = 2 * f - f * f

    lat = np.radians(lat)
    lon = np.radians(lon)

    N = a / np.sqrt(1 - e2 * np.sin(lat) ** 2)

    x = (N + altitude) * np.cos(lat) * np.cos(lon)
    y = (N + altitude) * np.cos(lat) * np.sin(lon)
    z = (N * (1 - e2) + altitude) * np.sin(lat)

    return np.array([x, y, z])


def ecef_to_latlon(x, y, z):
    a = 6378137.0
    f = 1 / 298.257223563
    b = a * (1 - f)
    e2 = (a ** 2 - b ** 2) / a ** 2

    lon = np.arctan2(y, x)
    p = np.sqrt(x ** 2 + y ** 2)
    lat = np.arctan2(z, p * (1 - e2))

    for _ in range(8):
        N = a / np.sqrt(1 - e2 * np.sin(lat) ** 2)
        lat = np.arctan2(z + e2 * N * np.sin(lat), p)

    return np.degrees(lat), np.degrees(lon)


# ======================================================
# ECEF -> ENU
# ======================================================

def ecef_to_enu(points_ecef, lat0, lon0):
    lat = np.radians(lat0)
    lon = np.radians(lon0)

    R = np.array([
        [-np.sin(lon),              np.cos(lon),               0],
        [-np.sin(lat)*np.cos(lon), -np.sin(lat)*np.sin(lon),  np.cos(lat)],
        [ np.cos(lat)*np.cos(lon),  np.cos(lat)*np.sin(lon),  np.sin(lat)]
    ])

    origin = latlon_to_ecef(lat0, lon0)
    pts = np.array(points_ecef) - origin
    return (R @ pts.T).T


# ======================================================
# Plane / geometry
# ======================================================

def best_fit_normal(pts):
    centroid = pts.mean(axis=0)
    _, _, Vt = np.linalg.svd(pts - centroid)
    return normalize(Vt[-1])


def plane_area(pts):
    n = best_fit_normal(pts)

    ref = np.array([1, 0, 0]) if abs(n[0]) < 0.9 else np.array([0, 1, 0])
    u = normalize(np.cross(n, ref))
    v = np.cross(n, u)

    proj = np.column_stack((pts @ u, pts @ v))

    area = 0.0
    for i in range(len(proj)):
        j = (i + 1) % len(proj)
        area += proj[i, 0] * proj[j, 1] - proj[j, 0] * proj[i, 1]

    return abs(area) * 0.5


# ======================================================
# Tilt & Azimuth (ENU based, correct)
# ======================================================

def compute_tilt_azimuth_and_normal_enu(pts_enu):
    n = best_fit_normal(pts_enu)

    # force normal upward
    if n[2] < 0:
        n = -n

    # tilt
    tilt = np.degrees(np.arccos(np.clip(n[2], -1, 1)))

    # downslope direction
    gravity = np.array([0, 0, -1])
    downslope = gravity - np.dot(gravity, n) * n

    if np.linalg.norm(downslope) < 1e-8:
        return round(float(tilt), 2), None, n

    downslope = normalize(downslope)

    east = np.array([1, 0, 0])
    north = np.array([0, 1, 0])

    azimuth = np.degrees(np.arctan2(
        np.dot(downslope, east),
        np.dot(downslope, north)
    )) % 360.0

    return round(float(tilt), 2), round(float(azimuth), 2), n


# ======================================================
# Analyze single roof
# ======================================================

def analyze_roof_ecef(vertices_ecef):
    vertices_ecef = np.asarray(vertices_ecef, dtype=float)

    lat, lon = ecef_to_latlon(*vertices_ecef.mean(axis=0))
    pts_enu = ecef_to_enu(vertices_ecef, lat, lon)

    tilt, azimuth, normal = compute_tilt_azimuth_and_normal_enu(pts_enu)
    area = plane_area(pts_enu)

    return {
        "tilt": tilt,
        "azimuth": azimuth,
        "area": round(float(area), 2),
        "normal": normal
    }


# ======================================================
# Hybrid correction for opposite roofs
# ======================================================

def correct_opposite_roofs(roofs):
    """
    roofs: list of dict
      {
        "id": int,
        "tilt": float,
        "azimuth": float,
        "area": float,
        "normal": np.array(3)
      }
    """

    corrected = [r.copy() for r in roofs]
    used = set()

    for i in range(len(roofs)):
        if i in used:
            continue

        for j in range(i + 1, len(roofs)):
            if j in used:
                continue

            n1 = roofs[i]["normal"]
            n2 = roofs[j]["normal"]

            if np.dot(n1, n2) < -0.85:  # opposite detected
                az1 = roofs[i]["azimuth"]

                corrected[i]["azimuth"] = az1
                corrected[j]["azimuth"] = (az1 + 180) % 360

                avg_tilt = round((roofs[i]["tilt"] + roofs[j]["tilt"]) / 2, 2)
                avg_area = round((roofs[i]["area"] + roofs[j]["area"]) / 2, 2)

                corrected[i]["tilt"] = avg_tilt
                corrected[j]["tilt"] = avg_tilt
                corrected[i]["area"] = avg_area
                corrected[j]["area"] = avg_area

                used.add(i)
                used.add(j)
                break

    return corrected

