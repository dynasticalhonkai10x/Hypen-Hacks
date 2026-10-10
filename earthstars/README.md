# Earthstars · San Francisco

Live climate conditions for San Francisco, every community garden in the city on one map, and suggestions for what to do today based on the current weather and air quality.

Everything shown comes from live APIs (OpenWeather, World Air Quality Index, OpenStreetMap), with a source link and timestamp. Air readings older than 24 hours are flagged and never used for suggestions.

## Put it online (Render, free)

The backend also serves this site, so one cloud service is the whole app. Nobody has to run anything locally.

1. Push the project folder (the one with `main.py`) to a GitHub repository. `.env` is gitignored, so your keys stay out of it.
2. On [render.com](https://render.com), choose **New → Blueprint** and pick the repository. Render reads `render.yaml`.
3. When asked, paste your `OPENWEATHER_API_KEY` and `WAQI_TOKEN`, then click **Apply**.

The site goes live at `https://earthstars-<something>.onrender.com`, and every push to GitHub redeploys it. Free services sleep after 15 minutes without visitors, so the first visit after a quiet spell takes up to a minute to load.

## Run it locally

From the project root (the folder with `main.py`):

```
pip install -r requirements.txt
copy .env.example .env        (macOS/Linux: cp .env.example .env)
python -m uvicorn main:app --port 8000
```

Put your OpenWeather key and WAQI token in `.env` (gitignored). Then open http://127.0.0.1:8000/.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/conditions` | SF weather (OpenWeather), the nearest air-quality reading (WAQI), and suggested actions from `advisor.py` |
| `GET /api/gardens` | SF community gardens and allotments from OpenStreetMap (cached 24 h, last good copy saved in `data/sf_gardens.json`) |
| `GET /api/air-monitors` | Every WAQI monitor in SF with a reading from the last 24 hours |

## How suggestions work

`advisor.py` picks tips from the JSON files based on today's conditions:

- **Weather** (`weather_action.json`): heat ≥ 27 °C, cold < 8 °C, wind ≥ 8 m/s, rain, fog, or clear and mild.
- **Air** (`air_quality_action.json`, `pm_level_action.json`, `ozone_action.json`, `carbon_monoxide_level_action.json`, `nitrogen_dioxide_level_action.json`): each pollutant is graded by its WAQI sub-index. 0–50 is good, 51–100 is moderate, and 101+ is unhealthy.

Garden-related tips get a **Find a garden** button that highlights every garden on the map.

## Files

| File | Job |
|---|---|
| `main.py` | FastAPI routes |
| `api_service.py` | Fetches SF weather, air quality, monitors and gardens; caches and validates them |
| `advisor.py` | Turns conditions into suggested actions |
| `earthstars/index.html`, `css/styles.css`, `js/app.js` | The single-page site: conditions, map, suggestions, garden list |

The previous multi-city version is kept in `backup-before-sf/` and can be deleted once you no longer need it.
