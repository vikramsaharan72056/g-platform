# Rummy Live Run Book

## 1) Start API

```bash
cd apps/rummy-live/api
npm install
npm run dev
```

API URL: `http://localhost:3400`

Optional env:
- `RUMMY_DB_PATH` (default: `./data/rummy-live.db`)
- `RUMMY_TURN_TIMEOUT_SECONDS` (default: `30`)

## 2) Start Admin

```bash
cd apps/rummy-live/admin
npm install
npm run dev
```

Admin URL: `http://localhost:5400`

## 3) Start Mobile

```bash
cd apps/rummy-live/mobile
npm install
npm run web
```

## Current gameplay support

- Guest login
- Create table
- Join table
- Start game (host)
- Turn-based draw from open/closed pile
- Discard selected card
- Declare hand
- First/middle/full drop
- Turn timeout auto full-drop
- Invalid declaration penalty and settlement
- SQLite table + game history persistence
