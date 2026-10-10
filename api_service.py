"""Live San Francisco data for Earthstars: weather (OpenWeather), air quality (WAQI) and community gardens (OpenStreetMap)."""
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _require_env(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing {name}. Set it in your host's environment variables, or locally copy .env.example to .env and add your key.")
    return value


OPENWEATHER_API_KEY = _require_env("OPENWEATHER_API_KEY")
WAQI_TOKEN = _require_env("WAQI_TOKEN")

SF_CENTER = (37.7749, -122.4194)
SF_BOUNDS = (37.7080, -122.5149, 37.8324, -122.3570)  # south, west, north, east (city limits)

TIMEOUT_S = 20
HEADERS = {"User-Agent": "EarthstarsHackathon/1.0"}
STALE_AFTER_S = 24 * 60 * 60       # readings older than a day are flagged, never presented as live
CONDITIONS_TTL_S = 10 * 60         # AQI and weather update hourly; don't re-ask on every page load
GARDENS_TTL_S = 24 * 60 * 60
FALLBACK_TTL_S = 10 * 60
OVERPASS_RETRY_PAUSE_S = 3
OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

_cache = {}


def _cached(key, ttl_s, fetch):
    """ttl_s may be a number or a function of the fetched value (so fallback results can expire sooner)."""
    hit = _cache.get(key)
    if hit and time.time() < hit[0]:
        return hit[1]
    value = fetch()
    if value is not False:  # never cache failures
        _cache[key] = (time.time() + (ttl_s(value) if callable(ttl_s) else ttl_s), value)
    return value


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _is_stale(iso_time):
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(iso_time)
    except (TypeError, ValueError):
        return True
    return age.total_seconds() > STALE_AFTER_S


def _number(value):
    return value if isinstance(value, (int, float)) else None


# ---------- weather ----------

def get_weather():
    return _cached("weather", CONDITIONS_TTL_S, _fetch_weather)


def _fetch_weather():
    lat, lng = SF_CENTER
    url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lng}&appid={OPENWEATHER_API_KEY}&units=metric"
    response = requests.get(url, timeout=TIMEOUT_S)
    if response.status_code != 200:
        print(f"Failed to fetch weather data. Error code: {response.status_code}")
        return False

    data = response.json()
    weather = (data.get("weather") or [{}])[0]
    return {
        "Condition": weather.get("main", "N/A"),
        "Description": weather.get("description", ""),
        "Temperature": _number(data.get("main", {}).get("temp")),
        "Humidity": _number(data.get("main", {}).get("humidity")),
        "Wind Speed": _number(data.get("wind", {}).get("speed")),
        "Updated": datetime.fromtimestamp(data.get("dt", time.time()), tz=timezone.utc).isoformat()
    }


# ---------- air quality ----------

def get_air_quality():
    return _cached("air", CONDITIONS_TTL_S, _fetch_air_quality)


def _fetch_air_quality():
    """The WAQI monitor nearest the city centre, with every pollutant sub-index it reports."""
    lat, lng = SF_CENTER
    response = requests.get(f"https://api.waqi.info/feed/geo:{lat};{lng}/?token={WAQI_TOKEN}", timeout=TIMEOUT_S)
    if response.status_code != 200 or response.json().get("status") != "ok":
        print("Failed to fetch air quality data")
        return False

    data = response.json()["data"]
    iaqi = data.get("iaqi", {})
    updated = data.get("time", {}).get("iso", "")
    return {
        "Station": data.get("city", {}).get("name", "Unknown station"),
        "Station URL": data.get("city", {}).get("url", ""),
        "AQI": _number(data.get("aqi")),
        "Dominant Pollutant": data.get("dominentpol", ""),
        "PM2.5": _number(iaqi.get("pm25", {}).get("v")),
        "Ozone": _number(iaqi.get("o3", {}).get("v")),
        "Carbon Monoxide": _number(iaqi.get("co", {}).get("v")),
        "Nitrogen Dioxide": _number(iaqi.get("no2", {}).get("v")),
        "Updated": updated,
        "Stale": _is_stale(updated)
    }


def get_air_monitors():
    return _cached("monitors", CONDITIONS_TTL_S, _fetch_air_monitors)


