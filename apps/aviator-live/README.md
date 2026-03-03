# Aviator Live (Isolated New App)

This is the next game app stack after `apps/rummy-live`.

Folders:
- `api`: real-time Aviator backend (REST + Socket) - implemented first slice
- `mobile`: playable Aviator client (Expo) - implemented first slice
- `admin`: live monitor + runtime controls dashboard - implemented first slice
- `e2e`: Playwright flow tests for login/bet/cashout/settlement
- `docs`: implementation notes and rollout checklist

Rule:
- Existing apps in `apps/rummy-live` and platform code in `packages/` remain untouched.
