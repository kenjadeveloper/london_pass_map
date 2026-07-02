# London Pass attractions: live interactive map

This is a static, browser-based map of the 111 attractions currently visible on the London Pass page supplied by the requester.

## Run it locally

Use any static server from this folder, then open the displayed localhost URL:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in your browser.

Do not simply double-click `index.html`: browsers may block the JSON request when the page is loaded directly from the file system.

## What the map does

- Loads all 111 attractions into a searchable, filterable list.
- Resolves map coordinates live through OpenStreetMap's Nominatim search endpoint at a rate of one request per second.
- Caches resolved coordinates in the browser, so later visits are fast.
- Clusters dense areas, opens a detail popup, and provides direct Google Maps and official-source search links.
- Labels location certainty correctly: fixed venue, tour meeting point, multiple locations, day-trip destination, or no fixed location.

Two benefits (`2.5 GB Mobile Data` and `ClassPass Credits`) do not have a single physical visitor venue and therefore remain in the sidebar but are not plotted as artificial pins.

## Refresh official source data

The map has a fully populated seed list and location-search strings. The included script is designed to refresh official direct-page data from the London Pass site and create a snapshot JSON/CSV. It requires Node 20+:

```bash
node tools/scrape-londonpass.mjs
```

It is intentionally rate-limited. Before running the script regularly, review the source website's terms and robots policy.

## Deploy as a public website

Upload this whole folder to GitHub Pages, Netlify, Cloudflare Pages, or Vercel as a static site. No server or map API key is required for the current implementation. The public host's URL will become your shareable live map.

## Source and data caveat

The provided London Pass listing changes over time. The seed list reflects the listing accessed on 2 July 2026 (111 results); the refresh script should be run before publication or use in a trip plan. Tour meeting points and multi-stop experiences are clearly marked because final joining instructions can change.
