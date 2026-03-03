# Aviator Live Admin

## Run
```bash
cd apps/aviator-live/admin
npm install
copy .env.example .env
npm run dev
```

Default URL: `http://localhost:3511`

## Features in this slice
1. Admin login (`/auth/admin-login`) with token session storage.
2. Live monitor cards: round state, multiplier, stake/payout, player/bet counts.
3. Runtime config editor:
   - min/max bet
   - betting/lock/waiting timings
   - multiplier tick/growth
   - max crash point
   - maintenance toggle
4. Socket-backed event tape for round lifecycle and config updates.
