import random
import json

def air_quality_action(air_quality):
    if air_quality <= 50:
        return "Safe"
    elif air_quality <= 100:
        return "Moderate"
    else:
        return "Hazardous"

