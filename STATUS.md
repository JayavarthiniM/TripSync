# TripSync v2.2 — feature status

## Implemented in this build
- Responsive full-stack web app: HTML/CSS/JavaScript client and Node.js REST backend.
- Worldwide mapped place discovery through Nominatim and OpenStreetMap/Overpass (coverage and public API availability vary).
- Map, category filtering, radius filtering, name search and distance sorting.
- **Discover & recommendations panel:** cuisine/text filter, estimated-spend filter, dietary-tag filters, wheelchair-tag filter, optional open-now filter when the public opening-hours string can be matched, low-cost preference and clear-filters action.
- **Explainable recommendation score:** combines group interests, approximate distance, budget estimate, mapped metadata and individual traveller profiles. Scores are not ratings; reasons are displayed for each place.
- Place cards distinguish mapped/known cost from rough budget-planning estimates; estimates are explicitly labelled.
- Google Maps links for place lookup/reviews, directions and traffic view; TripSync does not scrape Google reviews or import Google's live traffic speeds.
- Hotels/stays get a general web search link for booking options, not a claim of live availability or endorsement.
- Optional Wikipedia reference image/summary lookup, where available.
- RouteSmart itinerary planning, group profiles, shared trip codes and nickname-based votes.
- TimeGuard fixed-stop flags and buffer/schedule warnings; PlanPatch manual disruption alternatives.
- Open-Meteo weather, OSRM road-route estimates, browser-local saving, server-side JSON trip persistence and text export.
- Node backend syntax and existing smoke tests for health/shared-trip create/read/update/vote/invalid code.

## Important limitations
- No verified customer star ratings/review snippets are embedded in the app. The Reviews link opens Google Maps search for users to read current reviews themselves. Google Places API can require billing and has quotas.
- Prices are often unavailable. Generic budget estimates are used only as planning heuristics and explicitly labelled—not venue quotes.
- Dietary filters rely on explicit mapped tags and can exclude venues with missing data. They do not certify allergy safety, halal status or dietary suitability.
- Open-now filtering uses an intentionally simple parser over mapped `opening_hours` strings and can be wrong for complex schedules, holidays and timezone edge cases. Verify with the venue.
- Booking links are generic web searches; no reservations or live inventory are handled.
- Recommendation scores are transparent heuristics, not machine learning or objectively verified quality.
- No live traffic ETA imported from Google Maps; Google Maps opens externally for traffic and reviews.
- No authentication/private access control; share codes are bearer access. JSON-file persistence may be ephemeral on free hosting.
- All external APIs can be unavailable or rate-limited. Real-browser end-to-end tests still needed before claiming production readiness.


v2.4.0 place discovery update: Overpass failover, multi-term Photon fallback, Wikipedia geosearch supplemental fallback, clearer provider limitations and caching. Public data services are best-effort and cannot guarantee all places.
