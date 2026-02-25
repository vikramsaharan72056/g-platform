# Rummy Live API

Separate API app for real-time manual draw/discard Rummy tables.

## Run

```bash
cd apps/rummy-live/api
npm install
npm run dev
```

Server defaults to `http://localhost:3400`.

## Core endpoints

- `POST /auth/guest-login`
- `GET /tables`
- `POST /tables` (auth)
- `POST /tables/:id/join` (auth)
- `POST /tables/:id/leave` (auth)
- `POST /tables/:id/start` (auth)
- `GET /tables/:id` (auth)
- `GET /tables/:id/history` (auth)

## Socket events

- `table:subscribe`
- `table:unsubscribe`
- `turn:draw`
- `turn:discard`
- `turn:declare`
- `turn:drop`

Server emits:
- `table:list`
- `table:state`
- `table:error`
- `table:timeout`

## Advanced rule support in this build

- Joker-aware hand evaluation
- First / middle / full drop penalties
- Invalid declaration penalty (80) and round settlement
- Turn timeout auto full-drop
- SQLite persistence for tables and game history (`RUMMY_DB_PATH`)
