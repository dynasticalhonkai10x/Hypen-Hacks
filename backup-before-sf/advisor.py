import json
import random
from pathlib import Path

# Load the tip files from this folder, so the server works no matter where uvicorn is started from.
DATA_DIR = Path(__file__).resolve().parent


def _data(filename: str) -> Path:
    return DATA_DIR / filename

def air_quality_action(air_quality):
    if not isinstance(air_quality, (int, float)):
        return "No air quality data available."

    with open(_data("air_quality_action.json"), "r") as file:
        data = json.load(file)

    if air_quality <= 50:
        options = data["Air Quality 0 to 50"]
    elif air_quality <= 100:
        options = data["Air Quality 51 to 100"]
    else:
        options = data["Air Quality 101+"]

    num_to_pick = random.randint(1, min(3, len(options)))
    return ", ".join(random.sample(options, num_to_pick))


def pm_level_action(pm_level):
    if not isinstance(pm_level, (int, float)):
        return "No PM2.5 data available."

    with open(_data("pm_level_action.json"), "r") as file:
        data = json.load(file)

    if pm_level <= 12.0:
        options = data["Safe (0 to 12.0 ug/m3)"]
    elif pm_level <= 35.4:
        options = data["Moderate (12.1 to 35.4 ug/m3)"]
    else:
        options = data["Dangerous (35.5+ ug/m3)"]

    num_to_pick = random.randint(1, min(3, len(options)))
    return ", ".join(random.sample(options, num_to_pick))


def ozone_level_action(ozone_level):
    if not isinstance(ozone_level, (int, float)):
        return "No Ozone data available."

    with open(_data("ozone_action.json"), "r") as file:
        data = json.load(file)

    if ozone_level <= 54:
        options = data["Safe (0 to 54 ppb)"]
    elif ozone_level <= 70:
        options = data["Moderate (55 to 70 ppb)"]
    else:
        options = data["Dangerous (71+ ppb)"]

    num_to_pick = random.randint(1, min(3, len(options)))
    return ", ".join(random.sample(options, num_to_pick))


def carbon_monoxide_level_action(carbon_monoxide_level):
    if not isinstance(carbon_monoxide_level, (int, float)):
        return "No Carbon Monoxide data available."

    with open(_data("carbon_monoxide_level_action.json"), "r") as file:
        data = json.load(file)

    if carbon_monoxide_level <= 4.4:
        options = data["Safe (0 to 4.4 ppm)"]
    elif carbon_monoxide_level <= 9.4:
        options = data["Moderate (4.5 to 9.4 ppm)"]
    else:
        options = data["Dangerous (9.5+ ppm)"]

    num_to_pick = random.randint(1, min(3, len(options)))
    return ", ".join(random.sample(options, num_to_pick))


def nitrogen_dioxide_level_action(nitrogen_dioxide_level):
    if not isinstance(nitrogen_dioxide_level, (int, float)):
        return "No Nitrogen Dioxide data available."

    with open(_data("nitrogen_dioxide_level_action.json"), "r") as file:
        data = json.load(file)

    if nitrogen_dioxide_level <= 53:
        options = data["Safe (0 to 53 ppb)"]
    elif nitrogen_dioxide_level <= 100:
        options = data["Moderate (54 to 100 ppb)"]
    else:
        options = data["Dangerous (101+ ppb)"]

    num_to_pick = random.randint(1, min(3, len(options)))
    return ", ".join(random.sample(options, num_to_pick))