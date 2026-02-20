from flask import Blueprint, current_app, jsonify, request, send_from_directory
import os
import numpy as np

from ..config import STATIC_DIR
from ..extensions import db
from ..models import Appliance, Project, Roof, User
from ..irradiation import compute_multi_roof_irradiation, PVGISError
from ..sizing import size_pv_system
from ..services.geometry import latlon_to_ecef
from ..services.mesh_builder import build_glb_from_roofs

projects_bp = Blueprint("projects", __name__)


@projects_bp.route("/api/projects", methods=["GET"])
def get_projects():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    projects = Project.query.filter_by(user_id=user_id).order_by(Project.updated_at.desc()).all()
    return jsonify({
        "projects": [p.to_dict() for p in projects]
    })


@projects_bp.route("/api/projects/<int:project_id>")
def get_project(project_id):
    project = Project.query.get(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404
    return jsonify(project.to_dict())


@projects_bp.route("/api/projects", methods=["POST"])
def create_project():
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        project = Project(
            user_id=user_id,
            name=data.get("name", "Untitled Project"),
            latitude=data.get("latitude"),
            longitude=data.get("longitude"),
            address=data.get("address"),
            shading_method=data.get("shading_method", "ratio"),
            shading_ratio=data.get("shading_ratio", 0.8),
            shading_level=data.get("shading_level"),
            monthly_kwh=data.get("monthly_kwh"),
            annual_kwh=data.get("annual_kwh"),
            tariff_price=data.get("tariff_price", 4.5),
            tariff_currency=data.get("tariff_currency", "THB"),
            grid_export_allowed=data.get("grid_export_allowed", True),
            grid_export_price=data.get("grid_export_price"),
            system_type=data.get("system_type", "auto"),
            selected_roof_index=data.get("selected_roof_index", 0)
        )

        db.session.add(project)
        db.session.commit()

        roofs_data = data.get("roofs", [])
        for i, roof_data in enumerate(roofs_data):
            roof = Roof(
                project_id=project.id,
                index=roof_data.get("index", i),
                tilt=roof_data.get("tilt"),
                azimuth=roof_data.get("azimuth"),
                area=roof_data.get("area"),
                panel_width=roof_data.get("panel_width"),
                panel_height=roof_data.get("panel_height"),
                panel_area=roof_data.get("panel_area"),
                color_name=roof_data.get("color_name"),
                is_flat=roof_data.get("is_flat", False),
                needs_user_input=roof_data.get("needs_user_input", False),
                user_tilt=roof_data.get("user_tilt"),
                user_azimuth=roof_data.get("user_azimuth")
            )
            roof.polygon = roof_data.get("polygon", [])
            db.session.add(roof)

        appliances_data = data.get("appliances", [])
        for app_data in appliances_data:
            appliance = Appliance(
                project_id=project.id,
                name=app_data.get("name", "Unknown"),
                power=app_data.get("power", 0),
                quantity=app_data.get("quantity", 1),
                usage_start=app_data.get("usage_start", "06:00"),
                usage_end=app_data.get("usage_end", "22:00")
            )
            db.session.add(appliance)

        db.session.commit()

        return jsonify({
            "success": True,
            "project": project.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.error("Error creating project: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/projects/<int:project_id>", methods=["PUT"])
def update_project(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        data = request.get_json() or {}

        if "name" in data:
            project.name = data["name"]
        if "latitude" in data:
            project.latitude = data["latitude"]
        if "longitude" in data:
            project.longitude = data["longitude"]
        if "address" in data:
            project.address = data["address"]
        if "shading_method" in data:
            project.shading_method = data["shading_method"]
        if "shading_ratio" in data:
            project.shading_ratio = data["shading_ratio"]
        if "shading_level" in data:
            project.shading_level = data["shading_level"]
        if "monthly_kwh" in data:
            project.monthly_kwh = data["monthly_kwh"]
        if "annual_kwh" in data:
            project.annual_kwh = data["annual_kwh"]
        if "tariff_price" in data:
            project.tariff_price = data["tariff_price"]
        if "tariff_currency" in data:
            project.tariff_currency = data["tariff_currency"]
        if "grid_export_allowed" in data:
            project.grid_export_allowed = data["grid_export_allowed"]
        if "grid_export_price" in data:
            project.grid_export_price = data["grid_export_price"]
        if "system_type" in data:
            project.system_type = data["system_type"]
        if "selected_roof_index" in data:
            project.selected_roof_index = data["selected_roof_index"]

        if "roofs" in data:
            Roof.query.filter_by(project_id=project.id).delete()
            for i, roof_data in enumerate(data["roofs"]):
                roof = Roof(
                    project_id=project.id,
                    index=roof_data.get("index", i),
                    tilt=roof_data.get("tilt"),
                    azimuth=roof_data.get("azimuth"),
                    area=roof_data.get("area"),
                    panel_width=roof_data.get("panel_width"),
                    panel_height=roof_data.get("panel_height"),
                    panel_area=roof_data.get("panel_area"),
                    color_name=roof_data.get("color_name"),
                    is_flat=roof_data.get("is_flat", False),
                    needs_user_input=roof_data.get("needs_user_input", False),
                    user_tilt=roof_data.get("user_tilt"),
                    user_azimuth=roof_data.get("user_azimuth")
                )
                roof.polygon = roof_data.get("polygon", [])
                db.session.add(roof)

        if "appliances" in data:
            Appliance.query.filter_by(project_id=project.id).delete()
            for app_data in data["appliances"]:
                appliance = Appliance(
                    project_id=project.id,
                    name=app_data.get("name", "Unknown"),
                    power=app_data.get("power", 0),
                    quantity=app_data.get("quantity", 1),
                    usage_start=app_data.get("usage_start", "06:00"),
                    usage_end=app_data.get("usage_end", "22:00")
                )
                db.session.add(appliance)

        db.session.commit()

        return jsonify({
            "success": True,
            "project": project.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        current_app.logger.error("Error updating project: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/projects/<int:project_id>", methods=["DELETE"])
def delete_project(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        db.session.delete(project)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Project deleted"
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/projects/<int:project_id>/appliances", methods=["GET"])
def get_appliances(project_id):
    project = Project.query.get(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    return jsonify({
        "appliances": [a.to_dict() for a in project.appliances]
    })


@projects_bp.route("/api/projects/<int:project_id>/appliances", methods=["POST"])
def add_appliance(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        data = request.get_json() or {}

        appliance = Appliance(
            project_id=project_id,
            name=data.get("name", "Unknown"),
            power=data.get("power", 0),
            quantity=data.get("quantity", 1),
            usage_start=data.get("usage_start", "06:00"),
            usage_end=data.get("usage_end", "22:00")
        )
        db.session.add(appliance)
        db.session.commit()

        return jsonify({
            "success": True,
            "appliance": appliance.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/appliances/<int:appliance_id>", methods=["DELETE"])
def delete_appliance(appliance_id):
    try:
        appliance = Appliance.query.get(appliance_id)
        if not appliance:
            return jsonify({"error": "Appliance not found"}), 404

        db.session.delete(appliance)
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Appliance deleted"
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/projects/<int:project_id>/roofs", methods=["GET"])
def get_roofs(project_id):
    project = Project.query.get(project_id)
    if not project:
        return jsonify({"error": "Project not found"}), 404

    return jsonify({
        "roofs": [r.to_dict() for r in project.roofs]
    })


@projects_bp.route("/api/projects/<int:project_id>/model", methods=["GET"])
def get_project_model(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        roofs = sorted(project.roofs, key=lambda r: r.index or 0)
        if not roofs:
            return jsonify({"error": "Project has no roofs"}), 400

        roof_polygons = []

        for roof in roofs:
            polygon = roof.polygon or []
            if len(polygon) < 3:
                continue

            coords = []

            for point in polygon:
                if isinstance(point, dict):
                    lat = point.get("lat")
                    lon = point.get("lon")
                    height = point.get("height", 0.0)
                elif isinstance(point, (list, tuple)) and len(point) >= 2:
                    lat = point[0]
                    lon = point[1]
                    height = point[2] if len(point) > 2 else 0.0
                else:
                    continue

                if lat is None or lon is None:
                    continue

                coords.append(
                    latlon_to_ecef(lat, lon, altitude=height)
                )

            if len(coords) >= 3:
                roof_polygons.append(np.vstack(coords))

        if not roof_polygons:
            return jsonify({"error": "No valid roof polygons for model"}), 400

        lite = request.args.get("lite", "0") == "1"
        refresh = request.args.get("refresh", "0") == "1"

        model_name = f"project_{project_id}_roof_model{'_lite' if lite else ''}.glb"
        model_path = os.path.join(STATIC_DIR, model_name)

        if not refresh and os.path.exists(model_path):
            return send_from_directory(
                STATIC_DIR,
                model_name,
                mimetype="model/gltf-binary"
            )

        build_glb_from_roofs(
            roof_polygons,
            model_path,
            roof_thickness=0.3,
            join_threshold=0.0 if lite else 0.01,
            solidify_roofs=True,
            compute_panels=not lite
        )

        return send_from_directory(
            STATIC_DIR,
            model_name,
            mimetype="model/gltf-binary"
        )

    except Exception as e:
        current_app.logger.error(
            "Error building project model: %s", e, exc_info=True
        )
        return jsonify({"error": str(e)}), 500



@projects_bp.route("/api/roofs/<int:roof_id>", methods=["PUT"])
def update_roof_db(roof_id):
    try:
        roof = Roof.query.get(roof_id)
        if not roof:
            return jsonify({"error": "Roof not found"}), 404

        data = request.get_json() or {}

        if "user_tilt" in data:
            roof.user_tilt = data["user_tilt"]
        if "user_azimuth" in data:
            roof.user_azimuth = data["user_azimuth"] % 360.0 if data["user_azimuth"] else None

        db.session.commit()

        return jsonify({
            "success": True,
            "roof": roof.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/projects/<int:project_id>/irradiation", methods=["GET"])
def get_irradiation(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        if not project.latitude or not project.longitude:
            return jsonify({"error": "Project has no location data"}), 400

        roofs = project.roofs
        if not roofs:
            return jsonify({"error": "Project has no roofs"}), 400

        roof_indices_param = request.args.get("roof_indices", "all")
        lat = project.latitude
        lon = project.longitude

        roof_data = []
        for roof in roofs:
            roof_data.append({
                "index": roof.index,
                "tilt": roof.user_tilt or roof.tilt or 15,
                "azimuth": roof.user_azimuth or roof.azimuth or 180,
                "area": roof.area or 1,
                "user_tilt": roof.user_tilt,
                "user_azimuth": roof.user_azimuth
            })

        if roof_indices_param == "all":
            selected_indices = None
        else:
            try:
                selected_indices = [int(idx.strip()) for idx in roof_indices_param.split(",") if idx.strip()]
                if not selected_indices:
                    selected_indices = None
            except ValueError:
                return jsonify({"error": "Invalid roof_indices format. Use comma-separated integers or 'all'."}), 400

        result = compute_multi_roof_irradiation(lat, lon, roof_data, roof_indices=selected_indices)

        response = {
            "success": True,
            "data_source": "PVGIS",
            "aggregation_method": "area_weighted_average",
            "roof_indices": "all" if selected_indices is None else selected_indices,
            "roof_count": len(roofs),
            "selected_count": result.get("successful_count", len(roofs)),
            "location": {"lat": lat, "lon": lon},
            "monthly_kwh_m2": result["monthly"],
            "annual_kwh_m2": result["annual"],
            "daily_avg_kwh_m2": result["daily_avg"],
            "total_energy_monthly_kwh": result["total_energy_monthly"],
            "total_energy_annual_kwh": result["total_energy_annual"],
            "total_area_m2": result["total_area"],
            "per_roof": result.get("per_roof", [])
        }

        return jsonify(response)

    except PVGISError as e:
        current_app.logger.error("PVGIS API error: %s", e)
        return jsonify({"error": f"PVGIS API error: {str(e)}"}), 502
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error("Error computing irradiation: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/api/projects/<int:project_id>/sizing", methods=["GET"])
def get_sizing(project_id):
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({"error": "Project not found"}), 404

        if not project.latitude or not project.longitude:
            return jsonify({"error": "Project has no location data"}), 400

        roofs = project.roofs
        if not roofs:
            return jsonify({"error": "Project has no roofs"}), 400

        appliances = project.appliances or []

        roof_indices_param = request.args.get("roof_indices", "all")
        lat = project.latitude
        lon = project.longitude

        roof_data = []
        for roof in roofs:
            roof_data.append({
                "index": roof.index,
                "tilt": roof.user_tilt or roof.tilt or 15,
                "azimuth": roof.user_azimuth or roof.azimuth or 180,
                "area": roof.area or 1,
                "user_tilt": roof.user_tilt,
                "user_azimuth": roof.user_azimuth
            })

        if roof_indices_param == "all":
            selected_indices = None
        else:
            try:
                selected_indices = [int(idx.strip()) for idx in roof_indices_param.split(",") if idx.strip()]
                if not selected_indices:
                    selected_indices = None
            except ValueError:
                return jsonify({"error": "Invalid roof_indices format. Use comma-separated integers or 'all'."}), 400

        irradiation = compute_multi_roof_irradiation(lat, lon, roof_data, roof_indices=selected_indices)

        if selected_indices is None:
            selected_roofs = roof_data
        else:
            selected_roofs = [r for r in roof_data if r.get("index") in selected_indices]

        appliances_payload = [a.to_dict() for a in appliances]
        shading_ratio = project.shading_ratio or 0.8

        sizing_result = size_pv_system(
            appliances_payload,
            irradiation,
            selected_roofs,
            shading_ratio=shading_ratio
        )

        response = {
            "success": True,
            "roof_indices": "all" if selected_indices is None else selected_indices,
            "location": {"lat": lat, "lon": lon},
        }
        response.update(sizing_result)

        return jsonify(response)

    except PVGISError as e:
        current_app.logger.error("PVGIS API error: %s", e)
        return jsonify({"error": f"PVGIS API error: {str(e)}"}), 502
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        current_app.logger.error("Error computing sizing: %s", e, exc_info=True)
        return jsonify({"error": str(e)}), 500
