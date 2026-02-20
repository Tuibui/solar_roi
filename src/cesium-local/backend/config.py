import os

BASE_DIR = os.path.dirname(__file__)
FRONTEND_DIR = os.path.dirname(BASE_DIR)
TEMPLATE_DIR = os.path.join(FRONTEND_DIR, "templates")
STATIC_DIR_FRONTEND = os.path.join(FRONTEND_DIR, "static")
STATIC_DIR = os.path.join(BASE_DIR, "static")
DATABASE_PATH = os.path.join(BASE_DIR, "solar.db")

OUT_FILE = "roof_model.glb"
OUT_PATH = os.path.join(STATIC_DIR, OUT_FILE)
STATS_FILE = os.path.join(STATIC_DIR, "roof_stats.json")
