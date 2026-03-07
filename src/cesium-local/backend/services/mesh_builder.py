"""
GLB mesh builder for roof visualisation.

Uses geometry.analyze_roof_ecef for correct tilt/azimuth/area,
then builds coloured 3-D roof meshes with trimesh.
"""

import json as json_lib
import logging
import struct

import numpy as np
import trimesh

from .geometry import analyze_roof_ecef, ecef_to_latlon

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Geometry helpers (mesh-only, not analytical)
# ------------------------------------------------------------------

def _remove_duplicate_points(region, eps=1e-6):
    clean = []
    for p in region:
        if not any(np.linalg.norm(p - q) < eps for q in clean):
            clean.append(p)
    return np.array(clean)


def _ensure_ccw_xy(region):
    """Ensure CCW winding in XZ ground plane (Y-up coordinate system)."""
    if len(region) < 3:
        return region
    x, z = region[:, 0], region[:, 2]
    # Complete Shoelace formula including closing edge (last→first vertex)
    area = 0.5 * (np.sum(x[:-1] * z[1:] - x[1:] * z[:-1])
                  + x[-1] * z[0] - x[0] * z[-1])
    if area < 0:
        region = region[::-1]
    return region


def _enu_to_threejs_matrix(lat_deg, lon_deg):
    """Combined ECEF→ENU→Three.js(Y-up) rotation matrix.

    Maps (ECEF - origin) to Three.js coordinates where:
      X = East, Y = Up, Z = -North (i.e. South is +Z / toward camera)

    This preserves geographic orientation: a roof facing south in real life
    will face south (+Z) in the 3D view.
    """
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    sl, cl = np.sin(lat), np.cos(lat)
    sn, cn = np.sin(lon), np.cos(lon)

    # Row 0: East direction in ECEF
    # Row 1: Up direction in ECEF
    # Row 2: -North direction in ECEF (= South)
    return np.array([
        [-sn,     cn,      0  ],
        [ cl*cn,  cl*sn,   sl ],
        [ sl*cn,  sl*sn,  -cl ],
    ])


def _compute_alignment_rotation(roof_positions):
    normals = []
    for pos in roof_positions:
        if len(pos) < 3:
            continue
        n = np.cross(pos[1] - pos[0], pos[2] - pos[0])
        ln = np.linalg.norm(n)
        if ln > 0:
            n = n / ln
            # Ensure normal points upward (away from Earth center)
            center = np.mean(pos, axis=0)
            up = center / np.linalg.norm(center)
            if np.dot(n, up) < 0:
                n = -n
            normals.append(n)
    if not normals:
        return np.eye(3)
    avg = np.mean(normals, axis=0)
    avg /= np.linalg.norm(avg)
    target = np.array([0, 0, -1])
    axis = np.cross(avg, target)
    axis_norm = np.linalg.norm(axis)
    if axis_norm < 1e-6:
        return np.eye(3)
    axis /= axis_norm
    angle = np.arccos(np.clip(np.dot(avg, target), -1, 1))
    K = np.array([
        [0, -axis[2], axis[1]],
        [axis[2], 0, -axis[0]],
        [-axis[1], axis[0], 0]
    ])
    return np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * (K @ K)


def _apply_rotation(positions_list, R):
    return [(R @ pos.T).T for pos in positions_list]

def _compute_planar_yaw(positions_list):
    pts = np.vstack([p for p in positions_list if len(p) > 0])
    if pts.shape[0] < 3:
        return 0.0
    xy = pts[:, :2]
    xy = xy - np.mean(xy, axis=0)
    cov = np.cov(xy.T)
    if not np.isfinite(cov).all():
        return 0.0
    vals, vecs = np.linalg.eigh(cov)
    idx = np.argsort(vals)[::-1]
    principal = vecs[:, idx[0]]
    angle = np.arctan2(principal[1], principal[0])
    if not np.isfinite(angle):
        return 0.0
    return angle

def _rotation_z(angle):
    c = np.cos(angle)
    s = np.sin(angle)
    return np.array([
        [c, -s, 0],
        [s,  c, 0],
        [0,  0, 1]
    ])

