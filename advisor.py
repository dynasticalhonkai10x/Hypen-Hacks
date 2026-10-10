"""Turns San Francisco's live conditions into things people can do today.

Tips live in the *_action.json files. Each pollutant is graded by its WAQI sub-index
(0-50 good, 51-100 moderate, 101+ unhealthy), which is the scale WAQI actually reports.
"""
import json
import random
import re
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent
MAX_TIPS_PER_TOPIC = 3
BAND_LABELS = ("Good", "Moderate", "Unhealthy")

# topic: (field in the air-quality reading, tips file, tip keys for the good / moderate / unhealthy bands)
POLLUTANTS = {
    "Air quality": ("AQI", "air_quality_action.json",
                    ("Air Quality 0 to 50", "Air Quality 51 to 100", "Air Quality 101+")),
    "PM2.5": ("PM2.5", "pm_level_action.json",
              ("Safe (0 to 12.0 ug/m3)", "Moderate (12.1 to 35.4 ug/m3)", "Dangerous (35.5+ ug/m3)")),
    "Ozone": ("Ozone", "ozone_action.json",
              ("Safe (0 to 54 ppb)", "Moderate (55 to 70 ppb)", "Dangerous (71+ ppb)")),
    "Carbon monoxide": ("Carbon Monoxide", "carbon_monoxide_level_action.json",
                        ("Safe (0 to 4.4 ppm)", "Moderate (4.5 to 9.4 ppm)", "Dangerous (9.5+ ppm)")),
    "Nitrogen dioxide": ("Nitrogen Dioxide", "nitrogen_dioxide_level_action.json",
                         ("Safe (0 to 53 ppb)", "Moderate (54 to 100 ppb)", "Dangerous (101+ ppb)")),
}

HOT_C, COLD_C, WINDY_MS = 27, 8, 8
WET = {"Rain", "Drizzle", "Thunderstorm"}
FOGGY = {"Mist", "Fog", "Haze", "Smoke"}


@lru_cache(maxsize=None)
def _tips(filename):
    return json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))


def _clean(text):
    """Tips contain LaTeX like "$\\text{PM}_{2.5}$" (with \\t already turned into a tab); make it plain text."""
    text = re.sub(r"\$\s*\\?\t?ext\{([^}]*)\}_\{([^}]*)\}\s*\$", r"\1\2", text)
    return re.sub(r"\s+", " ", text.replace("$", "")).strip()


def _suggestion(topic, tip):
    title, _, detail = _clean(tip).partition(": ")
    return {"Topic": topic, "Title": title.rstrip("."), "Detail": detail}


def _pick(options):
    return random.sample(options, random.randint(1, min(MAX_TIPS_PER_TOPIC, len(options))))


def _weather_topics(weather):
    condition, temp, wind = weather.get("Condition"), weather.get("Temperature"), weather.get("Wind Speed")
    topics = []
    if condition in WET:
        topics.append("Rain")
    if condition in FOGGY:
        topics.append("Fog or mist")
    if temp is not None and temp >= HOT_C:
        topics.append("Heat")
    if temp is not None and temp < COLD_C:
        topics.append("Cold")
    if wind is not None and wind >= WINDY_MS:
        topics.append("Windy")
    if not {"Rain", "Fog or mist", "Heat", "Cold"} & set(topics):
        topics.append("Clear and mild")
    return topics


def suggestions(weather, air):
    """Suggested actions for today's weather and air quality. Stale air readings produce no air suggestions."""
    result = []
    if weather:
        for topic in _weather_topics(weather):
            result += [_suggestion(f"Weather · {topic}", tip) for tip in _pick(_tips("weather_action.json")[topic])]
    if air and not air.get("Stale"):
        for topic, (field, filename, keys) in POLLUTANTS.items():
            value = air.get(field)
            if not isinstance(value, (int, float)):
                continue
            band = 0 if value <= 50 else 1 if value <= 100 else 2
            result += [_suggestion(f"{topic} · {BAND_LABELS[band]}", tip) for tip in _pick(_tips(filename)[keys[band]])]
    return result