def _fetch_air_monitors():
    """Every WAQI monitor inside San Francisco with a reading from the last 24 hours."""
    south, west, north, east = SF_BOUNDS
    url = f"https://api.waqi.info/map/bounds?latlng={south},{west},{north},{east}&networks=all&token={WAQI_TOKEN}"
    response = requests.get(url, timeout=TIMEOUT_S)
    if response.status_code != 200 or response.json().get("status") != "ok":
        print("Failed to fetch air monitors")
        return False

    monitors = []
    for item in response.json().get("data", []):
        aqi = item.get("aqi")
        updated = item.get("station", {}).get("time", "")
        if not str(aqi).isdigit() or _is_stale(updated):
            continue  # "-" means no current reading
        monitors.append({
            "Station ID": item.get("uid"),
            "Name": item.get("station", {}).get("name", "Air monitor"),
            "AQI": int(aqi),
            "Updated": updated,
            "Latitude": item.get("lat"),
            "Longitude": item.get("lon")
        })
    return sorted(monitors, key=lambda m: m["AQI"], reverse=True)


# ---------- community gardens ----------

def get_gardens():
    # Keep a full Overpass result for a day; retry soon if we had to fall back to Nominatim's shorter list.
    return _cached("gardens", lambda result: GARDENS_TTL_S if "Overpass" in result["Source"] else FALLBACK_TTL_S, _fetch_gardens)


def _fetch_gardens():
    """Named community gardens in San Francisco, straight from a live OpenStreetMap API response.

    Overpass is the main source; if every Overpass server is down, Nominatim (also OpenStreetMap) is asked instead.
    Nothing is read from disk and nothing is labelled by us: places without a name in OSM are left out.
    """
    for source, fetch in (("OpenStreetMap Overpass API", _gardens_from_overpass),
                          ("OpenStreetMap Nominatim API", _gardens_from_nominatim)):
        gardens = [garden for garden in fetch() if garden["Name"]]
        if gardens:
            return {"Gardens": gardens, "Fetched": _now_iso(), "Source": source}
    return False


def _gardens_from_overpass():
    south, west, north, east = SF_BOUNDS
    box = f"{south},{west},{north},{east}"
    query = f"""
    [out:json][timeout:20];
    (
      nwr["leisure"="garden"]["garden:type"="community"]({box});
      nwr["leisure"="garden"]["name"~"community garden",i]({box});
      nwr["landuse"="allotments"]({box});
    );
    out center tags;
    """
    # Public Overpass servers often return brief 500/504 errors, so give each one a second try.
    for url in OVERPASS_URLS + OVERPASS_URLS:
        try:
            response = requests.post(url, data={"data": query}, headers=HEADERS, timeout=TIMEOUT_S + 10)
        except requests.RequestException as error:
            print(f"Overpass {url} unreachable: {error.__class__.__name__}")
            continue
        if response.status_code == 200:
            return [_garden(element) for element in response.json().get("elements", []) if _point(element)]
        print(f"Overpass {url} refused. Error code: {response.status_code}")
        time.sleep(OVERPASS_RETRY_PAUSE_S)
    return []


def _gardens_from_nominatim():
    south, west, north, east = SF_BOUNDS
    url = (
        "https://nominatim.openstreetmap.org/search?q=community+garden"
        f"&viewbox={west},{north},{east},{south}&bounded=1&limit=50&addressdetails=1&format=json"
    )
    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT_S)
    except requests.RequestException as error:
        print(f"Nominatim unreachable: {error.__class__.__name__}")
        return []
    if response.status_code != 200:
        print(f"Nominatim refused. Error code: {response.status_code}")
        return []

    gardens = []
    for place in response.json():
        if place.get("class") not in ("leisure", "landuse"):
            continue  # skips information boards and businesses with "garden" in the name
        address = place.get("address", {})
        gardens.append({
            "OSM ID": f"{place.get('osm_type')}/{place.get('osm_id')}",
            "Name": place.get("name", ""),
            "Latitude": float(place["lat"]),
            "Longitude": float(place["lon"]),
            "Address": " ".join(filter(None, [address.get("house_number"), address.get("road")])),
            "Operator": "",
            "Opening Hours": "",
            "Website": ""
        })
    return gardens


def _point(element):
    return element if element.get("type") == "node" else element.get("center")


def _garden(element):
    tags = element.get("tags", {})
    point = _point(element)
    address = " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")]))
    return {
        "OSM ID": f"{element['type']}/{element['id']}",
        "Name": tags.get("name", ""),
        "Latitude": point["lat"],
        "Longitude": point["lon"],
        "Address": address,
        "Operator": tags.get("operator", ""),
        "Opening Hours": tags.get("opening_hours", ""),
        "Website": tags.get("website", "") or tags.get("contact:website", "")
    }
