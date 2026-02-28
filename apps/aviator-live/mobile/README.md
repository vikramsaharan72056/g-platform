# Aviator Live Mobile

## Run
```bash
cd apps/aviator-live/mobile
npm install
copy .env.example .env
npm run start
```

For web:
```bash
npm run web
```

## Environment
- `EXPO_PUBLIC_AVIATOR_API_URL` defaults to `http://localhost:3501`

## Current Features
1. Guest login with token persistence on web.
2. Live round state, multiplier, crash, and settlement updates via socket.
3. Manual and auto-cashout bet placement.
4. Manual cashout trigger from active bet cards.
5. Wallet balance updates and recent crash history view.
