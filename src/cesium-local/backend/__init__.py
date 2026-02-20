import os
import sqlite3
from flask import Flask
from flask_cors import CORS

from .config import DATABASE_PATH, STATIC_DIR, STATIC_DIR_FRONTEND, TEMPLATE_DIR
from .extensions import db
from .routes import register_blueprints


def _migrate_appliances_table():
    """Migrate appliances table: replace usage_time with usage_start/usage_end."""
    if not os.path.exists(DATABASE_PATH):
        return
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(appliances)")
    columns = {row[1] for row in cursor.fetchall()}
    if 'usage_time' in columns and 'usage_start' not in columns:
        cursor.execute("ALTER TABLE appliances ADD COLUMN usage_start TEXT DEFAULT '06:00'")
        cursor.execute("ALTER TABLE appliances ADD COLUMN usage_end TEXT DEFAULT '22:00'")
        cursor.execute("""
            UPDATE appliances SET
                usage_start = CASE usage_time
                    WHEN 'day' THEN '06:00'
                    WHEN 'night' THEN '18:00'
                    ELSE '06:00'
                END,
                usage_end = CASE usage_time
                    WHEN 'day' THEN '18:00'
                    WHEN 'night' THEN '06:00'
                    ELSE '22:00'
                END
        """)
        conn.commit()
    elif 'usage_start' not in columns:
        cursor.execute("ALTER TABLE appliances ADD COLUMN usage_start TEXT DEFAULT '06:00'")
        cursor.execute("ALTER TABLE appliances ADD COLUMN usage_end TEXT DEFAULT '22:00'")
        conn.commit()
    conn.close()


def _migrate_grid_export_price():
    """Add grid_export_price column to projects table if missing."""
    if not os.path.exists(DATABASE_PATH):
        return
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(projects)")
    columns = {row[1] for row in cursor.fetchall()}
    if 'grid_export_price' not in columns:
        cursor.execute("ALTER TABLE projects ADD COLUMN grid_export_price FLOAT")
        conn.commit()
    conn.close()


def create_app():
    app = Flask(
        __name__,
        template_folder=TEMPLATE_DIR,
        static_folder=STATIC_DIR_FRONTEND,
        static_url_path="/static"
    )
    CORS(app)

    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DATABASE_PATH}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")

    os.makedirs(STATIC_DIR, exist_ok=True)

    _migrate_appliances_table()
    _migrate_grid_export_price()

    db.init_app(app)
    with app.app_context():
        db.create_all()

    register_blueprints(app)
    return app
