from flask import Blueprint, redirect, render_template, send_from_directory, url_for

from ..config import FRONTEND_DIR

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    return redirect(url_for("pages.app_page"))


@pages_bp.route("/login")
def login():
    return render_template("login.html")


@pages_bp.route("/register")
def register():
    return render_template("register.html")


@pages_bp.route("/app")
def app_page():
    return render_template("app.html")


@pages_bp.route("/calculate")
def calculate_page():
    return render_template("calculate.html")


@pages_bp.route("/methodology")
def methodology():
    return render_template("methodology.html")


@pages_bp.route("/team")
def team():
    return render_template("team.html")


@pages_bp.route("/contact")
def contact():
    return render_template("contact.html")


@pages_bp.route("/Build/<path:filename>")
def serve_build(filename):
    return send_from_directory(f"{FRONTEND_DIR}/Build", filename)
