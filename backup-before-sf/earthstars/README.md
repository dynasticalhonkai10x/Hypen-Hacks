# Earthstars: Find your people. Fix your block.

Earthstars turns live environmental data into local action. For any city on Earth it shows **measured challenges** (air-quality monitors reporting worse than "Good", heat from OpenWeather) and **real green spaces** (community gardens and allotments from OpenStreetMap). It pairs each challenge with the green space nearest to it and suggests actions you can commit to today.

**Nothing is invented.** Every pin links to its source. Readings older than 24 hours are shown with their date and never used. Anything you report yourself is labelled "Reported by you · not verified".

## Run it

From the project root (the folder with `main.py`):

```
pip install -r requirements.txt
copy .env.example .env        (macOS/Linux: cp .env.example .env)
python -m uvicorn main:app --port 8000
```

Put your OpenWeather key and WAQI token in `.env` (gitignored). Then open `earthstars/index.html`. To use a deployed backend, open `index.html?api=https://your-backend.example.com`.

Without the backend the map stays empty on purpose, and the page says "Live data offline".

## Where every piece of data comes from

| On the site | Backend endpoint | Source |
|---|---|---|
| 🔴 Air-quality challenges (AQI > 50, reading < 24 h old), each linked to its monitor page | `/api/air-stations?lat&lng&city` | World Air Quality Index (map bounds, falling back to keyword search) |
| 🔴 Heat challenge (≥ 30 °C) and the weather in the live bar | `/api/weather/{city}` | OpenWeather |
| Live bar readings (AQI, PM2.5, O₃, CO, NO₂) and **What you can do today** | `/api/environment/{city}` | WAQI city feed + `advisor.py` tips |
| 🟢 Green spaces (allotments, community gardens), each linked to its OSM page | `/api/green-spaces?lat&lng` and `/api/gardens/{city}` | OpenStreetMap (Nominatim, plus Overpass when available) |
| Neighbourhood names | browser → Nominatim reverse geocoding | OpenStreetMap |
| City search | browser → Open-Meteo geocoding | Open-Meteo |
| Projects | computed in the browser | Real distance between a challenge and its nearest green spaces, labelled as a suggestion |
| Your constellation, badges, commitments, activity | your browser (localStorage) | Only what you actually did |

## 90-second demo script

1. **Hero (10s):** "Climate action is local, but the data is scattered. Earthstars puts it on one map and turns it into action."
2. **Live bar (20s):** London: 26 live air monitors, and the worst one (Putney High Street, AQI 61) is a challenge. Click its source link to show it's real.
3. **Pairing (20s):** That challenge is paired with the nearest real allotment. The distance is computed, nothing is guessed.
4. **Act (25s):** Click **Add to my constellation**. Onboarding asks name, neighbourhood and what you care about. Open **What you can do today** and commit to an action. Badges unlock.
5. **Honesty (15s):** Switch to Mumbai. WAQI's last reading there is from March 2025, so Earthstars shows it crossed out with the date instead of pretending it's live.

Press **Reset** in the footer between runs.

## Files

| File | Job |
|---|---|
| `main.py`, `api_service.py`, `advisor.py` | FastAPI backend: weather, air quality + advice, air monitors, green spaces (cached) |
| `js/backend.js` | Calls the backend and validates every response |
| `js/live.js` | Turns API data into map stars, rejects stale readings, renders the live bar and tips |
| `js/engine.js` | Pairs each challenge with the nearest green spaces |
| `js/people.js` | Matching (distance, interests, measured severity), badges, your constellation |
| `js/app.js` | State, actions, cities |
| `js/map-real.js` / `js/map.js` | Real street map, plus the offline drawn-map fallback |
