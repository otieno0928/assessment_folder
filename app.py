import os
import socket
import time
from importlib import import_module
from flask import Flask, jsonify, make_response, render_template, request
import requests

try:
    load_dotenv = import_module("dotenv").load_dotenv
except ImportError:
    def load_dotenv():
        """Optional fallback when python-dotenv is not installed."""
        return False
        
load_dotenv()

app = Flask(__name__)

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "ee0487b43emsh256461e615f00e3p14d5eajsnbf446361bc8c").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "twelve-data1.p.rapidapi.com").strip()
CACHE_TTL = int(os.getenv("CACHE_TTL_SECONDS", "60"))

ALLOWED_INTERVALS = {
    "1min", "5min", "15min", "30min", "45min",
    "1h", "2h", "4h", "1day", "1week", "1month"
}

_QUOTE_CACHE = {}


def _to_float(value):
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace("%", "").strip())
    except (ValueError, TypeError):
        return None


def _normalize_quote(raw, fallback_symbol, interval):
    price = (
        _to_float(raw.get("close"))
        or _to_float(raw.get("price"))
        or _to_float(raw.get("open"))
    )
    return {
        "symbol": (raw.get("symbol") or fallback_symbol).upper(),
        "name": raw.get("name") or (raw.get("symbol") or fallback_symbol).upper(),
        "exchange": raw.get("exchange") or "N/A",
        "mic_code": raw.get("mic_code") or "",
        "currency": raw.get("currency") or "USD",
        "datetime": raw.get("datetime") or "",
        "interval": interval,
        "open": _to_float(raw.get("open")),
        "high": _to_float(raw.get("high")),
        "low": _to_float(raw.get("low")),
        "close": _to_float(raw.get("close")),
        "price": price,
        "previous_close": _to_float(raw.get("previous_close")),
        "change": _to_float(raw.get("change")),
        "percent_change": _to_float(raw.get("percent_change")),
        "volume": _to_float(raw.get("volume")),
    }


def _json_response(data, status=200):
    resp = make_response(jsonify(data), status)
    resp.headers["X-Served-By"] = socket.gethostname()
    return resp


@app.route("/")
def index():
    resp = make_response(render_template("index.html", hostname=socket.gethostname()))
    resp.headers["X-Served-By"] = socket.gethostname()
    return resp


@app.route("/api/health")
def health():
    return _json_response({
        "status": "ok",
        "server": socket.gethostname(),
        "api_key_configured": bool(RAPIDAPI_KEY),
        "cache_ttl_seconds": CACHE_TTL,
    })


@app.route("/api/quote")
def get_quote():
    symbol = (request.args.get("symbol") or "").strip().upper()
    interval = (request.args.get("interval") or "1day").strip()

    if not symbol:
        return _json_response({"error": "Please provide a ticker symbol (e.g., AAPL, MSFT, EUR/USD)."}, 400)

    if len(symbol) > 30:
        return _json_response({"error": "Symbol length is invalid."}, 400)

    if interval not in ALLOWED_INTERVALS:
        return _json_response({
            "error": f"Unsupported interval '{interval}'. Allowed: {', '.join(sorted(ALLOWED_INTERVALS))}."
        }, 400)

    if not RAPIDAPI_KEY:
        return _json_response({
            "error": "Server configuration error: RAPIDAPI_KEY is not set in .env."
        }, 500)

    cache_key = f"{symbol}:{interval}"
    now = time.time()
    cached = _QUOTE_CACHE.get(cache_key)
    if cached and cached[0] > now:
        payload = dict(cached[1])
        payload["cached"] = True
        return _json_response(payload, 200)

    url = f"https://{RAPIDAPI_HOST}/quote"
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }
    params = {
        "symbol": symbol,
        "interval": interval,
    }

    try:
        upstream = requests.get(url, headers=headers, params=params, timeout=12)
    except requests.Timeout:
        return _json_response({"error": "Upstream Twelve Data request timed out. Please try again."}, 504)
    except requests.RequestException as exc:
        return _json_response({"error": f"Network error contacting Twelve Data: {exc}"}, 502)

    if upstream.status_code == 429:
        return _json_response({
            "error": "Rate limit reached (8 requests/minute on free tier). Wait a moment or use cached symbols."
        }, 429)

    try:
        body = upstream.json()
    except ValueError:
        return _json_response({"error": "Received non-JSON response from Twelve Data."}, 502)

    if upstream.status_code >= 400 or body.get("status") == "error":
        msg = body.get("message") or f"API error (HTTP {upstream.status_code}) for symbol '{symbol}'."
        return _json_response({"error": msg}, 400 if upstream.status_code == 200 else upstream.status_code)

    quote = _normalize_quote(body, symbol, interval)
    payload = {
        "cached": False,
        "server": socket.gethostname(),
        "quote": quote,
    }
    _QUOTE_CACHE[cache_key] = (now + CACHE_TTL, payload)
    return _json_response(payload, 200)

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
