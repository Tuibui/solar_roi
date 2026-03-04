"""
Application factory for Solar ROI Calculator.

Usage (development):
    flask --app backend run --debug

Usage (production):
    gunicorn "backend:create_app()" --workers 4 --bind 0.0.0.0:8000
"""
import os
from flask import Flask
from flask_cors import CORS

from .config import (
    DATABASE_URL, SECRET_KEY, IS_CLOUD,
    STATIC_DIR, STATIC_DIR_FRONTEND, TEMPLATE_DIR,
)
from .extensions import db, migrate
from .routes import register_blueprints
from .seed import seed_catalog


def create_app(config_overrides: dict = None):
    app = Flask(
        __name__,
        template_folder=TEMPLATE_DIR,
        static_folder=STATIC_DIR_FRONTEND,
        static_url_path="/static",
    )

    # ── Core config ────────────────────────────────────────────────────────────
    app.config["SQLALCHEMY_DATABASE_URI"]      = DATABASE_URL
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"]                   = SECRET_KEY

    # Allow caller to override any key (useful in tests)
    if config_overrides:
        app.config.update(config_overrides)

    # ── CORS ───────────────────────────────────────────────────────────────────
    CORS(app)

    # ── Extensions ─────────────────────────────────────────────────────────────
    db.init_app(app)
    migrate.init_app(app, db)   # enables `flask db init/migrate/upgrade`

    # ── Ensure generated-file directories exist ────────────────────────────────
    os.makedirs(STATIC_DIR, exist_ok=True)

    # ── Create tables (dev only — production uses `flask db upgrade`) ─────────
    # ── Create tables (dev only — production uses `flask db upgrade`) ─────────
    if not IS_CLOUD:
        with app.app_context():
            db.create_all()

    # ── Seed equipment catalog (idempotent — only inserts if tables empty) ────
    with app.app_context():
        seed_catalog()

    # ── Routes ─────────────────────────────────────────────────────────────────
    register_blueprints(app)

    return app
