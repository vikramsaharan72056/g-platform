# Rummy Live Production Execution Tracker

Last updated: 2026-02-25
Owner: Codex + User

## Goal
Get `apps/rummy-live` from current state to deployable production state with no known broken core flow.

## Execution Rules
1. One task at a time.
2. Each task must include:
- concrete commands
- acceptance checks
- rollback notes (if any)
3. A task is only marked complete when acceptance checks pass.
4. Do not start the next P0 task until current P0 task is complete.

## Current Baseline
- API source and runtime were out of sync (`src` and `dist` differed).
- Admin has auth/RBAC and endpoint-contract issues.
- Live Monitor event namespace is mismatched with backend.
- Mobile and Admin use hardcoded tunnel URLs.
- Build/runtime validation was incomplete for production.

## P0 Tasks (Must Complete Before Any Deploy)

### P0-1 API Runtime Contract Unification
Status: COMPLETE

Objective:
- Ensure `apps/rummy-live/api/src/main.ts` is the authoritative runtime behavior and `dist` is rebuilt from it.

Actions:
- [x] Install/repair API dependencies so source compiles cleanly.
- [x] Regenerate Prisma client for current schema.
- [x] Run typecheck/build for API.
- [x] Verify `dist/main.js` contains all expected source routes.
- [x] Verify API starts and `/health` is reachable.

Acceptance checks:
- [x] `cd apps/rummy-live/api && npx tsc --noEmit` returns exit code 0.
- [x] `cd apps/rummy-live/api && npm run build` returns exit code 0.
- [x] Route count in `src/main.ts` and `dist/main.js` is aligned.
- [x] `GET /health` returns `{ data: { ok: true } }` shape.

Evidence:
- `npm install` in `apps/rummy-live/api` added missing packages.
- `npx prisma generate` completed successfully.
- Route parity now: `src_routes=38 dist_routes=38`.
- Health response verified from rebuilt dist runtime.

Rollback notes:
- If needed, restore previous `apps/rummy-live/api/package-lock.json` and `dist/` from git history.

### P0-2 Admin Auth + RBAC Hardening
Status: COMPLETE

Objective:
- Remove fake admin auth path and enforce backend role checks for admin-only actions.

Actions:
- [x] Replace guest-login-based admin auth flow.
- [x] Add server-side role model and middleware checks for admin endpoints.
- [x] Block non-admin tokens from deposit/withdrawal approval and QR management endpoints.

Acceptance checks:
- [x] Non-admin token receives 403 on admin endpoints.
- [x] Admin token can complete all admin actions.

Evidence:
- API now exposes `POST /auth/admin-login` and `GET /auth/me`.
- JWT user payload now carries role (`PLAYER` or `ADMIN`), and admin middleware is enforced server-side.
- Admin-only routes now require admin role (`/users/admin/list`, admin deposit/withdraw routes, admin QR routes, `/audit`, `/system/production-report`).
- Runtime smoke result:
  - guest token -> `/deposits` and `/payment-qrs/all` = forbidden
  - admin login -> success, `/auth/me` role = `ADMIN`, admin `/deposits` access = success
  - invalid admin password -> rejected

Rollback notes:
- Revert API auth and admin service changes if client token compatibility issues appear in downstream apps.

### P0-3 Admin API Contract Repair
Status: COMPLETE

Objective:
- Make all admin pages call real backend routes only.

Actions:
- [x] Remove/replace `PATCH /tables/:id/status` usage.
- [x] Remove mocked `gameControlsAPI` placeholders or add real backend endpoints.
- [x] Ensure user detail wallet operations map correctly to backend behavior.

Acceptance checks:
- [x] No admin screen performs a request to missing endpoint.
- [x] No critical action silently falls back to fake data.

Evidence:
- Admin service now uses real routes only for user/admin wallet flows (`/users/admin/list`, `/users/admin/:id`, `/users/admin/:id/wallet-adjust`), and unsupported control endpoints are explicit "not available" errors (no fake success fallback).
- `UsersPage` and `UserDetailPage` were aligned to backend capabilities; unsupported status mutations were removed.
- `AnalyticsPage` and `GameControlsPage` were rewritten to avoid calling missing analytics/control endpoints and now render contract-safe UI.
- Runtime smoke after Prisma sync (`npx prisma db push`) and API fix:
  - `POST /auth/admin-login` = success
  - guest token -> `GET /users/admin/list` = `403`
  - admin token -> `GET /users/admin/list` = `200`
  - admin token -> `GET /users/admin/:id` = `200`
  - admin token -> `POST /users/admin/:id/wallet-adjust` = `200`
  - wallet balance delta verified (`+25`) after adjust.
- Critical partial-failure bug fixed: audit FK errors no longer break admin operations after successful wallet mutations (`appendAudit` now retries with `actorUserId: null` and preserves `actorRef` in payload).

Rollback notes:
- Revert admin page/service contract changes and API audit fallback logic if backend is later expanded with dedicated game-control analytics endpoints.

### P0-4 Live Monitor Socket Contract Alignment
Status: COMPLETE

