"""
Database models for Solar ROI Calculator
"""
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import json

from .extensions import db


class User(db.Model):
    """User model for authentication"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    projects = db.relationship('Project', backref='user', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Project(db.Model):
    """Solar project/dataset model"""
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)

    # Location data
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    address = db.Column(db.String(500), nullable=True)

    # Shading configuration
    shading_method = db.Column(db.String(20), default='ratio')  # 'ratio' or 'level'
    shading_ratio = db.Column(db.Float, default=0.8)
    shading_level = db.Column(db.String(20), nullable=True)  # 'low', 'medium', 'high'

    # Electricity bill
    monthly_kwh = db.Column(db.Float, nullable=True)
    annual_kwh = db.Column(db.Float, nullable=True)

    # Tariff
    tariff_price = db.Column(db.Float, default=4.5)
    tariff_currency = db.Column(db.String(10), default='THB')

    # Grid export
    grid_export_allowed = db.Column(db.Boolean, default=True)
    grid_export_price = db.Column(db.Float, nullable=True)

    # System preference
    system_type = db.Column(db.String(20), default='auto')  # 'auto', 'ongrid', 'hybrid'

    # Selected roof for calculations
    selected_roof_index = db.Column(db.Integer, default=0)

    # Capture image path (map snapshot)
    capture_image_path = db.Column(db.String(300), nullable=True)
    # 3D model snapshot path
    capture_model_path = db.Column(db.String(300), nullable=True)
    # Capture images as base64 (persistent across deploys)
    capture_image_b64 = db.Column(db.Text, nullable=True)
    capture_model_b64 = db.Column(db.Text, nullable=True)

    # Equipment lists (stored as JSON text)
    inverters_json = db.Column(db.Text, nullable=True)
    batteries_json = db.Column(db.Text, nullable=True)
    panels_json = db.Column(db.Text, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    roofs = db.relationship('Roof', backref='project', lazy=True, cascade='all, delete-orphan')
    appliances = db.relationship('Appliance', backref='project', lazy=True, cascade='all, delete-orphan')

    def to_dict(self, include_relations=True):
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'location': {
                'lat': self.latitude,
                'lon': self.longitude,
                'address': self.address
            },
            'shading': {
                'method': self.shading_method,
                'ratio': self.shading_ratio,
                'level': self.shading_level
            },
            'bill': {
                'monthly_kwh': self.monthly_kwh,
                'annual_kwh': self.annual_kwh
            },
            'tariff': {
                'price': self.tariff_price,
                'currency': self.tariff_currency
            },
            'grid_export': {
                'allowed': self.grid_export_allowed,
                'price': self.grid_export_price
            },
            'system': {
                'type': self.system_type
            },
            'selected_roof_index': self.selected_roof_index,
            'capture_image_path': f'/api/projects/{self.id}/capture/roof' if self.capture_image_b64 else self.capture_image_path,
            'capture_model_path': f'/api/projects/{self.id}/capture/model' if self.capture_model_b64 else self.capture_model_path,
            'inverters': self._parse_json_list(self.inverters_json),
            'batteries': self._parse_json_list(self.batteries_json),
            'panels': self._parse_json_list(self.panels_json),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

        if include_relations:
            data['roofs'] = [roof.to_dict() for roof in self.roofs]
            data['appliances'] = [app.to_dict() for app in self.appliances]

        return data

    @staticmethod
    def _parse_json_list(value):
        if not value:
            return []
        try:
            data = json.loads(value)
            return data if isinstance(data, list) else []
        except Exception:
            return []


class Roof(db.Model):
    """Roof plane model"""
    __tablename__ = 'roofs'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    index = db.Column(db.Integer, nullable=False)  # Roof plane index within project

    # Roof geometry
    tilt = db.Column(db.Float, nullable=True)  # degrees
    azimuth = db.Column(db.Float, nullable=True)  # degrees
    area = db.Column(db.Float, nullable=True)  # square meters

    # Panel dimensions
    panel_width = db.Column(db.Float, nullable=True)
    panel_height = db.Column(db.Float, nullable=True)
    panel_area = db.Column(db.Float, nullable=True)

    # Color for visualization
    color_name = db.Column(db.String(20), nullable=True)

    # Flags
    is_flat = db.Column(db.Boolean, default=False)
    needs_user_input = db.Column(db.Boolean, default=False)

    # User overrides
    user_tilt = db.Column(db.Float, nullable=True)
    user_azimuth = db.Column(db.Float, nullable=True)

    # Polygon data stored as JSON
    polygon_json = db.Column(db.Text, nullable=True)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def polygon(self):
        if self.polygon_json:
            return json.loads(self.polygon_json)
        return []

    @polygon.setter
    def polygon(self, value):
        self.polygon_json = json.dumps(value) if value else None

    def to_dict(self):
        return {
            'id': self.id,
            'index': self.index,
            'tilt': self.tilt,
            'azimuth': self.azimuth,
            'area': self.area,
            'panel_width': self.panel_width,
            'panel_height': self.panel_height,
            'panel_area': self.panel_area,
            'color_name': self.color_name,
            'is_flat': self.is_flat,
            'needs_user_input': self.needs_user_input,
            'user_tilt': self.user_tilt,
            'user_azimuth': self.user_azimuth,
            'polygon': self.polygon
        }


class SolarPanel(db.Model):
    """Solar panel product catalog"""
    __tablename__ = 'solar_panels'

    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(100), nullable=False, index=True)
    model = db.Column(db.String(200), nullable=False)
    power_w = db.Column(db.Integer, nullable=False)
    efficiency = db.Column(db.Float, nullable=False)
    voc = db.Column(db.Float)      # open-circuit voltage
    isc = db.Column(db.Float)      # short-circuit current
    vmp = db.Column(db.Float)      # max-power voltage
    imp = db.Column(db.Float)      # max-power current
    length_mm = db.Column(db.Integer)
    width_mm = db.Column(db.Integer)
    weight_kg = db.Column(db.Float)
    price_usd = db.Column(db.Float)

    def to_dict(self):
        return {
            'id': self.id,
            'brand': self.brand,
            'model': self.model,
            'power_w': self.power_w,
            'efficiency': self.efficiency,
            'voc': self.voc,
            'isc': self.isc,
            'vmp': self.vmp,
            'imp': self.imp,
            'length_mm': self.length_mm,
            'width_mm': self.width_mm,
            'weight_kg': self.weight_kg,
            'price_usd': self.price_usd,
        }


class Inverter(db.Model):
    """Inverter product catalog"""
    __tablename__ = 'inverters'

    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(100), nullable=False, index=True)
    model = db.Column(db.String(200), nullable=False)
    power_kw = db.Column(db.Float, nullable=False)
    max_dc_voltage = db.Column(db.Integer)
    mppt_count = db.Column(db.Integer)
    efficiency = db.Column(db.Float)
    phase = db.Column(db.String(10))   # 'single' or 'three'
    price_usd = db.Column(db.Float)

    def to_dict(self):
        return {
            'id': self.id,
            'brand': self.brand,
            'model': self.model,
            'power_kw': self.power_kw,
            'max_dc_voltage': self.max_dc_voltage,
            'mppt_count': self.mppt_count,
            'efficiency': self.efficiency,
            'phase': self.phase,
            'price_usd': self.price_usd,
        }


class Battery(db.Model):
    """Battery product catalog"""
    __tablename__ = 'batteries'

    id = db.Column(db.Integer, primary_key=True)
    brand = db.Column(db.String(100), nullable=False, index=True)
    model = db.Column(db.String(200), nullable=False)
    capacity_kwh = db.Column(db.Float, nullable=False)
    voltage = db.Column(db.Integer)
    chemistry = db.Column(db.String(20))
    cycle_life = db.Column(db.Integer)
    max_discharge_kw = db.Column(db.Float)
    price_usd = db.Column(db.Float)

    def to_dict(self):
        return {
            'id': self.id,
            'brand': self.brand,
            'model': self.model,
            'capacity_kwh': self.capacity_kwh,
            'voltage': self.voltage,
            'chemistry': self.chemistry,
            'cycle_life': self.cycle_life,
            'max_discharge_kw': self.max_discharge_kw,
            'price_usd': self.price_usd,
        }


class Appliance(db.Model):
    """Appliance model for energy consumption"""
    __tablename__ = 'appliances'

    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)

    name = db.Column(db.String(100), nullable=False)
    power = db.Column(db.Float, nullable=False)  # watts
    quantity = db.Column(db.Integer, default=1)
    usage_start = db.Column(db.String(5), default='06:00')
    usage_end = db.Column(db.String(5), default='22:00')

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @property
    def hours(self):
        """Auto-calculate hours from usage_start and usage_end, wrapping around midnight."""
        try:
            sh, sm = map(int, self.usage_start.split(':'))
            eh, em = map(int, self.usage_end.split(':'))
            start_min = sh * 60 + sm
            end_min = eh * 60 + em
            diff = end_min - start_min
            if diff <= 0:
                diff += 24 * 60
            return round(diff / 60, 2)
        except (ValueError, AttributeError):
            return 16.0

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'power': self.power,
            'hours': self.hours,
            'quantity': self.quantity,
            'usage_start': self.usage_start,
            'usage_end': self.usage_end
        }
