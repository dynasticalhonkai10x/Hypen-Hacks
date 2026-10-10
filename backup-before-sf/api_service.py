import os
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
WAQI_TOKEN = os.environ.get("WAQI_TOKEN", "")

def get_city_weather_data(city):
    city_formatted = city.strip().replace(" ", "+")
    url = f"https://api.openweathermap.org/data/2.5/weather?q={city_formatted}&appid={OPENWEATHER_API_KEY}&units=metric"
    
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        weather_list = data.get("weather", [])
        return {
            "City Name": data.get("name", "Unknown"),
            "Weather": weather_list[0].get("main", "N/A") if weather_list else "N/A",
            "Temperature": data.get("main", {}).get("temp", "N/A"),
            "Wind Speed": data.get("wind", {}).get("speed", "N/A")
        }
    return False


def get_climate_environmental_condition_data(city):
    city_formatted = city.strip().replace(" ", "-")
    url = f"https://api.waqi.info/feed/{city_formatted}/?token={WAQI_TOKEN}"
    
    response = requests.get(url)
    if response.status_code == 200:
        res_json = response.json()
        if res_json.get("status") != "ok":
            return False
            
        aqi_data = res_json.get("data", {})
        iaqi = aqi_data.get("iaqi", {})
        
        return {
            "City Name": aqi_data.get("city", {}).get("name", "Unknown City"),
            "Air Quality": aqi_data.get("aqi", "N/A"),
            "Dominant Pollutant": aqi_data.get("dominentpol", "N/A"),
            "PM2.5 Level": iaqi.get("pm25", {}).get("v", "N/A"),
            "Ozone": iaqi.get("o3", {}).get("v", "N/A"),
            "Carbon Monoxide": iaqi.get("co", {}).get("v", "N/A"),
            "Nitrogen Dioxide": iaqi.get("no2", {}).get("v", "N/A")
        }
    return False


def get_city_gardens_data(city):
    city_formatted = city.strip().replace(" ", "+")
    url = f"https://nominatim.openstreetmap.org/search?q=community+garden+{city_formatted}&format=json&limit=5"
    
    headers = {"User-Agent": "EarthstarsHackathon/1.0"}
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        res_json = response.json()
        if not res_json:
            return []
            
        return [{
            "Name": place.get("display_name", "Unknown Garden"),
            "Latitude": place.get("lat", "N/A"),
            "Longitude": place.get("lon", "N/A")
        } for place in res_json]
    return False