Objective:
- Align Admin Live Monitor with actual rummy socket namespace/events.

Actions:
- [x] Replace `/game` + `round:*` listeners with real `table:*` contract, or implement a backend adapter.
- [x] Verify live updates for subscribe/state/error/timeout.

Acceptance checks:
- [x] Live Monitor shows real table updates from active table events.
- [x] No dead listeners remain.

Evidence:
- `admin/src/pages/LiveMonitorPage.tsx` was rewritten to consume backend contract events:
  - `table:list`
  - `table:state`
  - `table:error`
  - `table:timeout`
  and to emit `table:subscribe` / `table:unsubscribe`.
- Removed legacy `/game` namespace and dead listeners (`round:*`, `aviator:*`, `bet:*`).
- Added dev socket proxy in `admin/vite.config.ts` for `/socket.io` with `ws: true`.
- Runtime socket smoke (live table lifecycle create->join->start) passed with event capture:
  - `gotTableList=true`
  - `gotTableState=true`
  - `gotTableError=true` (invalid subscribe path tested)
  - `gotTimeout=true` with payload `{ tableId, userId, message: 'Turn timed out. Full drop applied.' }`.

Rollback notes:
- Revert `LiveMonitorPage.tsx` and `vite.config.ts` if a separate socket gateway/namespace is introduced later.

### P0-5 Mobile Table Exit/Session Cleanup
Status: COMPLETE

Objective:
- Prevent stale subscriptions and table-state drift.

Actions:
- [x] On back/exit, unsubscribe socket and leave table where appropriate.
- [x] Clear store loading flags reliably.

Acceptance checks:
- [x] Re-entering lobby does not leave ghost subscriptions.
- [x] Table state is consistent after exit/rejoin.

Evidence:
- `mobile/src/screens/GameScreen.tsx` now performs lifecycle-safe exit:
  - `table:unsubscribe` on back.
  - calls `POST /tables/:id/leave` when table is still `WAITING`.
  - clears `currentTable` and loading state on successful exit.
- `mobile/src/screens/LobbyScreen.tsx` join flow now:
  - sets loading at start and clears it in `finally`.
  - sets `currentTable` from real `POST /tables/:id/join` response immediately.
  - unsubscribes previous table before joining a different one.
  - wallet load path corrected to `/wallet/me`.
- `mobile/src/api/socketService.ts` now:
  - tracks subscribed tables and re-subscribes after reconnect.
  - clears loading on `table:state`, `table:error`, and `disconnect`.
  - clears tracked subscriptions on disconnect.
- Runtime socket unsubscribe smoke:
  - connect + subscribe + receive initial `table:state`.
  - emit `table:unsubscribe`.
  - trigger server-side table state change (`POST /tables/:id/start` by another player).
  - result: `receivedAfterUnsubWindow=false` (no ghost updates after unsubscribe window).

Rollback notes:
- Revert `mobile` socket/lifecycle changes if product decides to keep players subscribed while in lobby.

### P0-6 Environment/Config Externalization
Status: TODO

Objective:
- Remove hardcoded tunnel endpoints and use env-driven config.

Actions:
- [ ] Admin: replace fixed Vite proxy target with env variable.
- [ ] Mobile: replace hardcoded API URL with env config.
- [ ] Document production env set.

Acceptance checks:
- [ ] No hardcoded dev tunnel in production code path.
- [ ] Local/dev/prod configs switch without code changes.

### P0-7 Reliable E2E Gate
Status: TODO

Objective:
- Make E2E deterministic and mapped to real UI selectors/contracts.

Actions:
- [ ] Fix selector assumptions (for example missing `data-testid` usage).
- [ ] Run end-to-end login->table->gameplay->deposit/withdraw/admin review flow.

Acceptance checks:
- [ ] E2E passes from clean start.
- [ ] Failing tests point to real regressions, not flaky selectors.

## P1 Tasks (Before Production Traffic Ramp)
- [ ] Rate limiting and anti-abuse for auth and wallet endpoints.
- [ ] Audit log enrichment (actor role, correlation id, IP/device metadata).
- [ ] Observability baseline (structured logs, metrics, alerts).
- [ ] Backup/recovery runbook for DB and Redis.

## Execution Log
- 2026-02-25: Tracker created.
- 2026-02-25: Started P0-1.
- 2026-02-25: Completed P0-1 (dependency repair, Prisma regen, API rebuild, route parity restored, health check pass).
- 2026-02-25: Completed P0-2 (real admin login endpoint, role-based JWT, server-side admin middleware, RBAC smoke pass).
- 2026-02-25: Completed P0-3 (admin API contract alignment, unsupported admin-control calls removed from UI flow, wallet-adjust runtime bug fixed, runtime smoke pass).
- 2026-02-26: Completed P0-4 (Live Monitor migrated to real `table:*` socket contract, dead listeners removed, socket subscribe/state/error/timeout smoke pass).
- 2026-02-26: Completed P0-5 (mobile join/exit lifecycle cleanup, loading-state reliability fixes, unsubscribe smoke pass with no ghost state updates).
