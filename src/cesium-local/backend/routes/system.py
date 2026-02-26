from flask import Blueprint, jsonify, request, send_from_directory, current_app
import geocoder
import os

from ..config import OUT_FILE, OUT_PATH, STATIC_DIR
from ..services.mesh_builder import build_glb_from_roofs
from ..services.storage import load_stats, save_stats

system_bp = Blueprint("system", __name__)


@system_bp.route("/backend/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename, mimetype="model/gltf-binary")


@system_bp.route("/health")
def health():
    return jsonify({"status": "ok"})


@system_bp.route("/api/detect-location")
def detect_location():
    try:
        g = geocoder.ip("me")
        if g.ok:
            return jsonify({
                "success": True,
                "lat": g.lat,
                "lon": g.lng,
                "city": g.city,
                "country": g.country,
                "address": f"{g.city}, {g.country}" if g.city else g.country
            })
        return jsonify({"success": False, "error": "Could not detect location"}), 400
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@system_bp.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        data = request.get_json() or {}
        roofs = data.get("roofs", [])
        params = data.get("params", {}) or {}
        if not roofs:
            return jsonify({"error": "No roof data provided"}), 400

        join_threshold = float(params.get("join_threshold", 0.5))
        roof_thickness = float(params.get("roof_thickness", 0.25))

        for i, roof in enumerate(roofs, start=1):
            current_app.logger.info(
                "Drawn roof #%d: %d points -> %s",
                i,
                len(roof),
                roof
            )

        try:
            stats = build_glb_from_roofs(
                roofs,
                OUT_PATH,
                roof_thickness=roof_thickness,
                join_threshold=join_threshold
            )
        except ImportError as e:
            current_app.logger.error("Missing dependency for mesh building: %s", e, exc_info=True)
            return jsonify({"error": f"Server missing library: {str(e)}. Check backend logs."}), 500
        except RuntimeError as e:
            current_app.logger.error("Mesh build failed: %s", e, exc_info=True)
            return jsonify({"error": f"Roof mesh build failed: {str(e)}"}), 500

        save_stats(stats)

        return jsonify({
            "success": True,
            "file": OUT_FILE,
            "stats": stats
        })

    except Exception as e:
        current_app.logger.error("Analyze error: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


@system_bp.route("/api/status")
def status():
    exists = os.path.exists(OUT_PATH)
    return jsonify({
        "model_exists": exists,
        "model_file": OUT_FILE if exists else None
    })


@system_bp.route("/api/roof-info")
def roof_info():
    stats = load_stats()
    if stats is None:
        return jsonify({"error": "No analysis data available. Please analyze a roof first."}), 404
    return jsonify(stats)


@system_bp.route("/api/update-roof", methods=["POST"])
def update_roof():
    try:
        stats = load_stats()
        if stats is None:
            return jsonify({"error": "No analysis data available"}), 404

        data = request.get_json() or {}
        roof_index = data.get("index")
        user_tilt = data.get("tilt")
        user_azimuth = data.get("azimuth")

        if roof_index is None:
            return jsonify({"error": "Roof index required"}), 400

        roof_found = False
        for roof in stats.get("roofs", []):
            if roof["index"] == roof_index:
                if user_tilt is not None:
                    roof["user_tilt"] = float(user_tilt)
                if user_azimuth is not None:
                    roof["user_azimuth"] = float(user_azimuth) % 360.0
                roof_found = True
                break

        if not roof_found:
            return jsonify({"error": f"Roof #{roof_index} not found"}), 404

        save_stats(stats)
        return jsonify({"success": True, "stats": stats})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
