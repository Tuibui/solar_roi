from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import json
import numpy as np
import trimesh
import geocoder

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")
OUT_FILE = "roof_model.glb"
OUT_PATH = os.path.join(STATIC_DIR, OUT_FILE)
STATS_FILE = os.path.join(STATIC_DIR, "roof_stats.json")
os.makedirs(STATIC_DIR, exist_ok=True)

def save_stats(stats):
    with open(STATS_FILE, 'w') as f:
        json.dump(stats, f)

def load_stats():
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE, 'r') as f:
            return json.load(f)
    return None

# --------------------------
# Geometry helpers
# --------------------------
def remove_duplicate_points(region, eps=1e-6):
    clean = []
    for p in region:
        if not any(np.linalg.norm(p - q) < eps for q in clean):
            clean.append(p)
    return np.array(clean)

def ensure_ccw_xy(region):
    if len(region) < 3:
        return region
    x, y = region[:, 0], region[:, 1]
    area = 0.5 * np.sum(x[:-1] * y[1:] - x[1:] * y[:-1])
    if area < 0:
        region = region[::-1]
    return region

def compute_alignment_rotation(roof_positions):
    normals = []
    for pos in roof_positions:
        if len(pos) < 3:
            continue
        n = np.cross(pos[1] - pos[0], pos[2] - pos[0])
        ln = np.linalg.norm(n)
        if ln > 0:
            normals.append(n / ln)
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
    R = np.eye(3) + np.sin(angle) * K + (1 - np.cos(angle)) * (K @ K)
    return R

def apply_rotation(positions_list, R):
    return [(R @ pos.T).T for pos in positions_list]

def region_to_mesh(positions):
    region = remove_duplicate_points(positions)
    region = ensure_ccw_xy(region)
    if len(region) < 3:
        return None
    faces = [[0, i, i + 1] for i in range(1, len(region) - 1)]
    mesh = trimesh.Trimesh(region, faces, process=False)
    mesh.fix_normals()
    return mesh

def solidify(mesh, thickness=0.25, direction=-1.0):
    if mesh is None or mesh.faces.shape[0] == 0:
        return None
    top = mesh.vertices
    bottom = top + np.array([0, 0, direction * thickness])
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

def compute_tilt(positions, local_up=None):
    """
    Compute tilt angle of a roof plane.
    positions: roof vertices (at least 3 points)
    local_up: the local "up" direction (in ECEF, this is the normalized position vector)
    """
    if len(positions) < 3:
        return None
    u = positions[1] - positions[0]
    v = positions[2] - positions[0]
    n = np.cross(u, v)
    if np.linalg.norm(n) == 0:
        return None
    n = n / np.linalg.norm(n)

    # Use provided local_up or default to [0, 0, 1]
    if local_up is None:
        ground_up = np.array([0, 0, 1])
    else:
        ground_up = local_up / np.linalg.norm(local_up)

    ground_down = -ground_up
    dot_up = np.clip(np.dot(n, ground_up), -1, 1)
    dot_down = np.clip(np.dot(n, ground_down), -1, 1)
    angle_up = np.degrees(np.arccos(dot_up))
    angle_down = np.degrees(np.arccos(dot_down))
    return min(angle_up, angle_down)

def compute_azimuth(positions, local_up):
    """
    Compute azimuth (compass direction) of a roof's downslope direction.
    Uses ECEF coordinates and converts to local ENU (East-North-Up).
    Returns degrees: 0=North, 90=East, 180=South, 270=West
    """
    if len(positions) < 3:
        return None

    # Compute roof normal in ECEF
    u = positions[1] - positions[0]
    v = positions[2] - positions[0]
    n = np.cross(u, v)
    norm = np.linalg.norm(n)
    if norm == 0:
        return None
    n = n / norm

    # Normalize local_up (this is the ECEF position direction = local "up")
    up = local_up / np.linalg.norm(local_up)

    # Compute local East direction: East = cross(Z_axis, Up) normalized
    # Z_axis in ECEF points to North Pole
    z_axis = np.array([0, 0, 1])
    east = np.cross(z_axis, up)
    east_norm = np.linalg.norm(east)
    if east_norm < 1e-10:
        # At poles, East is undefined
        return None
    east = east / east_norm

    # Compute local North direction: North = cross(Up, East)
    north = np.cross(up, east)

    # Make sure roof normal points "outward" (away from Earth center)
    # If it points down, flip it
    if np.dot(n, up) < 0:
        n = -n

    # Project normal onto horizontal plane (EN plane)
    # The downslope direction is opposite to the horizontal component of the normal
    n_east = np.dot(n, east)
    n_north = np.dot(n, north)

    # If roof is flat (normal points straight up), no meaningful azimuth
    horizontal_mag = np.sqrt(n_east**2 + n_north**2)
    if horizontal_mag < 0.01:
        return None

    # Azimuth: angle from North, clockwise
    # atan2(east, north) gives angle from North
    azimuth = np.degrees(np.arctan2(n_east, n_north))

    # Normalize to 0-360
    azimuth = azimuth % 360.0

    return round(float(azimuth), 2)

