"""
Application configuration.
All secrets and environment-specific settings come from environment variables.
Copy .env.example → .env and fill in values before running.
"""
import os
from dotenv import load_dotenv

# Load .env file if present (development only — production uses real env vars)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR          = os.path.dirname(__file__)            # backend/
FRONTEND_DIR      = os.path.dirname(BASE_DIR)            # cesium-local/
TEMPLATE_DIR      = os.path.join(FRONTEND_DIR, "templates")
STATIC_DIR_FRONTEND = os.path.join(FRONTEND_DIR, "static")
STATIC_DIR        = os.path.join(BASE_DIR, "static")    # backend/static/ (generated files)

# ── Generated file paths ───────────────────────────────────────────────────────
DATABASE_PATH = os.path.join(BASE_DIR, "solar.db")      # SQLite dev database
OUT_FILE      = "roof_model.glb"
OUT_PATH      = os.path.join(STATIC_DIR, OUT_FILE)
STATS_FILE    = os.path.join(STATIC_DIR, "roof_stats.json")

# ── Database URL ───────────────────────────────────────────────────────────────
# Development : sqlite:///backend/solar.db  (default, no setup needed)
# Production  : postgresql://user:pass@host:5432/dbname  (set DATABASE_URL env var)
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{DATABASE_PATH}"
)
# Heroku/Render output "postgres://" which SQLAlchemy 1.4+ requires as "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# ── App secrets ────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-CHANGE-IN-PRODUCTION")

# ── External APIs ──────────────────────────────────────────────────────────────
CESIUM_ION_TOKEN    = os.environ.get("CESIUM_ION_TOKEN", "")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
