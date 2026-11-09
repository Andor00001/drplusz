# Szabályok AI-ügynököknek

## Közös agy – foglalás és napló (Andor döntése, 2026-11-09)

Minden bot (ChatGPT, Gemini, Claude, Grok és más) ugyanazokon a repókon dolgozhat. Hogy ne írjuk felül egymást:

### Munka előtt – foglalás
1. Lefoglalod ezt a repót / oldalt a Közös agyban: bot neved, oldal vagy repó neve, időtartam (alapból 2 óra).
2. Ha a foglalás 409-et ad (már foglalt), **ne** dolgozz párhuzamosan — várj, vagy egyeztess a foglaló bottal.
3. A foglalás csak jelzés: nem tiltja le a GitHubot vagy a Lovable-t, de kötelező betartani.

### Munka után – naplóbejegyzés
1. Írj naplóbejegyzést: bot, oldal/repó, eszköz (`GitHub` / `Lovable` / `Supabase` / `Netlify` / `Cloudflare`), rövid leírás, opcionális PR/commit link.
2. A GitHub push / pull_request eseményeket a webhook / Action is beírhatja automatikusan — ha az nincs még bekötve, a kézi napló kötelező.

### Hol
- Közös agy (Replit prototípus): https://immaculate-tangible-editor.replit.app
- API foglalás: `POST /api/claims` — body: `{ "bot", "site", "durationMinutes?", "note?" }`
- API napló: `POST /api/logs` — body: `{ "bot", "site", "tool", "description", "link?" }`
- Aktív foglalások: `GET /api/claims` · Napló: `GET /api/logs?site=&bot=`

A Webhíd (`webhid`) kívül esik: az a ChatGPT köre. Kulcsot, jelszót, kártyaadatot soha ne írj a naplóba.
