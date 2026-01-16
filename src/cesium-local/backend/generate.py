import os
import json
import numpy as np
import trimesh
import paho.mqtt.client as mqtt

# ==========================
# Output paths
# ==========================
BASE_DIR = os.path.dirname(__file__)
OUT_DIR = os.path.join(BASE_DIR, "static")
OUT_FILE = "roof_model.glb"
OUT_PATH = os.path.join(OUT_DIR, OUT_FILE)
os.makedirs(OUT_DIR, exist_ok=True)

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
    all_pts = np.vstack(regions)
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
        snapped.append(np.array([
            centroids[np.argmin(np.linalg.norm(np.array(centroids) - p, axis=1))]
            for p in r
        ]))
    return snapped

def ensure_ccw_xy(region):
    """
    Ensure polygon winding CCW in XY plane
    """
    if len(region) < 3:
        return region
    x, y = region[:,0], region[:,1]
    area = 0.5 * np.sum(x[:-1]*y[1:] - x[1:]*y[:-1])
    if area < 0:
        region = region[::-1]
    return region

def align_regions_to_xy(regions):
    """
    Rotate all regions so average normal points down (-Z)
    """
    normals = []
    for r in regions:
        if len(r) < 3:
            continue
        n = np.cross(r[1]-r[0], r[2]-r[0])
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

    return [(R @ r.T).T for r in regions]

def region_to_mesh(region):
    region = remove_duplicate_points(region)
    region = ensure_ccw_xy(region)

    if len(region) < 3:
        return None

    faces = [[0, i, i+1] for i in range(1, len(region)-1)]
    mesh = trimesh.Trimesh(region, faces, process=False)
    mesh.fix_normals()
    return mesh

def solidify_down(mesh, thickness=0.25):
    """
    Extrude mesh in -Z direction (stable)
    """
    if mesh is None or mesh.faces.shape[0] == 0:
        return None

    top = mesh.vertices
    bottom = top + np.array([0,0,-thickness])

    verts = np.vstack([top, bottom])
    off = len(top)

    # boundary edges
    edges = mesh.edges_unique
    counts = np.bincount(mesh.edges_unique_inverse)
    boundary = edges[counts == 1]

    side_faces = []
    for a, b in boundary:
        side_faces.append([a, b, b+off])
        side_faces.append([a, b+off, a+off])

    faces = np.vstack([
        mesh.faces,
        mesh.faces + off,
        np.array(side_faces)
    ])

    solid = trimesh.Trimesh(verts, faces, process=True)
    solid.remove_unreferenced_vertices()
    solid.fix_normals()
    return solid

def build_glb_from_sets(sets, out_path):
    regions = [np.array(s, dtype=float) for s in sets if len(s) >= 3]
    if not regions:
        raise RuntimeError("No valid polygon sets")

    all_pts = np.vstack(regions)
    origin = all_pts.mean(axis=0)
    regions = [r - origin for r in regions]

    regions = snap_vertices(regions, threshold=0.8)
    regions = align_regions_to_xy(regions)

    parts = []
    for r in regions:
        mesh = region_to_mesh(r)
        solid = solidify_down(mesh, thickness=0.25)
        if solid:
            parts.append(solid)

    if not parts:
        raise RuntimeError("Mesh generation failed")

    roof = trimesh.util.concatenate(parts)
    roof.fix_normals()
    roof.export(out_path)
    return out_path

# ==========================
# MQTT
# ==========================
REQ_TOPIC = "solar/request/analyze"
RES_TOPIC = "solar/response/analyze"
MQTT_HOST = "localhost"
MQTT_PORT = 1883

def on_connect(client, userdata, flags, rc):
    print("✅ MQTT connected")
    client.subscribe(REQ_TOPIC)

def on_message(client, userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        sets = data.get("sets", [])

        print(f"📩 Received {len(sets)} polygon sets")

        path = build_glb_from_sets(sets, OUT_PATH)
        client.publish(RES_TOPIC, json.dumps({"file": OUT_FILE}))
        print("✅ GLB generated:", path)

    except Exception as e:
        print("❌ Error:", e)
        client.publish(RES_TOPIC, json.dumps({"error": str(e)}))

def main():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.loop_forever()

if __name__ == "__main__":
    main()
