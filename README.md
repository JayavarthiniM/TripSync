# TripSync Full Stack v2.0

TripSync is a free-first adaptive group trip planner. It combines a browser UI with a Node.js backend for server-assisted data retrieval and shared-trip APIs.

## Run locally

Requirements: Node.js 18 or newer. No npm packages are required.

```bash
npm start
```

Open http://localhost:3000. Do not open `public/index.html` by double-clicking it: shared trips and server-assisted API routes need the server.

## Features

- Worldwide destination geocoding via Nominatim, with server-side cache.
- OpenStreetMap / Overpass place discovery with alternate public endpoints and timeouts.
- Interactive Leaflet map, place filters, saved places, and local browser persistence.
- Multi-day itinerary scheduling, estimated budgets, durations, fixed commitments, travel buffers and feasibility warnings.
- Group preference profiles, group-priority settings, and disruption scenario generation.
- Road routing through OSRM (public demo; estimates, no live traffic).
- Weather snapshots from Open-Meteo.
- Shared-trip codes, server-side trip storage, and simple place voting.
- Text itinerary export and share-link copying.
- Responsive layout and clear provider-failure messages.

## Important accuracy and privacy notes

- This is an educational prototype, not a booking engine or navigation safety system.
- Place coverage varies. OpenStreetMap data is community-maintained; ratings, photos, prices and opening hours are not universally available or verified.
- Itinerary prices, transfer times and visit durations can be estimates. Verify business hours, prices, reservations, accessibility and local conditions directly before travel.
- PlanPatch creates alternatives based on the disruption selected by the user. It does not monitor live closures, flight delays or real-time traffic.
- Shared-trip links are unlisted codes, not authenticated/private accounts. Anyone who has a code can read that trip and submit a vote. Do not store personal or sensitive information. Authentication, permissions, moderation and rate limiting are needed before public production use.
- Trips are stored in `data/trips.json` and `data/geocode-cache.json` by default. This is persistent for local runs. Some free hosting platforms use ephemeral filesystems, which means data can disappear on redeploy/restart. For persistent deployed shared trips, connect a free-tier managed database such as Supabase and implement its credentials/RLS configuration; this repository does not silently claim that setup is already wired.
- Public endpoints have usage policies, quotas and no uptime guarantee. Do not send high-volume requests, scrape sites against their terms, or rely on the demo endpoints for critical journeys.

## API

- `GET /api/health`
- `POST /api/geocode` `{ "q": "Kyoto, Japan" }`
- `POST /api/places` `{ "lat": 35.01, "lon": 135.76, "radius": 5000, "category": "all", "query": "[out:json]..." }`
- `POST /api/weather` `{ "lat": 35.01, "lon": 135.76 }`
- `POST /api/route` `{ "coordinates": [[135.76,35.01],[135.77,35.02]] }`
- `POST /api/trips` create a shareable trip
- `GET /api/trips/:id` read a shared trip and vote totals
- `PUT /api/trips/:id` update a shared trip
- `POST /api/trips/:id/votes` `{ "place": "Place name", "voter": "Nickname" }`

## Deployment

See [DEPLOY.md](DEPLOY.md). Free static hosting alone cannot run this backend; deploy as a Node web service on a free tier that is available to your account, or use another free Node host. Check current host limits before submitting. For durable shared data, configure a persistent volume or database. Public free tiers and API policies can change.

## Attribution

- Map data © OpenStreetMap contributors: https://www.openstreetmap.org/copyright
- Geocoding: Nominatim / OpenStreetMap: https://operations.osmfoundation.org/policies/nominatim/
- Places: OpenStreetMap data via Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
- Routing: OSRM demo server: https://router.project-osrm.org/
- Weather: Open-Meteo: https://open-meteo.com/en/docs

## Validation

Run `npm run check` to syntax-check the backend. Use `npm start`, open the UI, and test `/api/health`, destination search, place discovery, weather, route, share-code creation/loading, and voting in a real browser. Public APIs may fail transiently, so the UI includes fallback/error messaging.


## Google Maps and traffic (v2.2)

TripSync includes keyless Google Maps URL handoffs: open an individual place in Google Maps, open saved stops as a multi-stop driving route, or open the Google Maps traffic layer around the destination. These are free links and require no Google Maps Platform API key. They open the Google Maps website/app; they do **not** stream traffic speeds or traffic-aware ETAs back into TripSync. The in-app OSRM route remains a non-live-traffic estimate. Google Maps Platform APIs can have billable usage beyond applicable free caps, so they are not enabled by default.


## Discover & recommendations (v2.2)
The Discover panel supports cuisine/text, estimated spend, mapped dietary tags, mapped wheelchair accessibility, low-cost preference, and a limited opening-hours filter. “Recommended for us” ranks places with an explainable heuristic score. This score is not a star rating. Estimated prices are explicitly labelled. Google Maps links let travellers inspect reviews externally; this project does not copy or scrape review content.

## Place discovery reliability (v2.4.0)

Live search tries OpenStreetMap Overpass endpoints first, then a multi-term Photon fallback, then Wikipedia geosearch for named tourist/cultural sites. Successful results are cached locally. These public services are free to try but best-effort: none guarantees uptime or a complete list of every place. Results can be sparse where OSM/Wikipedia coverage is sparse. Internet is required for live search; sample places are illustrative demo data.
