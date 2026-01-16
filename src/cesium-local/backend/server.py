from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import os
import json
import numpy as np
import trimesh
import threading
import time

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Paths
BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")
OUT_FILE = "roof_model.glb"
OUT_PATH = os.path.join(STATIC_DIR, OUT_FILE)
os.makedirs(STATIC_DIR, exist_ok=True)

# ==========================
# Geometry helpers
# ==========================
def remove_duplicate_points(region, eps=1e-3):
    clean = []
    for p in region:
        if not any(np.linalg.norm(p - q) < eps for q in clean):
            clean.append(p)
    return np.array(clean)

def snap_vertices(regions, threshold=0.8):
    """Snap nearby vertices together based on threshold"""
    all_pts = np.vstack([r['positions'] for r in regions])
    clusters = []
    for p in all_pts:
        for c in clusters:
            if np.linalg.norm(p - c[0]) < threshold:
                c.append(p)
                break
        else:
            clusters.append([p])
    centroids = [np.mean(c, axis=0) for c in clusters]

    snapped = []
    for r in regions:
        snapped_pos = np.array([
            centroids[np.argmin(np.linalg.norm(np.array(centroids) - p, axis=1))]
            for p in r['positions']
        ])
        snapped.append({
            'positions': snapped_pos,
            'mode': r['mode']
        })
    return snapped

def ensure_ccw_xy(region):
    """Ensure polygon winding CCW in XY plane"""
    if len(region) < 3:
        return region
    x, y = region[:,0], region[:,1]
    area = 0.5 * np.sum(x[:-1]*y[1:] - x[1:]*y[:-1])
    if area < 0:
        region = region[::-1]
    return region

def align_roof_regions(regions):
    """Rotate roof regions so average normal points down (-Z)"""
    roof_regions = [r for r in regions if r['mode'] == 'roof']
    if not roof_regions:
        return regions

    normals = []
    for r in roof_regions:
        pos = r['positions']
        if len(pos) < 3:
            continue
        n = np.cross(pos[1]-pos[0], pos[2]-pos[0])
        ln = np.linalg.norm(n)
        if ln > 0:
            normals.append(n/ln)

    if not normals:
        return regions

    avg = np.mean(normals, axis=0)
    avg /= np.linalg.norm(avg)

    target = np.array([0,0,-1])
    axis = np.cross(avg, target)
    if np.linalg.norm(axis) < 1e-6:
        return regions

    axis /= np.linalg.norm(axis)
    angle = np.arccos(np.clip(np.dot(avg, target), -1, 1))

    K = np.array([
        [0, -axis[2], axis[1]],
        [axis[2], 0, -axis[0]],
        [-axis[1], axis[0], 0]
    ])
    R = np.eye(3) + np.sin(angle)*K + (1-np.cos(angle))*(K@K)

    result = []
    for r in regions:
        if r['mode'] == 'roof':
            result.append({
                'positions': (R @ r['positions'].T).T,
                'mode': 'roof'
            })
        else:
            result.append(r)
    
    return result

def flatten_base_to_ground(region, global_min_z):
    """Flatten base region to XY plane at global minimum Z"""
    pos = region['positions']
    flat_pos = pos.copy()
    flat_pos[:, 2] = global_min_z  # Use global min Z instead of local
    return {
        'positions': flat_pos,
        'mode': 'base'
    }

def region_to_mesh(region_data):
    region = remove_duplicate_points(region_data['positions'])
    region = ensure_ccw_xy(region)

    if len(region) < 3:
        return None

    faces = [[0, i, i+1] for i in range(1, len(region)-1)]
    mesh = trimesh.Trimesh(region, faces, process=False)
    mesh.fix_normals()
    return mesh

