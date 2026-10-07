# VeloData

## Overview

Static personal cycling dashboard: Vite, plain JavaScript, Leaflet, Lucide. Python imports source activities; the browser only reads a versioned JSON artifact. No authentication, database, Strava API or background sync.

## Why / Goals

Keep a portable view of personal cycling history, explore rides geographically, compare monthly distance and inspect records without running a server.

## Behavior

The importer selects cycling rows from Strava's standard activities CSV. It decodes FIT with Garmin SDK and GPX/TCX with XML namespaces handled explicitly. Summary values come from CSV (meters and seconds), preserving Strava's processed moving time and elevation gain. Standalone FIT uses its session summary and UTC start date; GPX/TCX require CSV. Export CSV dates preserve their displayed calendar day.

Average speed is distance divided by moving time. The aggregate uses total distance / total moving time, never the arithmetic mean of ride speeds. Fastest ride records require at least 10 km. Elevation totals are rounded per ride. Charts combine the selected rides; when all years are selected, monthly bars sum matching calendar months across years, while the calendar shows the latest year (explicitly labelled). Each calendar day opens its first ride if multiple rides occur on that date.

Routes are sampled at approximately 35 m spacing and rounded to 5 decimal places. GPS gaps and obvious jumps become separate line segments. Profiles are sampled to at most 200 points. The full source files remain unchanged. Routes are for exploration rather than turn-by-turn navigation or scientific telemetry analysis. Initial map view focuses around the most recent ride; the expand control fits every selected route, including rides on other continents.

## Data & Files

- `scripts/import_rides.py`: import CLI; fails on invalid tracks without replacing existing output.
- `public/data/rides.json`: public, versioned data, `schemaVersion: 1`, UTC generation time, privacy mode and rides.
- Each ride: stable ID, source SHA256, ISO date, title, kilometers, moving/elapsed seconds, ascent meters, average/max km/h, optional average HR/power, bike, source format, route segments `[lat, lon]`, elevation profile `[km, meters]`.
- `src/stats.js`: pure statistics, formatting, selection and HTML escaping.
- `src/main.js`: dashboard, map, charts, journal and events.
- `src/style.css`: responsive dark theme.
- `export_*/`, `data/raw/`, original FIT/GPX/TCX and virtual environment are ignored.

## Interfaces (CLI/API)

`python scripts/import_rides.py SOURCE [--output FILE] [--merge]`.

Without `--merge`, replace the published collection with the source's cycling rides. With `--merge`, keep existing records and append unknown activity IDs and source hashes. Existing metadata wins; use a full re-import to refresh existing records. Same source bytes, including gzip-decoded content, are deduplicated even if filenames differ. Semantically equivalent files exported into another format may need manual deduplication. CSV support assumes the standard Strava column layout and recognizes Russian and English date/type labels; other export layouts should be adapted explicitly.

`npm run dev`, `npm test`, `npm run build`, `npm run preview`. There is no write API; the browser cannot modify published activity data.

## Configuration

Node 22.12+, Python 3.10+, pinned Garmin SDK in `requirements.txt`, npm lockfile. Vite builds with relative asset paths. Map tiles: standard OSM URL, browser caching and visible attribution; no tile prefetch, scraping, offline downloads or API key. Change the tile URL and attribution together in `src/main.js` if switching providers.

GitHub Pages uses Actions as source. `main` push or manual workflow dispatch runs Node and Python checks, builds and deploys the static artifact. No deployment credentials are stored in the repository; Actions uses its short-lived Pages token.

## Usage Examples

```sh
.venv/bin/python scripts/import_rides.py export_118409300-2
.venv/bin/python scripts/import_rides.py data/raw --merge
npm run build
```

Choose a year to filter statistics and routes. Click a route, record card, calendar activity day or journal entry to inspect a ride and its elevation profile. The search filters only the journal; the year filter applies globally. Use the map's expand button to see every route.

## Testing

Node tests cover weighted speed, filters, month aggregation, minimum record distance, HTML escaping, time formatting and the shipped dataset invariants. Python tests cover localized dates, numeric validation, namespace handling, track segmentation and GPS jump rejection. Real export import verifies every selected track parses successfully. Browser checks cover year filter, search, details, map rendering and mobile layout.

## Risks / Migration Notes

The public JSON intentionally includes precise route endpoints, dates and summary telemetry with the owner's authorization. Source photos, social data, emails, profile data, notes and credentials are excluded. Missing sensor values remain null. Elevation and distance retain the source's measurement limitations; maximum GPS speed is not used as a performance record. External tile/font services receive normal browser requests. Schema changes require updating the importer and UI together. Importing data and pushing remains manual; automatic device/Strava sync is future work.
