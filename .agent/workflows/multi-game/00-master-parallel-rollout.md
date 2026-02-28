# Multi-Game Parallel Rollout (Post Rummy-Live)

## Scope
This plan covers the five non-rummy games currently in `packages/api/src/modules/games/engines`:

1. `aviator`
2. `seven-up-down`
3. `dragon-tiger`
4. `teen-patti`
5. `poker`

`apps/rummy-live` remains the baseline reference for production standards (auth, wallet, socket discipline, logging, deployment hardening).

## Product Rules (Ideal Player Experience)
1. Every game has a visible round timeline and a clear betting deadline.
2. Every bet action immediately updates local wallet preview and server-confirmed balance.
3. Every settlement is idempotent and auditable with transaction records.
4. Every game screen is reconnect-safe (resume round state in under 2 seconds).
5. Every round lifecycle is explicit: `WAITING -> BETTING -> LOCKED -> PLAYING -> RESULT -> SETTLED`.

## Execution Model (Parallel Lanes)
Run five lanes in parallel with strict shared contracts:

1. `Lane A - Shared Platform`
   - Round state contract, websocket contract, ledger semantics, reconnect protocol, metrics.
2. `Lane B - Game Backend`
   - Game-specific engine logic and settlement rules.
3. `Lane C - Game Mobile`
   - Player UX and live interaction per game.
4. `Lane D - Admin + Controls`
   - Monitoring, game config, override controls (staging only), analytics.
5. `Lane E - QA + Automation`
   - Deterministic engine tests, contract tests, e2e game flow, load tests.

## Recommended Wave Order
Use complexity-based waves while still parallelizing inside each wave.

1. `Wave 1 (fastest value)`: Aviator + Seven Up Down
2. `Wave 2`: Dragon Tiger + Teen Patti
3. `Wave 3 (highest complexity)`: Poker

## Shared Definition of Ready (Per Game)
1. Round event contract finalized and versioned.
2. Bet type catalog finalized (labels, payout, validation rules).
3. Settlement formula documented with examples.
4. Failure behavior defined (`late bet`, `late cashout`, `duplicate request`, `reconnect`).
5. Admin config fields finalized (`minBet`, `maxBet`, `bettingWindow`, `roundDuration`, `maintenanceMode`).

## Shared Definition of Done (Per Game)
1. Backend:
   - Engine loop stable for 24h soak in staging.
   - No negative wallet or double settlement under concurrency tests.
   - Metrics and logs present for every round transition.
2. Mobile:
   - Full round playable on low-end device.
   - Reconnect restores current round and open bets.
   - Wallet and bet history update in near real-time.
3. Admin:
   - Live monitor, round history, PnL metrics, per-bet-type distribution.
4. QA:
   - Engine unit tests, API contract tests, socket e2e tests, load test report.
5. Operations:
   - Runbook, alert thresholds, rollback plan documented.

## Repo Execution Pattern
Create game apps in `apps/` using rummy-live as infra reference only:

1. `apps/aviator-live/{api,admin,mobile}`
2. `apps/seven-up-down-live/{api,admin,mobile}`
3. `apps/dragon-tiger-live/{api,admin,mobile}`
4. `apps/teen-patti-live/{api,admin,mobile}`
5. `apps/poker-live/{api,admin,mobile}`

Game-specific gameplay and UX should follow the docs below, not the rummy UI flow.

## Game-Specific Blueprints
1. [Aviator](./01-aviator-ideal-flow-and-plan.md)
2. [Seven Up Down](./02-seven-up-down-ideal-flow-and-plan.md)
3. [Dragon Tiger](./03-dragon-tiger-ideal-flow-and-plan.md)
4. [Teen Patti](./04-teen-patti-ideal-flow-and-plan.md)
5. [Poker](./05-poker-ideal-flow-and-plan.md)

## Immediate Build Start
1. Start Aviator implementation first (backend + mobile + admin monitor).
2. Start Seven Up Down in parallel once shared round and settlement contracts are locked.
3. Keep Dragon Tiger and Teen Patti queued behind card-deck shared utility hardening.
4. Start Poker once shared card evaluator test harness is stable.
