# Even Home Assistant

Smart-home control app for **Even Realities G2** glasses with **Home Assistant** integration.

The app runs as an Even Hub web app, renders a menu on-device, and controls Home Assistant entities (currently lights and scenes) with fast state feedback and local persistence.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Run Modes](#run-modes)
- [Packaging and Deployment (.ehpk)](#packaging-and-deployment-ehpk)
- [How It Works](#how-it-works)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

## Features

- 3-level glasses navigation: `Rooms -> Entities -> Commands`
- Dynamic room/entity import from Home Assistant
- Manual refresh action directly in the root glasses menu
- Optimistic state updates with follow-up state confirmation
- HA WebSocket sync with polling fallback
- Empty-state handling with feedback and toast error messages
- Local persistence for:
  - Home Assistant URL
  - HA token
  - imported rooms/entities
  - selected room/entity
  - cached entity state

## Tech Stack

- TypeScript
- Vite
- `@evenrealities/even_hub_sdk`
- `@evenrealities/evenhub-cli`
- `@evenrealities/evenhub-simulator`

## Project Structure

```text
src/
  main.ts                 # App orchestration, bridge lifecycle, menu state, command execution
  haApi.ts                # Home Assistant REST calls and mapping to app models
  stateSync.ts            # HA WebSocket + fallback polling state synchronization
  menu.ts                 # Menu item generation and robust index resolution
  models.ts               # Domain models and command definitions
  config.ts               # Storage keys and bootstrap/env config
  errors.ts               # Error normalization and user-facing HA error mapping
  state/
    appState.ts           # Core in-memory app state and selectors
    persistence.ts        # Local persistence serialization/deserialization
  ui/
    glasses.ts            # Even SDK container creation/rebuild/update
    webControls.ts        # Browser control panel UI helpers
```

## Requirements

- Node.js 20+ (recommended)
- npm
- Home Assistant instance reachable from your device/simulator
- Long-Lived Access Token from Home Assistant

## Quick Start

```bash
npm install
npm run dev
```

Open:
- local browser: `http://localhost:3000`
- phone in same LAN: `http://<your-pc-lan-ip>:3000`

Then in the app:
1. Enter Home Assistant URL and token
2. Click `Verbindung testen`
3. Click `Load rooms from HA`
4. Click `Deploy to glasses`

## Configuration

The app supports optional local bootstrap values via `.env.local`:

```env
VITE_HA_BASE_URL=http://<your-ha-host>:8123
VITE_HA_TOKEN=<your-long-lived-token>
```

Notes:
- `.env.local` is ignored by git.
- Runtime edits in the UI are persisted and reused on restart.

## Run Modes

### Browser + Dev Server

```bash
npm run dev
```

### Simulator

```bash
npm run sim
```

### QR for Even Hub App

```bash
npm run qr
```

## Packaging and Deployment (.ehpk)

Build and package for distribution:

```bash
npm run pack
```

This produces `app.ehpk` from:
- `app.json`
- `dist/`

## How It Works

1. App boot:
   - hydrate local/bridge storage
   - restore previous app state if available
2. Data load:
   - query Home Assistant template API
   - map entities to `Room[]`
3. Glasses UI:
   - create or rebuild startup containers
   - render current menu level + header + toast
4. Command execution:
   - send REST call to HA service endpoint
   - apply optimistic state
   - verify actual state after command
5. Background sync:
   - subscribe to HA `state_changed` events over WebSocket
   - fallback polling if WebSocket is unavailable

## Security Notes

- Do not commit secrets (`.env.local`, tokens).
- Rotate tokens if exposed.
- Token persistence currently uses local/bridge storage for UX continuity.
- Use Home Assistant user permissions scoped to the required entities.

## Troubleshooting

- **Repository on phone cannot reach HA**
  - Ensure HA URL is reachable from phone and glasses network path.
  - If running via Vite dev server, keep phone and PC in the same LAN.

- **No rooms loaded / black screen avoided by empty state**
  - Use `Load rooms from HA` in web UI or `HA Daten neu laden` on glasses root menu.
  - Check token validity and HA URL.

- **CORS issues in browser**
  - In local dev, requests are proxied through `/ha` in `vite.config.ts`.
  - If needed, allow your dev origin in Home Assistant `http.cors_allowed_origins`.
