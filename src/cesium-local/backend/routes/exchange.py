"""
Real-time exchange rate endpoint.
Fetches rates from frankfurter.app (free, no API key) and caches for 1 hour.
"""
import time, requests
from flask import Blueprint, jsonify

exchange_bp = Blueprint("exchange", __name__)

_cache = {"rates": None, "ts": 0}
CACHE_TTL = 3600  # 1 hour

FALLBACK_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "JPY": 149.5,
    "THB": 35.2,
    "CNY": 7.25,
    "KRW": 1350.0,
    "GBP": 0.79,
    "AUD": 1.55,
    "INR": 83.5,
}


def _fetch_rates():
    """Fetch live rates (base USD) from frankfurter.app."""
    now = time.time()
    if _cache["rates"] and (now - _cache["ts"]) < CACHE_TTL:
        return _cache["rates"]
    try:
        symbols = ",".join(k for k in FALLBACK_RATES if k != "USD")
        resp = requests.get(
            f"https://api.frankfurter.app/latest?from=USD&to={symbols}",
            timeout=5,
        )
        resp.raise_for_status()
        data = resp.json()
        rates = {"USD": 1.0}
        rates.update(data.get("rates", {}))
        _cache["rates"] = rates
        _cache["ts"] = now
        return rates
    except Exception:
        if _cache["rates"]:
            return _cache["rates"]
        return dict(FALLBACK_RATES)


@exchange_bp.route("/api/exchange/rates", methods=["GET"])
def get_rates():
    rates = _fetch_rates()
    return jsonify({"base": "USD", "rates": rates})
