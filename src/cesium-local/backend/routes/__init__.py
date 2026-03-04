from .auth import auth_bp
from .catalog import catalog_bp
from .pages import pages_bp
from .projects import projects_bp
from .system import system_bp


def register_blueprints(app):
    app.register_blueprint(pages_bp)
    app.register_blueprint(system_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(projects_bp)
    app.register_blueprint(catalog_bp)
