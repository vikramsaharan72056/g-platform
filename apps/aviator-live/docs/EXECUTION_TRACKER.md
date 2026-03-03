# Aviator Live Execution Tracker

## Completed in this slice
- [x] Created isolated app structure at `apps/aviator-live`
- [x] Bootstrapped API package with TypeScript + Prisma + Socket.IO
- [x] Implemented round lifecycle loop:
  - `BETTING -> LOCKED -> PLAYING -> RESULT -> SETTLED`
- [x] Implemented manual + auto cashout path
- [x] Implemented wallet debit/credit transaction logging
- [x] Added socket events for live multiplier and crash settlement
- [x] Bootstrapped mobile app package with Expo
- [x] Implemented playable Aviator screen wired to API + socket events
- [x] Added guest login persistence (web), bet placement, cashout action, and wallet updates
- [x] Added admin auth + admin monitor/config API endpoints
- [x] Bootstrapped admin dashboard with live monitor, event tape, and config controls
- [x] Added Playwright e2e flow for login -> bet -> cashout -> settlement

## Next implementation slice
- [ ] Reconnect replay endpoint and socket delta replay IDs
- [ ] Redis-backed shared state for multi-instance execution
- [ ] CI wiring for aviator e2e pipeline
