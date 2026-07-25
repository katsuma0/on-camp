# Site Journal

A personal Ontario Parks campsite journal by Katsuma Onishi. Walk a campground, rate the sites, note which ones to book next time.

**Live app:** host this repo with GitHub Pages and open `index.html` (works offline once added to your home screen).

## What's here
The app follows the same file layout as ON Wildlife and ON Fishing: a thin
`index.html` that links out to the styles, the logic and the data.
- `index.html` - markup only (the view sections and sheets)
- `styles.css` - the shared iOS design system
- `app.js` - all app logic
- `data/parks.js` - park/campground/site/trail data as `window.PARKS_DATA` (loaded for instant offline start)
- `parks-data.json` - the same data as plain JSON, kept for the pipeline and a background refresh
- `service-worker.js`, `manifest.json`, icons - PWA install + offline support
- `pipeline/` - the SQL data pipeline that generates parks-data.json
  - `build_db.py` seeds `scout.db` from the data tables in the file
  - `export_to_app.py --all` writes `parks-data.json`

## Updating park data
```
cd pipeline
python3 build_db.py
python3 export_to_app.py --all
cp parks-data.json ../parks-data.json
```
Then regenerate `data/parks.js` from it (wrap the JSON as `window.PARKS_DATA = <json>;`) and bump the cache version in service-worker.js.

Currently: 124 parks, ~20,000 sites, ~211 trails. Appearance follows the system with a light/dark toggle.