# --------------------------
# Maximum Inscribed Rectangle
# --------------------------
def project_to_2d(positions_3d):
    """
    Project 3D polygon to 2D using PCA (finds best-fit plane).
    Returns: (2D points, origin, basis vectors u, v, normal)
    """
    pts = np.array(positions_3d)
    origin = pts.mean(axis=0)
    centered = pts - origin

    # Compute normal from first 3 points
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

    # Create orthonormal basis on the plane
    # Pick an arbitrary vector not parallel to normal
    if abs(normal[0]) < 0.9:
        arbitrary = np.array([1, 0, 0])
    else:
        arbitrary = np.array([0, 1, 0])

    u_basis = np.cross(normal, arbitrary)
    u_basis = u_basis / np.linalg.norm(u_basis)
    v_basis = np.cross(normal, u_basis)
    v_basis = v_basis / np.linalg.norm(v_basis)

    # Project to 2D
    pts_2d = np.array([[np.dot(p, u_basis), np.dot(p, v_basis)] for p in centered])

    return pts_2d, origin, u_basis, v_basis, normal

def point_in_polygon_2d(point, polygon):
    """Ray casting algorithm to check if point is inside polygon."""
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

def rect_inside_polygon(cx, cy, w, h, angle, polygon):
    """Check if a rotated rectangle is entirely inside the polygon."""
    cos_a, sin_a = np.cos(angle), np.sin(angle)
    hw, hh = w / 2, h / 2
    corners = [
        (cx + cos_a * hw - sin_a * hh, cy + sin_a * hw + cos_a * hh),
        (cx - cos_a * hw - sin_a * hh, cy - sin_a * hw + cos_a * hh),
        (cx - cos_a * hw + sin_a * hh, cy - sin_a * hw - cos_a * hh),
        (cx + cos_a * hw + sin_a * hh, cy + sin_a * hw - cos_a * hh),
    ]
    return all(point_in_polygon_2d(c, polygon) for c in corners)

def find_max_inscribed_rectangle(polygon_2d, num_angles=36, num_samples=20):
    """
    Find the maximum area rectangle that fits inside a 2D polygon.
    Uses sampling approach: try different angles and positions.
    Returns: {width, height, area, angle, center, corners}
    """
    polygon = np.array(polygon_2d)
    if len(polygon) < 3:
        return None

    # Get bounding box
    min_x, min_y = polygon.min(axis=0)
    max_x, max_y = polygon.max(axis=0)
    bbox_w = max_x - min_x
    bbox_h = max_y - min_y

    best = {"area": 0, "width": 0, "height": 0, "angle": 0, "center": [0, 0], "corners": []}

    # Try different rotation angles (0 to 180 degrees)
    for angle_idx in range(num_angles):
        angle = np.pi * angle_idx / num_angles

        # Try different center positions
        for xi in range(num_samples):
            for yi in range(num_samples):
                cx = min_x + bbox_w * (xi + 0.5) / num_samples
                cy = min_y + bbox_h * (yi + 0.5) / num_samples

                if not point_in_polygon_2d((cx, cy), polygon):
                    continue

                # Binary search for maximum width and height
                # Start with small rectangle and grow
                for w_scale in np.linspace(0.1, 1.0, 10):
                    for h_scale in np.linspace(0.1, 1.0, 10):
                        w = bbox_w * w_scale
                        h = bbox_h * h_scale

                        if rect_inside_polygon(cx, cy, w, h, angle, polygon):
                            area = w * h
                            if area > best["area"]:
                                cos_a, sin_a = np.cos(angle), np.sin(angle)
                                hw, hh = w / 2, h / 2
                                corners = [
                                    [cx + cos_a * hw - sin_a * hh, cy + sin_a * hw + cos_a * hh],
                                    [cx - cos_a * hw - sin_a * hh, cy - sin_a * hw + cos_a * hh],
                                    [cx - cos_a * hw + sin_a * hh, cy - sin_a * hw - cos_a * hh],
                                    [cx + cos_a * hw + sin_a * hh, cy + sin_a * hw - cos_a * hh],
                                ]
                                best = {
                                    "area": float(area),
                                    "width": float(w),
                                    "height": float(h),
                                    "angle": float(np.degrees(angle)),
                                    "center": [float(cx), float(cy)],
                                    "corners": corners
                                }

    return best if best["area"] > 0 else None