def solidify_down(mesh, thickness=0.25):
    """Extrude mesh in -Z direction"""
    if mesh is None or mesh.faces.shape[0] == 0:
        return None

    top = mesh.vertices
    bottom = top + np.array([0,0,-thickness])

    verts = np.vstack([top, bottom])
    off = len(top)

    edges = mesh.edges_unique
    counts = np.bincount(mesh.edges_unique_inverse)
    boundary = edges[counts == 1]

    side_faces = []
    for a, b in boundary:
        side_faces.append([a, b, b+off])
        side_faces.append([a, b+off, a+off])

    bottom_faces = mesh.faces[:, ::-1] + off

    faces = np.vstack([
        mesh.faces,
        bottom_faces,
        np.array(side_faces)
    ])

    solid = trimesh.Trimesh(verts, faces, process=True)
    solid.remove_unreferenced_vertices()
    solid.fix_normals()
    return solid

def build_glb_from_sets(sets, out_path):
    """Build GLB from multiple region sets with base/roof modes"""
    regions = []
    for s in sets:
        positions = np.array(s['positions'], dtype=float)
        mode = s.get('mode', 'roof')
        if len(positions) >= 3:
            regions.append({
                'positions': positions,
                'mode': mode
            })
    
    if not regions:
        raise RuntimeError("No valid polygon sets")

    # Get global min Z before centering
    all_pts = np.vstack([r['positions'] for r in regions])
    global_min_z = np.min(all_pts[:, 2])
    
    # Center to origin
    origin = all_pts.mean(axis=0)
    for r in regions:
        r['positions'] = r['positions'] - origin
    
    # Update global_min_z after centering
    all_pts_centered = np.vstack([r['positions'] for r in regions])
    global_min_z = np.min(all_pts_centered[:, 2])

    # Snap vertices
    regions = snap_vertices(regions, threshold=0.8)

    # Flatten base regions using global min Z
    for i, r in enumerate(regions):
        if r['mode'] == 'base':
            regions[i] = flatten_base_to_ground(r, global_min_z)

    # Align roof regions
    regions = align_roof_regions(regions)

    # Generate meshes
    parts = []
    for r in regions:
        mesh = region_to_mesh(r)
        if mesh:
            thickness = 0.25 if r['mode'] == 'roof' else 0.3
            solid = solidify_down(mesh, thickness=thickness)
            if solid:
                parts.append(solid)

    if not parts:
        raise RuntimeError("Mesh generation failed")

    # Combine all parts
    roof = trimesh.util.concatenate(parts)
    roof.fix_normals()
    roof.export(out_path)
    
    base_count = len([r for r in regions if r['mode']=='base'])
    roof_count = len([r for r in regions if r['mode']=='roof'])
    
    return {
        'total_parts': len(parts),
        'base_count': base_count,
        'roof_count': roof_count
    }

# ==========================
# API Routes
# ==========================
@app.route("/backend/static/<path:filename>")
def serve_static(filename):
    """Serve GLB files with correct MIME type"""
    return send_from_directory(STATIC_DIR, filename, mimetype="model/gltf-binary")

@app.route("/health")
def health():
    """Health check endpoint"""
    return jsonify({"status": "ok", "timestamp": time.time()})

@app.route("/api/analyze", methods=['POST'])
def analyze():
    """
    Generate 3D model from boundary data
    Request body: { "sets": [{"positions": [[x,y,z], ...], "mode": "base|roof"}, ...] }
    """
    try:
        data = request.get_json()
        sets = data.get("sets", [])
        
        if not sets:
            return jsonify({"error": "No boundary sets provided"}), 400
        
        app.logger.info(f"📩 Received {len(sets)} polygon sets")
        
        # Generate GLB in background to avoid timeout
        stats = build_glb_from_sets(sets, OUT_PATH)
        
        app.logger.info(f"✅ Generated {stats['total_parts']} parts ({stats['base_count']} base, {stats['roof_count']} roof)")
        
        return jsonify({
            "success": True,
            "file": OUT_FILE,
            "stats": stats,
            "timestamp": time.time()
        })
        
    except Exception as e:
        app.logger.error(f"❌ Error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route("/api/status")
def status():
    """Check if model file exists"""
    exists = os.path.exists(OUT_PATH)
    return jsonify({
        "model_exists": exists,
        "model_file": OUT_FILE if exists else None,
        "timestamp": time.time()
    })

# ==========================
# Main
# ==========================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True, threaded=True)
