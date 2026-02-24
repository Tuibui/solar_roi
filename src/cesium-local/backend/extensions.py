"""
Flask extension instances.
Initialised here (without app) then bound in create_app() via init_app().
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db      = SQLAlchemy()
migrate = Migrate()