def create_solar_panel_mesh(corners_2d, origin, u_basis, v_basis, z_offset=0.05):
    """
    Create a blue rectangle mesh from 2D corners projected back to 3D.
    z_offset: height above the roof surface
    """
    # Convert 2D corners back to 3D
    corners_3d = []
    for cx, cy in corners_2d:
        pt_3d = origin + cx * u_basis + cy * v_basis + z_offset * np.cross(u_basis, v_basis)
        corners_3d.append(pt_3d)

    corners_3d = np.array(corners_3d)

    # Create mesh (2 triangles for the rectangle)
    faces = [[0, 1, 2], [0, 2, 3]]
    mesh = trimesh.Trimesh(corners_3d, faces, process=False)

    # Black color for solar panel
    black = [0, 0, 0, 255]  # Opaque black
    mesh.visual.face_colors = np.tile(black, (len(faces), 1))

    return mesh

# --------------------------
# Vertex snapping across roofs (with diagnostics)
# --------------------------
def snap_vertices_across_roofs(roof_positions, tol=0.01):
    """
    Merge vertices across all roof polygons that are within `tol`.
    Returns (new_roofs, diag) where diag = {points, clusters, merged}.
    """
    all_pts = []
    for poly in roof_positions:
        for p in poly:
            all_pts.append(p)
    if not all_pts:
        return roof_positions, {"points": 0, "clusters": 0, "merged": 0}

    pts = np.array(all_pts, dtype=float)
    n = len(pts)

    # naive O(n^2) clustering
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

    # build offsets to map local indices to global index
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
            centroid = index_to_centroid.get(global_idx)
            if centroid is None:
                centroid = poly[vi]
            new_poly.append(np.array(centroid, dtype=float))
        new_roofs.append(np.vstack(new_poly))

    diag = {"points": int(n), "clusters": int(len(clusters)), "merged": int(n - len(clusters))}
    return new_roofs, diag

