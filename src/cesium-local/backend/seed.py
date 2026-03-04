"""
Seed equipment catalog tables from CSV files.

Called automatically on app startup when tables are empty.
"""
import csv
import os

from .extensions import db
from .models import SolarPanel, Inverter, Battery

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def seed_catalog():
    """Populate solar_panels / inverters / batteries if empty."""
    seeded = False

    if SolarPanel.query.first() is None:
        rows = _load_csv(os.path.join(_HERE, "solar_panels_seed.csv"))
        for r in rows:
            db.session.add(SolarPanel(
                brand=r["brand"],
                model=r["model"],
                power_w=int(r["power_w"]),
                efficiency=float(r["efficiency"]),
                voc=float(r["voc"]),
                isc=float(r["isc"]),
                vmp=float(r["vmp"]),
                imp=float(r["imp"]),
                length_mm=int(r["length_mm"]),
                width_mm=int(r["width_mm"]),
                weight_kg=float(r["weight_kg"]),
                price_usd=float(r["price_usd"]),
            ))
        seeded = True

    if Inverter.query.first() is None:
        rows = _load_csv(os.path.join(_HERE, "inverters_seed.csv"))
        for r in rows:
            db.session.add(Inverter(
                brand=r["brand"],
                model=r["model"],
                power_kw=float(r["power_kw"]),
                max_dc_voltage=int(r["max_dc_voltage"]),
                mppt_count=int(r["mppt_count"]),
                efficiency=float(r["efficiency"]),
                phase=r["phase"],
                price_usd=float(r["price_usd"]),
            ))
        seeded = True

    if Battery.query.first() is None:
        rows = _load_csv(os.path.join(_HERE, "batteries_seed.csv"))
        for r in rows:
            db.session.add(Battery(
                brand=r["brand"],
                model=r["model"],
                capacity_kwh=float(r["capacity_kwh"]),
                voltage=int(r["voltage"]),
                chemistry=r["chemistry"],
                cycle_life=int(r["cycle_life"]),
                max_discharge_kw=float(r["max_discharge_kw"]),
                price_usd=float(r["price_usd"]),
            ))
        seeded = True

    if seeded:
        db.session.commit()
