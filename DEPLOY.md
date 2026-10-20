# Free-first deployment

1. Push this folder to a GitHub repository.
2. Create a Node.js Web Service on a host with a free tier currently available to you.
3. Build command: leave empty (no dependencies).
4. Start command: `npm start`.
5. Health-check path: `/api/health`.
6. Ensure the host supports Node 18+ and outbound HTTPS requests.

## Persistence warning

The default JSON-file storage is suitable for local development and demos. Many free application hosts have ephemeral filesystems; shared trips may be lost after restart/redeploy. For real multi-user persistence, connect a database (for example a free-tier Supabase Postgres project) and implement its schema, Row Level Security, and server-side credentials. Never expose a service-role key in browser code.

## Free API limits

Public Nominatim, Overpass, OSRM demo and Open-Meteo endpoints are not a guaranteed production backend. Follow each provider's current usage policy, cache results, avoid rapid repeat requests, and be ready for temporary failures. This project makes no paid Google Maps dependency.