def _ecef_east_vector(lat_deg, lon_deg):
    lat = np.deg2rad(lat_deg)
    lon = np.deg2rad(lon_deg)
    return np.array([-np.sin(lon), np.cos(lon), 0.0])

def _point_in_triangle_2d(pt, a, b, c):
    def _sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = _sign(pt, a, b), _sign(pt, b, c), _sign(pt, c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def _triangulate_polygon_2d(pts_2d):
    """Ear-clipping triangulation for a simple 2D polygon.

    Works correctly for both convex and concave polygons, unlike
    naive fan triangulation which only handles convex shapes.
    """
    n = len(pts_2d)
    if n < 3:
        return []
    if n == 3:
        return [[0, 1, 2]]

    # Ensure CCW winding for the index list
    area = sum(
        pts_2d[i][0] * pts_2d[(i + 1) % n][1]
        - pts_2d[(i + 1) % n][0] * pts_2d[i][1]
        for i in range(n)
    )
    indices = list(range(n))
    if area < 0:
        indices = indices[::-1]

    faces = []
    while len(indices) > 2:
        ear_found = False
        m = len(indices)
        for i in range(m):
            p = indices[(i - 1) % m]
            c = indices[i]
            nx = indices[(i + 1) % m]
            cross = ((pts_2d[c][0] - pts_2d[p][0]) * (pts_2d[nx][1] - pts_2d[p][1])
                     - (pts_2d[c][1] - pts_2d[p][1]) * (pts_2d[nx][0] - pts_2d[p][0]))
            if cross <= 0:
                continue
            ear = True
            for j in range(m):
                if indices[j] in (p, c, nx):
                    continue
                if _point_in_triangle_2d(pts_2d[indices[j]], pts_2d[p], pts_2d[c], pts_2d[nx]):
                    ear = False
                    break
            if ear:
                faces.append([p, c, nx])
                indices.pop(i)
                ear_found = True
                break
        if not ear_found:
            break
    return faces


def _region_to_mesh(positions):
    region = _remove_duplicate_points(positions)
    region = _ensure_ccw_xy(region)
    if len(region) < 3:
        return None

    # Project onto polygon plane for concave-safe ear-clipping triangulation
    pts = np.array(region)
    edge1 = pts[1] - pts[0]
    edge2 = pts[2] - pts[0]
    normal = np.cross(edge1, edge2)
    nl = np.linalg.norm(normal)
    if nl > 1e-10:
        normal = normal / nl
    else:
        normal = np.array([0.0, 1.0, 0.0])
    ref = np.array([1, 0, 0]) if abs(normal[0]) < 0.9 else np.array([0, 1, 0])
    u = np.cross(normal, ref)
    u = u / np.linalg.norm(u)
    v = np.cross(normal, u)
    pts_2d = [(float(p @ u), float(p @ v)) for p in pts]

    faces = _triangulate_polygon_2d(pts_2d)
    if not faces:
        faces = [[0, i, i + 1] for i in range(1, len(region) - 1)]

    mesh = trimesh.Trimesh(region, faces, process=False)
    mesh.fix_normals()
    return mesh


def _solidify(mesh, thickness=0.25, direction=-1.0):
    if mesh is None or mesh.faces.shape[0] == 0:
        return None
    top = mesh.vertices
    bottom = top + np.array([0, direction * thickness, 0])
    verts = np.vstack([top, bottom])
    off = len(top)
    edges = mesh.edges_unique
    counts = np.bincount(mesh.edges_unique_inverse)
    boundary = edges[counts == 1]
    side_faces = []
    for a, b in boundary:
        side_faces.append([a, b, b + off])
        side_faces.append([a, b + off, a + off])
    bottom_faces = mesh.faces[:, ::-1] + off
    faces = np.vstack([mesh.faces, bottom_faces, np.array(side_faces)])
    solid = trimesh.Trimesh(verts, faces, process=True)
    solid.remove_unreferenced_vertices()
    solid.fix_normals()
    return solid


# ------------------------------------------------------------------
# 2D projection & inscribed-rectangle panel fitting
# ------------------------------------------------------------------

def _build_plane_basis(normal):
    if abs(normal[0]) < 0.9:
        arbitrary = np.array([1, 0, 0])
    else:
        arbitrary = np.array([0, 1, 0])
    u = np.cross(normal, arbitrary)
    u = u / np.linalg.norm(u)
    v = np.cross(normal, u)
    v = v / np.linalg.norm(v)
    return u, v


def _project_to_2d(positions_3d):
    pts = np.array(positions_3d)
    origin = pts.mean(axis=0)
    centered = pts - origin

    if len(pts) >= 3:
        u_vec = pts[1] - pts[0]
        v_vec = pts[2] - pts[0]
        normal = np.cross(u_vec, v_vec)
        norm_len = np.linalg.norm(normal)
        if norm_len > 1e-10:
            normal = normal / norm_len
        else:
            normal = np.array([0, 0, 1])
    else:
        normal = np.array([0, 0, 1])

    u_basis, v_basis = _build_plane_basis(normal)
    pts_2d = np.array([[np.dot(p, u_basis), np.dot(p, v_basis)] for p in centered])
    return pts_2d, origin, u_basis, v_basis, normal


def _create_panel_mesh(corners_2d, origin, u_basis, v_basis, normal, z_offset=0.05):
    """Create a thin rectangular panel mesh slightly above the roof plane."""
    corners_3d = [
        origin + cx * u_basis + cy * v_basis + z_offset * normal
        for cx, cy in corners_2d
    ]
    faces = [[0, 1, 2], [0, 2, 3]]
    mesh = trimesh.Trimesh(corners_3d, faces, process=False)
    black = [20, 20, 20, 255]
    mesh.visual.face_colors = np.tile(black, (len(faces), 1))
    return mesh


def _point_in_polygon_2d(point, polygon):
    x, y = point
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _rect_inside_polygon(cx, cy, w, h, angle, polygon):
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    hw, hh = w / 2, h / 2
    corners = [
        (cx + cos_a * hw - sin_a * hh, cy + sin_a * hw + cos_a * hh),
        (cx - cos_a * hw - sin_a * hh, cy - sin_a * hw + cos_a * hh),
        (cx - cos_a * hw + sin_a * hh, cy - sin_a * hw - cos_a * hh),
        (cx + cos_a * hw + sin_a * hh, cy + sin_a * hw - cos_a * hh),
    ]
    return all(_point_in_polygon_2d(c, polygon) for c in corners)


def _find_max_inscribed_rectangle(polygon_2d, num_angles=12, num_samples=8):
    polygon = np.array(polygon_2d)
    if len(polygon) < 3:
        return None

    min_x, min_y = polygon.min(axis=0)
    max_x, max_y = polygon.max(axis=0)
    bbox_w = max_x - min_x
    bbox_h = max_y - min_y

    best = {"area": 0, "width": 0, "height": 0, "angle": 0,
            "center": [0, 0], "corners": []}

    for angle_idx in range(num_angles):
        angle = np.pi * angle_idx / num_angles
        for xi in range(num_samples):
            for yi in range(num_samples):
                cx = min_x + bbox_w * (xi + 0.5) / num_samples
                cy = min_y + bbox_h * (yi + 0.5) / num_samples
                if not _point_in_polygon_2d((cx, cy), polygon):
                    continue
                for w_scale in np.linspace(0.1, 1.0, 5):
                    for h_scale in np.linspace(0.1, 1.0, 5):
                        w = bbox_w * w_scale
                        h = bbox_h * h_scale
                        if _rect_inside_polygon(cx, cy, w, h, angle, polygon):
                            area = w * h
                            if area > best["area"]:
                                cos_a, sin_a = np.cos(angle), np.sin(angle)
                                hw, hh = w / 2, h / 2
                                corners = [
                                    [cx + cos_a * hw - sin_a * hh,
                                     cy + sin_a * hw + cos_a * hh],
                                    [cx - cos_a * hw - sin_a * hh,
                                     cy - sin_a * hw + cos_a * hh],
                                    [cx - cos_a * hw + sin_a * hh,
                                     cy - sin_a * hw - cos_a * hh],
                                    [cx + cos_a * hw + sin_a * hh,
                                     cy + sin_a * hw - cos_a * hh],
                                ]
                                best = {
                                    "area": float(area),
                                    "width": float(w),
                                    "height": float(h),
                                    "angle": float(np.degrees(angle)),
                                    "center": [float(cx), float(cy)],
                                    "corners": corners,
                                }

    return best if best["area"] > 0 else None


# ------------------------------------------------------------------
# Vertex snapping across roofs
# ------------------------------------------------------------------

def _snap_vertices_across_roofs(roof_positions, tol=0.01):
    all_pts = []
    for poly in roof_positions:
        for p in poly:
            all_pts.append(p)
    if not all_pts:
        return roof_positions, {"points": 0, "clusters": 0, "merged": 0}

    pts = np.array(all_pts, dtype=float)
    n = len(pts)

    assigned = np.full(n, False, dtype=bool)
    clusters = []
    for i in range(n):
        if assigned[i]:
            continue
        members = [i]
        assigned[i] = True
        pi = pts[i]
        for j in range(i + 1, n):
            if assigned[j]:
                continue
            if np.linalg.norm(pi - pts[j]) <= tol:
                members.append(j)
                assigned[j] = True
        clusters.append(members)

    index_to_centroid = {}
    for members in clusters:
        centroid = pts[members].mean(axis=0)
        for idx in members:
            index_to_centroid[idx] = centroid

    offsets = []
    acc = 0
    for poly in roof_positions:
        offsets.append(acc)
        acc += len(poly)

    new_roofs = []
    for ri, poly in enumerate(roof_positions):
        new_poly = []
        for vi in range(len(poly)):
            global_idx = offsets[ri] + vi
            c = index_to_centroid.get(global_idx)
            if c is None:
                c = poly[vi]
            new_poly.append(np.array(c, dtype=float))
        new_roofs.append(np.vstack(new_poly))

    diag = {"points": int(n), "clusters": int(len(clusters)),
            "merged": int(n - len(clusters))}
    return new_roofs, diag


# ------------------------------------------------------------------
# GLB builder (public API)
# ------------------------------------------------------------------

def _set_glb_double_sided(glb_path):
    """Patch an exported GLB so every material has doubleSided=true.

    This makes all faces visible from both sides (CAD-style rendering),
    preventing faces from disappearing due to backface culling.
    """
    with open(glb_path, "rb") as f:
        data = f.read()

    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:          # 'glTF'
        return

    json_length = struct.unpack_from("<I", data, 12)[0]
    json_type = struct.unpack_from("<I", data, 16)[0]
    gltf = json_lib.loads(data[20 : 20 + json_length])

    materials = gltf.get("materials", [])
    if not materials:
        # No materials at all – add a default double-sided one
        gltf["materials"] = [{"doubleSided": True}]
    else:
        for mat in materials:
            mat["doubleSided"] = True

    new_json = json_lib.dumps(gltf, separators=(",", ":")).encode("utf-8")
    padding = (4 - len(new_json) % 4) % 4
    new_json += b" " * padding

    bin_data = data[20 + json_length :]
    new_total = 12 + 8 + len(new_json) + len(bin_data)

    with open(glb_path, "wb") as f:
        f.write(struct.pack("<III", magic, version, new_total))
        f.write(struct.pack("<II", len(new_json), json_type))
        f.write(new_json)
        f.write(bin_data)


_PALETTE = [
    ([255, 0, 0, 255], "Red"),
    ([0, 255, 0, 255], "Green"),
    ([0, 0, 255, 255], "Blue"),
    ([255, 255, 0, 255], "Yellow"),
    ([255, 0, 255, 255], "Magenta"),
    ([0, 255, 255, 255], "Cyan"),
]


def build_glb_from_roofs(roofs, out_path, roof_thickness=0.25,
                         join_threshold=0.01, solidify_roofs=True,
                         compute_panels=True):
    roof_positions = [np.array(r, dtype=float) for r in roofs if len(r) >= 3]
    if not roof_positions:
        raise RuntimeError("No valid roof polygons")

    all_pts = np.vstack(roof_positions)
    origin = all_pts.mean(axis=0)

    # House lat/lon from first point
    fp = roof_positions[0][0]
    house_lat, house_lon = ecef_to_latlon(float(fp[0]), float(fp[1]), float(fp[2]))
    logger.info("House location: lat=%s, lon=%s", house_lat, house_lon)

    # Analyse each roof with the known-good ENU method
    pre_rotation_data = []
    for roof_pos in roof_positions:
        pre_rotation_data.append(analyze_roof_ecef(roof_pos))

    # Centre for mesh generation
    roof_positions = [pos - origin for pos in roof_positions]

    snap_diag = {"points": 0, "clusters": 0, "merged": 0}
    if join_threshold is not None and join_threshold > 0.0:
        roof_positions, snap_diag = _snap_vertices_across_roofs(
            roof_positions, tol=join_threshold)

    # Rotate ECEF→ENU→Three.js(Y-up) preserving geographic orientation
    R = _enu_to_threejs_matrix(house_lat, house_lon)
    roof_positions_rotated = _apply_rotation(roof_positions, R)

    parts = []
    roof_infos = []

    for i, roof_pos in enumerate(roof_positions_rotated):
        mesh = _region_to_mesh(roof_pos)
        if not mesh:
            continue

        if solidify_roofs:
            solid = _solidify(mesh, thickness=roof_thickness, direction=-1.0)
        else:
            solid = mesh

        if not solid:
            continue

        color, name = _PALETTE[i % len(_PALETTE)]
        solid.visual.face_colors = np.tile(color, (solid.faces.shape[0], 1))
        parts.append(solid)

        # Pre-computed analysis from ENU method
        tilt = pre_rotation_data[i]["tilt"]
        az = pre_rotation_data[i]["azimuth"]
        area = pre_rotation_data[i]["area"]

        # Maximum inscribed rectangle (panel fitting)
        mir_width = None
        mir_height = None
        mir_area = None

        if compute_panels:
            pts_2d, _origin_2d, _u, _v, _n = _project_to_2d(roof_pos)
            mir = _find_max_inscribed_rectangle(pts_2d)

            if mir and mir["area"] > 0:
                mir_width = round(mir["width"], 2)
                mir_height = round(mir["height"], 2)
                mir_area = round(mir["area"], 2)
                logger.info(
                    "%s roof (#%d): tilt=%.2f, panel area=%.2fm2 (%sx%sm)",
                    name, i + 1, tilt or 0, mir_area, mir_width, mir_height)
            else:
                logger.info(
                    "%s roof (#%d): tilt=%.2f, no panel area found",
                    name, i + 1, tilt or 0)

        tilt_val = float(round(tilt, 2)) if tilt is not None else None
        is_flat = bool(tilt is not None and tilt <= 5)

        roof_infos.append({
            "index": i + 1,
            "tilt": tilt_val,
            "azimuth": az,
            "area": area,
            "color_name": name,
            "is_flat": is_flat,
            "panel_width": mir_width,
            "panel_height": mir_height,
            "panel_area": mir_area,
        })

    if not parts:
        raise RuntimeError("Mesh generation failed")

    # Export as a scene with separate roof meshes so front-end can target each roof
    scene = trimesh.Scene()
    for i, part in enumerate(parts):
        try:
            part.remove_unreferenced_vertices()
            part.fix_normals()
        except Exception:
            pass
        node_name = f"roof_{i}"
        scene.add_geometry(part, node_name=node_name, geom_name=node_name)

    scene.export(out_path)
    _set_glb_double_sided(out_path)

    return {
        "total_parts": len(parts),
        "roof_count": len(roof_infos),
        "roofs": roof_infos,
        "snap_diag": snap_diag,
        "house_lat": house_lat,
        "house_lon": house_lon,
        "mesh_transform": {
            "origin_ecef": origin.tolist(),
            "rotation": R.tolist(),
        },
    }
