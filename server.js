const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'trips.json');
const VERSION = '2.4.0-local';

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ trips: {}, votes: {} }, null, 2));
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { trips: {}, votes: {} };
  }
}

function writeDb(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function fail(res, status, error) {
  send(res, status, { error });
}

async function body(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > limit) {
      throw Object.assign(new Error('Request body too large'), { status: 413 });
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

async function fetchJson(url, options = {}, timeout = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'TripSync/2.4.0 (educational travel-planning prototype)',
        Accept: 'application/json',
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(`Data provider returned HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validCoord(n, min, max) {
  return Number.isFinite(Number(n)) &&
    Number(n) >= min &&
    Number(n) <= max;
}

function safeTrip(t) {
  return {
    id: t.id,
    name: t.name,
    destination: t.destination,
    settings: t.settings,
    places: t.places,
    preferences: t.preferences,
    members: t.members,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
}

function votesFor(db, id) {
  const rows = Object.values(db.votes).filter(v => v.tripId === id);
  const agg = {};

  for (const vote of rows) {
    if (!agg[vote.place]) {
      agg[vote.place] = { place: vote.place, count: 0 };
    }
    agg[vote.place].count++;
  }

  return Object.values(agg).sort(
    (a, b) => b.count - a.count || a.place.localeCompare(b.place)
  );
}

// CSV parser supporting commas and escaped quotes inside quoted fields.
function parseCSVLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += ch;
    }
  }

  values.push(value);
  return values;
}

let localPlacesCache = null;
let localPlacesLoadError = null;

function loadLocalPlaces() {
  if (localPlacesCache) return localPlacesCache;
  if (localPlacesLoadError) return [];

  const file = path.join(DATA_DIR, 'india_places.csv');

  if (!fs.existsSync(file)) {
    localPlacesLoadError = `Dataset not found: ${file}`;
    console.warn('[TripSync local places]', localPlacesLoadError);
    return [];
  }

  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    const headers = parseCSVLine(lines.shift() || '');

    const index = Object.fromEntries(
      headers.map((header, i) => [header.trim(), i])
    );

    const get = (row, key) => row[index[key]] || '';

    localPlacesCache = lines.filter(Boolean).map(line => {
      const row = parseCSVLine(line);

      return {
        name: get(row, 'name').trim(),
        lat: Number(get(row, 'latitude')),
        lon: Number(get(row, 'longitude')),
        category: get(row, 'category'),
        subcategory: get(row, 'subcategory'),
        address: get(row, 'address'),
        website: get(row, 'website'),
        phone: get(row, 'phone'),
        opening_hours: get(row, 'opening_hours')
      };
    }).filter(p =>
      p.name &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon)
    );

    console.log(
      `[TripSync local places] Loaded ${localPlacesCache.length.toLocaleString()} records`
    );

    return localPlacesCache;
  } catch (error) {
    localPlacesLoadError = error.message;
    console.warn('[TripSync local places] Could not load CSV:', error.message);
    return [];
  }
}

function searchLocalPlaces(lat, lon, radius, category = 'all') {
  const allPlaces = loadLocalPlaces();

  if (!allPlaces.length) return [];

  const allowed = {
    tourism: ['tourism', 'historic'],
    culture: ['tourism', 'historic'],
    food: ['amenity'],
    nature: ['natural', 'leisure'],
    beach: ['natural'],
    shopping: ['shop'],
    entertainment: ['amenity', 'leisure'],
    stay: ['tourism'],
    spiritual: ['amenity', 'tourism'],
    transport: ['public_transport', 'railway', 'amenity'],
    sports: ['sport', 'leisure'],
    services: ['amenity'],
    nightlife: ['amenity']
  };

  const categories = allowed[category];
  const rad = x => x * Math.PI / 180;
  const results = [];

  for (const p of allPlaces) {
    if (categories && !categories.includes(p.category)) continue;

    const dLat = rad(p.lat - lat);
    const dLon = rad(p.lon - lon);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat)) *
      Math.cos(rad(p.lat)) *
      Math.sin(dLon / 2) ** 2;

    const distance =
      12742000 * Math.asin(Math.sqrt(Math.min(1, a)));

    if (distance <= radius) {
      results.push({ p, distance });
    }
  }

  results.sort((a, b) => a.distance - b.distance);

  return results.slice(0, 100).map(({ p }) => ({
    type: 'node',
    id: `local-${p.name}-${p.lat}-${p.lon}`,
    lat: p.lat,
    lon: p.lon,
    tags: {
      name: p.name,
      [p.category]: p.subcategory,
      ...(p.address ? { 'addr:full': p.address } : {}),
      ...(p.website ? { website: p.website } : {}),
      ...(p.phone ? { phone: p.phone } : {}),
      ...(p.opening_hours ? { opening_hours: p.opening_hours } : {}),
      source: 'Local OpenStreetMap India dataset'
    }
  }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  try {
    // Health check
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return send(res, 200, {
        ok: true,
        version: VERSION,
        storage: 'json-file',
        features: [
          'local-india-places',
          'geocode-proxy',
          'places-proxy',
          'overpass-failover',
          'multi-term-photon-fallback',
          'wikipedia-geosearch-fallback',
          'weather-proxy',
          'route-proxy',
          'shared-trips',
          'group-voting'
        ]
      });
    }

    // Destination geocoding
    if (url.pathname === '/api/geocode' && req.method === 'POST') {
      const b = await body(req);
      const q = String(b.q || '').trim();

      if (q.length < 2 || q.length > 180) {
        return fail(
          res,
          400,
          'Enter a destination between 2 and 180 characters.'
        );
      }

      const cacheFile = path.join(DATA_DIR, 'geocode-cache.json');
      let cache = {};

      try {
        cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      } catch {}

      const key = q.toLowerCase();

      if (cache[key] && Date.now() - cache[key].at < 30 * 864e5) {
        return send(res, 200, {
          place: cache[key].place,
          cached: true
        });
      }

      const results = await fetchJson(
        'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' +
          encodeURIComponent(q),
        { headers: { 'Accept-Language': 'en' } },
        12000
      );

      if (!results.length) {
        return fail(
          res,
          404,
          'Destination not found. Try adding the country or region.'
        );
      }

      const place = {
        name: results[0].display_name,
        lat: +results[0].lat,
        lon: +results[0].lon,
        bbox: results[0].boundingbox
      };

      cache[key] = { place, at: Date.now() };

      try {
        fs.writeFileSync(cacheFile, JSON.stringify(cache));
      } catch {}

      return send(res, 200, { place, cached: false });
    }

    // Nearby places: local CSV first, then online fallbacks.
    if (url.pathname === '/api/places' && req.method === 'POST') {
      const b = await body(req);

      if (
        !validCoord(b.lat, -90, 90) ||
        !validCoord(b.lon, -180, 180)
      ) {
        return fail(res, 400, 'Invalid destination coordinates.');
      }

      const radius = Math.min(
        25000,
        Math.max(500, Number(b.radius) || 5000)
      );

      const query = String(b.query || '');

      if (!query.startsWith('[out:json]') || query.length > 30000) {
        return fail(res, 400, 'Invalid map query.');
      }

      const localElements = searchLocalPlaces(
        Number(b.lat),
        Number(b.lon),
        radius,
        String(b.category || 'all')
      );

      if (localElements.length) {
        return send(res, 200, {
          elements: localElements,
          provider: 'Local OpenStreetMap India dataset',
          cached: true,
          stale: false,
          notice: 'Local mapped places; coverage and details vary. Some records may be incomplete or approximate.'
        });
      }

      const cacheDir = path.join(DATA_DIR, 'places-cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      const cacheKey = crypto
        .createHash('sha256')
        .update(`${radius}|${query}`)
        .digest('hex');

      const cacheFile = path.join(cacheDir, cacheKey + '.json');
      let staleCache = null;

      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

        if (Array.isArray(cached.elements)) {
          staleCache = cached;

          if (cached.at > Date.now() - 10 * 60 * 1000) {
            return send(res, 200, {
              elements: cached.elements,
              provider: 'OpenStreetMap / Overpass',
              cached: true,
              stale: false,
              fetchedAt: new Date(cached.at).toISOString()
            }, { 'Cache-Control': 'public, max-age=120' });
          }
        }
      } catch {}

      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter'
      ];

      for (const endpoint of endpoints) {
        try {
          const data = await fetchJson(
            endpoint,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                Accept: 'application/json'
              },
              body: 'data=' + encodeURIComponent(query)
            },
            8500
          );

          if (!Array.isArray(data.elements)) {
            throw new Error('Map provider response was incomplete');
          }

          try {
            fs.writeFileSync(
              cacheFile,
              JSON.stringify({ at: Date.now(), elements: data.elements })
            );
          } catch {}

          return send(res, 200, {
            elements: data.elements,
            provider: 'OpenStreetMap / Overpass',
            cached: false,
            stale: false,
            fetchedAt: new Date().toISOString(),
            notice: 'OpenStreetMap coverage varies by location; results are not guaranteed to include every venue.'
          }, { 'Cache-Control': 'public, max-age=120' });
        } catch (error) {
          console.warn(
            '[TripSync places] Overpass endpoint failed:',
            endpoint,
            error.message
          );
        }
      }

      // Photon fallback
      const photonTerms = {
        all: ['tourist attraction', 'park', 'restaurant'],
        tourism: ['tourist attraction', 'viewpoint', 'attraction'],
        food: ['restaurant', 'cafe', 'fast food'],
        nature: ['park', 'garden', 'nature reserve'],
        beach: ['beach', 'coast'],
        shopping: ['shopping mall', 'market', 'supermarket'],
        culture: ['museum', 'historic site', 'art gallery'],
        entertainment: ['cinema', 'theatre', 'amusement park'],
        stay: ['hotel', 'hostel', 'guest house'],
        spiritual: ['temple', 'church', 'mosque'],
        nightlife: ['bar', 'pub', 'nightclub'],
        transport: ['railway station', 'bus station', 'airport'],
        sports: ['sports centre', 'stadium', 'swimming pool'],
        services: ['pharmacy', 'hospital', 'clinic']
      };

      const terms =
        photonTerms[String(b.category || 'all')] || ['point of interest'];

      const collected = [];
      const seenPhoton = new Set();

      for (const term of terms) {
        try {
          const params = new URLSearchParams({
            q: term,
            lat: String(b.lat),
            lon: String(b.lon),
            limit: '50',
            lang: 'en'
          });

          const photon = await fetchJson(
            'https://photon.komoot.io/api/?' + params.toString(),
            {},
            6500
          );

          for (const feature of photon.features || []) {
            const coords = feature.geometry && feature.geometry.coordinates;
            const p = feature.properties || {};

            if (
              !Array.isArray(coords) ||
              coords.length < 2 ||
              !Number.isFinite(+coords[0]) ||
              !Number.isFinite(+coords[1])
            ) {
              continue;
            }

            const rad = x => x * Math.PI / 180;
            const dLat = rad(+coords[1] - Number(b.lat));
            const dLon = rad(+coords[0] - Number(b.lon));

            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(rad(Number(b.lat))) *
              Math.cos(rad(+coords[1])) *
              Math.sin(dLon / 2) ** 2;

            if (
              2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, a))) >
              radius
            ) {
              continue;
            }

            const id =
              String(p.osm_type || 'node') + '/' +
              String(p.osm_id || `${coords[0]},${coords[1]}`);

            if (seenPhoton.has(id)) continue;
            seenPhoton.add(id);

            const key = String(p.osm_key || '');
            const val = String(p.osm_value || '');

            const tags = {
              name: String(p.name || p.street || p.locality || p.city || term)
            };

            if (key && val) tags[key] = val;
            if (p.brand) tags.brand = p.brand;
            if (p.operator) tags.operator = p.operator;
            if (p.city) tags['addr:city'] = p.city;
            if (p.country) tags['addr:country'] = p.country;

            const type = String(p.osm_type || 'node').toLowerCase();

            collected.push({
              type: type === 'way'
                ? 'way'
                : type === 'relation'
                  ? 'relation'
                  : 'node',
              id: String(p.osm_id || `photon-${collected.length}`),
              lat: +coords[1],
              lon: +coords[0],
              tags
            });
          }
        } catch (error) {
          console.warn(
            '[TripSync places] Photon term failed:',
            term,
            error.message
          );
        }
      }

      if (collected.length) {
        try {
          fs.writeFileSync(
            cacheFile,
            JSON.stringify({ at: Date.now(), elements: collected })
          );
        } catch {}

        return send(res, 200, {
          elements: collected,
          provider: 'OpenStreetMap / Photon',
          cached: false,
          stale: false,
          notice: 'Fallback uses Photon keyword results. It may miss places and is not a complete list.',
          fetchedAt: new Date().toISOString()
        }, { 'Cache-Control': 'public, max-age=120' });
      }

      // Wikipedia geosearch fallback
      if (['all', 'tourism', 'culture'].includes(String(b.category || 'all'))) {
        try {
          const params = new URLSearchParams({
            action: 'query',
            format: 'json',
            list: 'geosearch',
            gscoord: `${b.lat}|${b.lon}`,
            gsradius: String(Math.min(10000, radius)),
            gslimit: '50',
            gsnamespace: '0'
          });

          const wiki = await fetchJson(
            'https://en.wikipedia.org/w/api.php?' + params.toString(),
            {},
            7000
          );

          const elements = (wiki.query?.geosearch || []).map(p => ({
            type: 'node',
            id: 'wiki-' + p.pageid,
            lat: +p.lat,
            lon: +p.lon,
            tags: {
              name: String(p.title || 'Wikipedia place'),
              tourism: 'attraction',
              source: 'Wikipedia geosearch'
            }
          }));

          if (elements.length) {
            return send(res, 200, {
              elements,
              provider: 'Wikipedia geosearch',
              cached: false,
              stale: false,
              notice: 'Supplemental named-place results from Wikipedia, not a complete nearby-venue list.',
              fetchedAt: new Date().toISOString()
            });
          }
        } catch (error) {
          console.warn('[TripSync places] Wikipedia fallback failed:', error.message);
        }
      }

      if (staleCache) {
        return send(res, 200, {
          elements: staleCache.elements,
          provider: 'OpenStreetMap / Overpass',
          cached: true,
          stale: true,
          fetchedAt: new Date(staleCache.at).toISOString(),
          notice: 'Live search is unavailable. Showing previously cached results.'
        });
      }

      return fail(
        res,
        502,
        'No local matches found and public place-search services failed or timed out. Try a larger radius or another category.'
      );
    }

    // Additional information about a place
    if (url.pathname === '/api/place-info' && req.method === 'POST') {
      const b = await body(req);
      const name = String(b.name || '').trim();
      const destination = String(b.destination || '').trim();

      if (name.length < 2 || name.length > 180) {
        return fail(res, 400, 'Enter a valid place name.');
      }

      const query = [name, destination].filter(Boolean).join(' ');

      const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: '0',
        gsrlimit: '1',
        prop: 'pageimages|extracts|info',
        exintro: '1',
        explaintext: '1',
        inprop: 'url',
        pithumbsize: '480',
        origin: '*'
      });

      const data = await fetchJson(
        'https://en.wikipedia.org/w/api.php?' + params,
        { headers: { Accept: 'application/json' } },
        12000
      );

      const pages = Object.values(data.query?.pages || {});

      if (!pages.length) {
        return send(res, 200, {
          extract: '',
          thumbnail: null,
          url: null,
          provider: 'Wikipedia'
        });
      }

      const p = pages[0];

      return send(res, 200, {
        title: p.title,
        extract: String(p.extract || '').slice(0, 900),
        thumbnail: p.thumbnail?.source || null,
        url: p.fullurl || null,
        provider: 'Wikipedia'
      }, { 'Cache-Control': 'public, max-age=3600' });
    }

    // Weather forecast
    if (url.pathname === '/api/weather' && req.method === 'POST') {
      const b = await body(req);

      if (
        !validCoord(b.lat, -90, 90) ||
        !validCoord(b.lon, -180, 180)
      ) {
        return fail(res, 400, 'Invalid coordinates.');
      }

      const params = new URLSearchParams({
        latitude: String(b.lat),
        longitude: String(b.lon),
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        forecast_days: '3',
        timezone: 'auto'
      });

      const data = await fetchJson(
        'https://api.open-meteo.com/v1/forecast?' + params,
        {},
        12000
      );

      return send(res, 200, data, { 'Cache-Control': 'public, max-age=600' });
    }

    // Driving route
    if (url.pathname === '/api/route' && req.method === 'POST') {
      const b = await body(req);
      const coords = b.coordinates;

      if (
        !Array.isArray(coords) ||
        coords.length < 2 ||
        coords.length > 25 ||
        coords.some(c =>
          !Array.isArray(c) ||
          !validCoord(c[0], -180, 180) ||
          !validCoord(c[1], -90, 90)
        )
      ) {
        return fail(
          res,
          400,
          'Provide between 2 and 25 valid stop coordinates.'
        );
      }

      const line = coords.map(c => `${c[0]},${c[1]}`).join(';');

      const data = await fetchJson(
        `https://router.project-osrm.org/route/v1/driving/${line}?overview=full&geometries=geojson&steps=false`,
        {},
        20000
      );

      return send(res, 200, data, { 'Cache-Control': 'public, max-age=300' });
    }

    // Create shared trip
    if (url.pathname === '/api/trips' && req.method === 'POST') {
      const b = await body(req);

      if (!b || typeof b !== 'object') {
        return fail(res, 400, 'Trip payload is invalid.');
      }

      if (
        !b.destination ||
        !validCoord(b.destination.lat, -90, 90) ||
        !validCoord(b.destination.lon, -180, 180)
      ) {
        return fail(res, 400, 'A valid destination is required.');
      }

      if (!Array.isArray(b.places) || b.places.length > 250) {
        return fail(res, 400, 'Trip must contain no more than 250 stops.');
      }

      const db = readDb();
      let id;

      do {
        id = crypto.randomBytes(5).toString('base64url').toUpperCase();
      } while (db.trips[id]);

      const now = new Date().toISOString();

      const trip = {
        id,
        name: String(b.name || 'TripSync trip').slice(0, 80),
        destination: b.destination,
        settings: b.settings || {},
        places: b.places,
        preferences: Array.isArray(b.preferences) ? b.preferences : [],
        members: Array.isArray(b.members) ? b.members.slice(0, 10) : [],
        createdAt: now,
        updatedAt: now
      };

      db.trips[id] = trip;
      writeDb(db);

      return send(res, 201, {
        trip: safeTrip(trip),
        id,
        shareUrl: `?trip=${id}`,
        votes: []
      });
    }

    // Retrieve or update a shared trip
    const tripMatch = url.pathname.match(
      /^\/api\/trips\/([A-Za-z0-9_-]{4,30})$/
    );

    if (tripMatch && req.method === 'GET') {
      const db = readDb();
      const id = tripMatch[1].toUpperCase();
      const trip = db.trips[id];

      if (!trip) {
        return fail(
          res,
          404,
          'Share code not found. Check the code or ask the trip owner to create a new link.'
        );
      }

      return send(res, 200, {
        trip: safeTrip(trip),
        votes: votesFor(db, id)
      });
    }

    if (tripMatch && req.method === 'PUT') {
      const db = readDb();
      const id = tripMatch[1].toUpperCase();
      const old = db.trips[id];

      if (!old) return fail(res, 404, 'Share code not found.');

      const b = await body(req);

      if (!Array.isArray(b.places) || b.places.length > 250) {
        return fail(res, 400, 'Trip must contain no more than 250 stops.');
      }

      const trip = {
        ...old,
        ...b,
        id,
        updatedAt: new Date().toISOString()
      };

      db.trips[id] = trip;
      writeDb(db);

      return send(res, 200, {
        trip: safeTrip(trip),
        votes: votesFor(db, id)
      });
    }

    // Group voting
    const voteMatch = url.pathname.match(
      /^\/api\/trips\/([A-Za-z0-9_-]{4,30})\/votes$/
    );

    if (voteMatch && req.method === 'POST') {
      const id = voteMatch[1].toUpperCase();
      const db = readDb();

      if (!db.trips[id]) {
        return fail(res, 404, 'Shared trip not found.');
      }

      const b = await body(req);
      const place = String(b.place || '').trim().slice(0, 120);
      const voter = String(b.voter || 'Traveller').trim().slice(0, 40) || 'Traveller';

      if (!place) return fail(res, 400, 'Place name is required.');

      const voteId = crypto
        .createHash('sha256')
        .update(`${id}|${voter.toLowerCase()}|${place.toLowerCase()}`)
        .digest('hex');

      db.votes[voteId] = {
        tripId: id,
        place,
        voter,
        createdAt: new Date().toISOString()
      };

      writeDb(db);

      return send(res, 200, { votes: votesFor(db, id) });
    }

    // Unknown API route
    if (url.pathname.startsWith('/api/')) {
      return fail(res, 404, 'API endpoint not found.');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return fail(res, 405, 'Method not allowed.');
    }

    // Serve frontend files
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === '/') pathname = '/index.html';

    const file = path.resolve(PUBLIC, '.' + pathname);

    if (
      !file.startsWith(PUBLIC + path.sep) &&
      file !== path.join(PUBLIC, 'index.html')
    ) {
      return fail(res, 403, 'Forbidden');
    }

    fs.readFile(file, (error, data) => {
      if (error) return fail(res, 404, 'File not found.');

      const ext = path.extname(file);

      const types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg'
      };

      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });

      if (req.method === 'HEAD') return res.end();

      res.end(data);
    });

  } catch (error) {
    if (!res.headersSent) {
      fail(res, error.status || 502, error.message || 'Unexpected server error.');
    } else {
      res.end();
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TripSync ${VERSION} listening on http://localhost:${PORT}`);
});