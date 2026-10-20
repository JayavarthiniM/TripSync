# Data sources and attribution

TripSync uses open/public data services. This does not mean all services have unlimited capacity or the same license.

- OpenStreetMap data is available under the Open Database License; attribute OpenStreetMap contributors: https://www.openstreetmap.org/copyright
- Nominatim public geocoder usage policy: https://operations.osmfoundation.org/policies/nominatim/
- Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
- OSRM public demo server: https://router.project-osrm.org/
- Open-Meteo documentation and terms: https://open-meteo.com/en/docs

No Google Maps API is required. Ratings, review counts, photographs and confirmed business prices are not provided comprehensively by these sources and are not fabricated by TripSync.


## Google Maps links

TripSync v2.1 creates user-initiated Google Maps URLs for place lookup, multi-stop directions, and the traffic map layer. These links do not embed Google map tiles or call Google Maps Platform APIs from TripSync. See Google Maps URLs documentation: https://developers.google.com/maps/documentation/urls/get-started.


Recommendation features in v2.2 use transparent local heuristics over mapped tags and user-selected preferences. No customer review content is copied into TripSync. Google Maps links are user-initiated external navigation.


Place-search providers used by v2.4.0: OpenStreetMap Overpass API (OpenStreetMap data, ODbL attribution requirements), Photon public demo service (OpenStreetMap-derived; reasonable-use guidance applies), and Wikipedia geosearch (Wikipedia API/content terms). Public services may be rate-limited or unavailable; this project does not claim exhaustive place coverage.
