import numpy as np
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from scipy.spatial.distance import cdist

# ==========================
# INPUT REGIONS (RAW ECEF)
# ==========================
regions_raw = [
    np.array([
        [-3631652.5273555685, 3854716.170650155, 3542459.5129722133],
        [-3631648.851247216,  3854719.696426416, 3542463.186984844],
        [-3631647.913042451,  3854714.116699083, 3542466.3099782914],
    ]),
    np.array([
        [-3631648.7567359693, 3854719.780080401, 3542463.2526703957],
        [-3631647.3159395694, 3854721.3711513793, 3542462.8330055433],
        [-3631641.3053387934, 3854722.201725481, 3542464.315240943],
        [-3631647.7109270734, 3854714.373352955, 3542466.3461718587],
    ]),
    np.array([
        [-3631647.3573292703, 3854721.5319673894, 3542462.662360334],
        [-3631645.863214085,  3854724.4003163977, 3542457.42674828],
        [-3631641.475351992,  3854722.4042694173, 3542463.9487442183],
    ]),
    np.array([
        [-3631646.143789625,  3854724.2895214306, 3542457.204587069],
        [-3631647.6990726003, 3854721.446257896, 3542462.483424157],
        [-3631648.787920146,  3854720.161953286, 3542462.86094068],
        [-3631652.2775659016, 3854716.494660552, 3542459.24966023],
    ])
]

# ==========================
# LOCAL XYZ CONVERSION
# ==========================
all_points = np.vstack(regions_raw)
origin = all_points.mean(axis=0)
regions_local = [r - origin for r in regions_raw]

# ==========================
# SNAP VERTICES (REMOVE GAPS)
# ==========================
def snap_vertices(regions, threshold=0.8):
    all_pts = np.vstack(regions)
    clusters = []
    for p in all_pts:
        matched = False
        for c in clusters:
            if np.linalg.norm(p - c[0]) < threshold:
                c.append(p)
                matched = True
                break
        if not matched:
            clusters.append([p])
    centroids = [np.mean(c, axis=0) for c in clusters]
    snapped_regions = []
    for region in regions:
        new_region = []
        for p in region:
            dists = cdist([p], centroids)[0]
            new_region.append(centroids[np.argmin(dists)])
        snapped_regions.append(np.array(new_region))
    return snapped_regions

regions = snap_vertices(regions_local, threshold=0.8)

# ==========================
# ADD THICKNESS TO PLANES
# ==========================
thickness = 0.2  # Thin thickness value

def create_thick_plane(region, thickness):
    """Create top and bottom faces plus side faces for thickness"""
    # Calculate normal vector (pointing downward for roof)
    if len(region) >= 3:
        v1 = region[1] - region[0]
        v2 = region[2] - region[0]
        normal = np.cross(v1, v2)
        normal = normal / np.linalg.norm(normal)
        # Make sure normal points downward (negative z)
        if normal[2] > 0:
            normal = -normal
    else:
        normal = np.array([0, 0, -1])
    
    # Create bottom face by offsetting along normal
    bottom_region = region + normal * thickness
    
    faces = []
    # Top face
    faces.append(region)
    # Bottom face (reversed for correct normal)
    faces.append(bottom_region[::-1])
    
    # Side faces
    n = len(region)
    for i in range(n):
        j = (i + 1) % n
        side_face = np.array([
            region[i],
            region[j],
            bottom_region[j],
            bottom_region[i]
        ])
        faces.append(side_face)
    
    return faces

# ==========================
# PLOT SOLID ROOF WITH THICKNESS
# ==========================
fig = plt.figure(figsize=(10, 8))
ax = fig.add_subplot(111, projection='3d')

colors = ['#4b0000', '#003300', '#00004b', '#4b3b00']

for i, region in enumerate(regions):
    faces = create_thick_plane(region, thickness)
    
    for j, face in enumerate(faces):
        # Top face gets full color, bottom and sides slightly darker
        alpha = 0.85 if j == 0 else 0.7
        color = colors[i % len(colors)]
        
        face_poly = Poly3DCollection(
            [face],
            facecolor=color,
            edgecolor='black',
            linewidths=0.5,
            alpha=alpha
        )
        ax.add_collection3d(face_poly)

# ==========================
# ADD XYZ AXES AT ORIGIN
# ==========================
max_range = np.max(np.ptp(np.vstack(regions), axis=0)) / 2
axis_length = max_range * 0.6

# X axis - Red
ax.plot([0, axis_length], [0, 0], [0, 0], 'r-', linewidth=3, label='X')
ax.text(axis_length * 1.1, 0, 0, 'X', color='red', fontsize=14, fontweight='bold')

# Y axis - Green
ax.plot([0, 0], [0, axis_length], [0, 0], 'g-', linewidth=3, label='Y')
ax.text(0, axis_length * 1.1, 0, 'Y', color='green', fontsize=14, fontweight='bold')

# Z axis - Blue
ax.plot([0, 0], [0, 0], [0, axis_length], 'b-', linewidth=3, label='Z')
ax.text(0, 0, axis_length * 1.1, 'Z', color='blue', fontsize=14, fontweight='bold')

# ==========================
# AXIS CENTERED & CLEAN
# ==========================
ax.set_xlim(-max_range, max_range)
ax.set_ylim(-max_range, max_range)
ax.set_zlim(-max_range, max_range)
ax.set_title("Roof with Thickness and XYZ Axes", pad=20)

plt.show()