# --------------------------
# GLB builder (roof-only, with snapping + cleanup)
# --------------------------
def build_glb_from_roofs(roofs, out_path, roof_thickness=0.25, join_threshold=0.01):
    roof_positions = [np.array(r, dtype=float) for r in roofs if len(r) >= 3]
    if not roof_positions:
        raise RuntimeError("No valid roof polygons")

    all_pts = np.vstack(roof_positions)
    origin = all_pts.mean(axis=0)

    # In ECEF coordinates, "up" is the radial direction from Earth's center
    # The origin (centroid of all points) gives us the local "up" direction
    local_up = origin / np.linalg.norm(origin)

    # Compute tilt and azimuth BEFORE centering (using ECEF local up)
    pre_rotation_data = []
    for roof_pos in roof_positions:
        tilt = compute_tilt(roof_pos, local_up=local_up)
        if tilt is not None and tilt > 5:
            az = compute_azimuth(roof_pos, local_up)
        else:
            az = None
        pre_rotation_data.append({"tilt": tilt, "azimuth": az})

    # Now center the positions for mesh generation
    roof_positions = [pos - origin for pos in roof_positions]

    snap_diag = {"points": 0, "clusters": 0, "merged": 0}
    if join_threshold is not None and join_threshold > 0.0:
        roof_positions, snap_diag = snap_vertices_across_roofs(roof_positions, tol=join_threshold)

    # Now rotate for visualization
    R = compute_alignment_rotation(roof_positions)
    roof_positions_rotated = apply_rotation(roof_positions, R)

    parts = []
    roof_infos = []

    palette = [
        ([255, 0, 0, 255], "Red"),
        ([0, 255, 0, 255], "Green"),
        ([0, 0, 255, 255], "Blue"),
        ([255, 255, 0, 255], "Yellow"),
        ([255, 0, 255, 255], "Magenta"),
        ([0, 255, 255, 255], "Cyan")
    ]

    for i, roof_pos in enumerate(roof_positions_rotated):
        mesh = region_to_mesh(roof_pos)
        if mesh:
            solid = solidify(mesh, thickness=roof_thickness, direction=-1.0)
            if solid:
                color, name = palette[i % len(palette)]
                solid.visual.face_colors = np.tile(color, (solid.faces.shape[0], 1))
                parts.append(solid)

                # Use pre-computed tilt/azimuth from before rotation
                tilt = pre_rotation_data[i]["tilt"]
                az = pre_rotation_data[i]["azimuth"]

                # Compute maximum inscribed rectangle (solar panel area)
                pts_2d, origin_2d, u_basis, v_basis, normal = project_to_2d(roof_pos)
                mir = find_max_inscribed_rectangle(pts_2d)

                mir_width = None
                mir_height = None
                mir_area = None

                if mir and mir["area"] > 0:
                    mir_width = round(mir["width"], 2)
                    mir_height = round(mir["height"], 2)
                    mir_area = round(mir["area"], 2)

                    app.logger.info(f"{name} roof (#{i+1}): tilt={tilt:.2f}°, panel area={mir_area:.2f}m² ({mir_width}x{mir_height}m)")
                else:
                    app.logger.info(f"{name} roof (#{i+1}): tilt={tilt:.2f}°, no panel area found")

                # Convert numpy types to Python native types for JSON serialization
                tilt_val = float(round(tilt, 2)) if tilt is not None else None
                is_flat = bool(tilt is not None and tilt <= 5)

                roof_infos.append({
                    "index": i + 1,
                    "tilt": tilt_val,
                    "azimuth": az,
                    "color_name": name,
                    "is_flat": is_flat,
                    "panel_width": mir_width,
                    "panel_height": mir_height,
                    "panel_area": mir_area
                })

    if not parts:
        raise RuntimeError("Mesh generation failed")

    model = trimesh.util.concatenate(parts)

    try:
        # Skip merge_vertices to keep separate colors per plane
        try:
            model.remove_duplicate_faces()
        except Exception:
            pass
        model.remove_unreferenced_vertices()
        model.fix_normals()
    except Exception as e:
        app.logger.warning("Mesh cleanup encountered an issue: %s", str(e))

    model.export(out_path)

    return {
        "total_parts": len(parts),
        "roof_count": len(roof_infos),
        "roofs": roof_infos,
        "snap_diag": snap_diag
    }

# --------------------------
# API Routes
# --------------------------
@app.route("/backend/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename, mimetype="model/gltf-binary")

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/api/detect-location")
def detect_location():
    """Detect user location by IP address"""
    try:
        g = geocoder.ip('me')
        if g.ok:
            return jsonify({
                "success": True,
                "lat": g.lat,
                "lon": g.lng,
                "city": g.city,
                "country": g.country,
                "address": f"{g.city}, {g.country}" if g.city else g.country
            })
        else:
            return jsonify({"success": False, "error": "Could not detect location"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json() or {}
        roofs = data.get("roofs", [])
        params = data.get("params", {}) or {}
        if not roofs:
            return jsonify({"error": "No roof data provided"}), 400

        join_threshold = float(params.get("join_threshold", 0.5))
        roof_thickness = float(params.get("roof_thickness", 0.25))

        stats = build_glb_from_roofs(
            roofs,
            OUT_PATH,
            roof_thickness=roof_thickness,
            join_threshold=join_threshold
        )

        save_stats(stats)

        return jsonify({
            "success": True,
            "file": OUT_FILE,
            "stats": stats
        })

    except Exception as e:
        app.logger.error(f"❌ Error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route("/api/status")
def status():
    exists = os.path.exists(OUT_PATH)
    return jsonify({
        "model_exists": exists,
        "model_file": OUT_FILE if exists else None
    })

@app.route("/api/roof-info")
def roof_info():
    stats = load_stats()
    if stats is None:
        return jsonify({"error": "No analysis data available. Please analyze a roof first."}), 404
    return jsonify(stats)

# --------------------------
# Main
# --------------------------
if __name__ == "__main__":
    import os
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=8000, debug=debug_mode, threaded=True)

