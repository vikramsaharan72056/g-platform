# Aviator Live API

## Run
```bash
cd apps/aviator-live/api
npm install
copy .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

## Core Endpoints
- `POST /auth/guest-login`
- `GET /auth/me`
- `GET /aviator/config/public`
- `GET /aviator/round/current`
- `GET /aviator/round/history`
- `POST /aviator/bets`
- `POST /aviator/bets/cashout`
- `GET /aviator/bets/me`
- `GET /wallet/me`
- `GET /wallet/me/transactions`

## Socket Events
Client -> Server:
- `aviator:cashout`
- `round:state:request`

Server -> Client:
- `round:created`
- `round:locked`
- `aviator:takeoff`
- `aviator:multiplier`
- `aviator:cashout`
- `aviator:crash`
- `round:settled`
- `wallet:updated`
- `round:state`
