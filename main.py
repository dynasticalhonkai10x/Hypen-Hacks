"""Earthstars API: live climate conditions, suggested actions and community gardens for San Francisco.

Also serves the site in earthstars/, so one process (locally or in the cloud) is the whole app.
"""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import advisor
import api_service

SITE_DIR = Path(__file__).resolve().parent / "earthstars"

app = FastAPI(title="Earthstars · San Francisco")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"]
)


@app.get("/api/conditions")
def get_conditions():
    weather = api_service.get_weather()
    air = api_service.get_air_quality()

    if not weather and not air:
        return {"ERROR": "Could not reach the weather or air-quality services"}

    return {
        "City": "San Francisco",
        "Weather": weather or None,
        "Air Quality": air or None,
        "Suggestions": advisor.suggestions(weather or None, air or None)
    }


@app.get("/api/air-monitors")
def get_air_monitors():
    monitors = api_service.get_air_monitors()

    if monitors is False:
        return {"ERROR": "Could not reach the air-quality network"}

    return {
        "Monitors": monitors
    }


@app.get("/api/gardens")
def get_gardens():
    gardens = api_service.get_gardens()

    if not gardens:
        return {"ERROR": "Could not reach OpenStreetMap and no saved garden list exists"}

    return gardens


# Mounted last so the /api routes above are matched first.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
