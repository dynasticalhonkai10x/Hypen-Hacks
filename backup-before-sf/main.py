from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import api_service
import advisor

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["*"],
    allow_credentials = True,
    allow_methods = ["*"],
    allow_headers = ["*"]
)

@app.get("/api/weather/{city}")

def get_city_weather_data(city: str):
    weather_info = api_service.get_city_weather_data(city)

    if not weather_info:
        return {"ERROR": "City not found or invalid response"}

    condition = weather_info.get("Weather")
    temp = weather_info.get("Temperature")
    wind = weather_info.get("Wind Speed")

    return {
        "Weather Information": weather_info
    }

@app.get("/api/environment/{city}")
def get_environment_advice(city: str):
    env_info = api_service.get_climate_environmental_condition_data(city)

    if not env_info:
        return {"ERROR": "City not found or invalid response"}

    aqi = env_info.get("Air Quality")
    pm25 = env_info.get("PM2.5 Level")
    ozone = env_info.get("Ozone")
    co = env_info.get("Carbon Monoxide")
    no2 = env_info.get("Nitrogen Dioxide")

    # Hooking up your JSON action advisor functions
    aqi_tips = advisor.air_quality_action(aqi)
    pm_tips = advisor.pm_level_action(pm25)
    ozone_tips = advisor.ozone_level_action(ozone)
    co_tips = advisor.carbon_monoxide_level_action(co)
    no2_tips = advisor.nitrogen_dioxide_level_action(no2)

    return {
        "Environmental Information": env_info,
        "Action Recommendations": {
            "Air Quality Actions": aqi_tips,
            "PM2.5 Actions": pm_tips,
            "Ozone Actions": ozone_tips,
            "Carbon Monoxide Actions": co_tips,
            "Nitrogen Dioxide Actions": no2_tips
        }
    }


@app.get("/api/gardens/{city}")
def get_gardens(city: str):
    gardens_list = api_service.get_city_gardens_data(city)

    if not gardens_list:
        return {"ERROR": "No community gardens found or invalid response"}

    return {
        "City": city,
        "Gardens": gardens_list
    }


@app.get("/api/air-stations")
def get_air_stations(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(12, gt=0, le=40),
    city: str = Query("", max_length=80)
):
    stations = api_service.get_air_stations(lat, lng, radius_km, city)

    if stations is False:
        return {"ERROR": "Could not reach the air-quality network"}

    return {
        "Stations": stations
    }


@app.get("/api/green-spaces")
def get_green_spaces(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(6, gt=0, le=15)
):
    green_spaces = api_service.get_green_spaces(lat, lng, radius_km)

    if green_spaces is False:
        return {"ERROR": "Could not reach OpenStreetMap"}

    return {
        "Green Spaces": green_spaces
    }
