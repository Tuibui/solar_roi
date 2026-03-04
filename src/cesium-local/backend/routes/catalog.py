"""
REST API for equipment catalog (solar panels, inverters, batteries).

All endpoints are read-only and support optional query-string filters.
"""
from flask import Blueprint, jsonify, request

from ..models import SolarPanel, Inverter, Battery

catalog_bp = Blueprint("catalog", __name__)


@catalog_bp.route("/api/catalog/panels", methods=["GET"])
def list_panels():
    q = SolarPanel.query
    brand = request.args.get("brand")
    min_w = request.args.get("min_power", type=int)
    max_w = request.args.get("max_power", type=int)
    if brand:
        q = q.filter(SolarPanel.brand.ilike(f"%{brand}%"))
    if min_w:
        q = q.filter(SolarPanel.power_w >= min_w)
    if max_w:
        q = q.filter(SolarPanel.power_w <= max_w)
    q = q.order_by(SolarPanel.power_w.desc())
    return jsonify({"panels": [p.to_dict() for p in q.all()]})


@catalog_bp.route("/api/catalog/panels/<int:panel_id>")
def get_panel(panel_id):
    p = SolarPanel.query.get(panel_id)
    if not p:
        return jsonify({"error": "Panel not found"}), 404
    return jsonify(p.to_dict())


@catalog_bp.route("/api/catalog/inverters", methods=["GET"])
def list_inverters():
    q = Inverter.query
    brand = request.args.get("brand")
    min_kw = request.args.get("min_power", type=float)
    max_kw = request.args.get("max_power", type=float)
    phase = request.args.get("phase")
    if brand:
        q = q.filter(Inverter.brand.ilike(f"%{brand}%"))
    if min_kw:
        q = q.filter(Inverter.power_kw >= min_kw)
    if max_kw:
        q = q.filter(Inverter.power_kw <= max_kw)
    if phase:
        q = q.filter(Inverter.phase == phase)
    q = q.order_by(Inverter.power_kw.desc())
    return jsonify({"inverters": [i.to_dict() for i in q.all()]})


@catalog_bp.route("/api/catalog/inverters/<int:inverter_id>")
def get_inverter(inverter_id):
    i = Inverter.query.get(inverter_id)
    if not i:
        return jsonify({"error": "Inverter not found"}), 404
    return jsonify(i.to_dict())


@catalog_bp.route("/api/catalog/batteries", methods=["GET"])
def list_batteries():
    q = Battery.query
    brand = request.args.get("brand")
    min_kwh = request.args.get("min_capacity", type=float)
    max_kwh = request.args.get("max_capacity", type=float)
    chemistry = request.args.get("chemistry")
    if brand:
        q = q.filter(Battery.brand.ilike(f"%{brand}%"))
    if min_kwh:
        q = q.filter(Battery.capacity_kwh >= min_kwh)
    if max_kwh:
        q = q.filter(Battery.capacity_kwh <= max_kwh)
    if chemistry:
        q = q.filter(Battery.chemistry == chemistry)
    q = q.order_by(Battery.capacity_kwh.desc())
    return jsonify({"batteries": [b.to_dict() for b in q.all()]})


@catalog_bp.route("/api/catalog/batteries/<int:battery_id>")
def get_battery(battery_id):
    b = Battery.query.get(battery_id)
    if not b:
        return jsonify({"error": "Battery not found"}), 404
    return jsonify(b.to_dict())


@catalog_bp.route("/api/catalog/brands", methods=["GET"])
def list_brands():
    """Return distinct brands for each equipment type."""
    panel_brands = sorted({r.brand for r in SolarPanel.query.with_entities(SolarPanel.brand).distinct()})
    inverter_brands = sorted({r.brand for r in Inverter.query.with_entities(Inverter.brand).distinct()})
    battery_brands = sorted({r.brand for r in Battery.query.with_entities(Battery.brand).distinct()})
    return jsonify({
        "panels": panel_brands,
        "inverters": inverter_brands,
        "batteries": battery_brands,
    })
