# Even Hub G2 Smart Lamp Control

TypeScript app for Even Realities G2 to control smart lamps in the same LAN via HTTP.

- `@evenrealities/even_hub_sdk`
- `@evenrealities/evenhub-cli`
- `@evenrealities/evenhub-simulator`

## Scripts

- `npm run dev` - start Vite dev server on port 3000
- `npm run qr` - generate QR in terminal
- `npm run sim` - open simulator against `http://127.0.0.1:3000`
- `npm run init:app` - generate `app.json` with EvenHub CLI
- `npm run pack` - build and package `.ehpk` from `app.json` + `dist`

## Home Assistant setup

This app now targets Home Assistant directly:

- Base URL (example: `http://192.168.178.154:8123`)
- Long-Lived Access Token

API calls used:

- `POST /api/services/light/turn_on`
- `POST /api/services/light/turn_off`
- `POST /api/services/light/toggle`
- `GET /api/states/<entity_id>`

Dev/Simulator note:
- In local dev (`localhost` / `127.0.0.1`) requests are proxied via `/ha` in `vite.config.ts` to avoid CORS issues.

Rooms/entities are loaded dynamically from Home Assistant (`Load rooms from HA` / `HA Daten neu laden`).

Optional local bootstrap (do not commit real secrets):
- Create `.env.local`
- Set `VITE_HA_BASE_URL=http://<your-ha-host>:8123`
- Set `VITE_HA_TOKEN=<your-long-lived-token>`
- Keep `.env.local` out of version control

If browser requests are blocked by CORS, allow your dev origin in Home Assistant (`http.cors_allowed_origins`) for your local dev URL.

## Typical flow

1. `npm run dev`
2. For simulator-only testing: `npm run sim`
3. In app: select `Raum -> Lampe -> Befehl`
4. Save HA config, test with `Test selected command`
5. For real G2 later: `npm run qr`, scan in Even Hub app, then `Connect bridge` -> `Deploy to glasses`
