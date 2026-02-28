# Seven Up Down: Ideal Player Flow and Executable Plan

## 1) Ideal Gameplay (Player View)

### Entry
1. User opens Seven Up Down from lobby.
2. User sees timer, wallet balance, and recent outcomes.

### Betting Phase (`BETTING`)
1. Timer runs (default 20s).
2. User bets on:
   - `down` (2 to 6)
   - `seven` (exactly 7)
   - `up` (8 to 12)
3. User can place multiple chips across one or more outcomes before lock.

### Lock and Roll (`LOCKED` -> `PLAYING`)
1. Bets lock.
2. Dice animation starts.
3. Two dice results are revealed, then total and outcome.

### Result and Settlement
1. Winning outcome highlights.
2. Wallet settles immediately.
3. Next round countdown appears.

## 2) Betting Contract (Ideal)

### Bet Types and Multipliers
1. `down`: `2.0x`
2. `seven`: `5.0x`
3. `up`: `2.0x`

### Bet Payload
```json
{
  "roundId": "uuid",
  "betType": "up",
  "amount": 100
}
```

## 3) Round Lifecycle (Ideal Timings)
1. `WAITING`: 3s
2. `BETTING`: 20s
3. `LOCKED`: 2s
4. `PLAYING`: 3s dice roll reveal
5. `RESULT`: 4s
6. `SETTLED`: immediate

## 4) Required Real-Time Events
1. `round:created`
2. `round:locked`
3. `dice:rolling`
4. `round:result`
5. `round:settled`
6. `wallet:updated`
7. `round:state` (reconnect snapshot)

## 5) Failure and Edge Cases
1. Bet after lock: reject with explicit reason.
2. Duplicate bet submit: idempotency key per client request.
3. Reconnect during animation: return deterministic final dice state.
4. Settlement retry after transient DB error: idempotent reconcile job.

## 6) Executable Development Plan

### Backend
1. Implement deterministic dice roll generation (seeded per round).
2. Persist and broadcast exact dice values and total.
3. Add idempotent settlement processing with replay-safe checks.
4. Add probability monitoring and anomaly alerts.

### Mobile
1. Build fast bet panel with one-tap chips and repeat-bet shortcut.
2. Implement two-dice animation and final reveal state.
3. Implement loss/win visual with clear payout summary.
4. Handle reconnect and restore current round instantly.

### Admin
1. Live monitor for round number, total bet amount, outcome streaks.
2. Config editor for min/max bet and timer settings.
3. Distribution dashboard (`up/down/seven`) and house PnL trend.

### QA
1. Unit tests for outcome mapping and payout correctness.
2. Property tests for dice total bounds (`2..12`).
3. E2E round flow with all three outcomes.
4. Long-run simulation for probability drift checks.

## 7) Acceptance Criteria
1. Every settled round has exactly one winning outcome.
2. Payout totals match formula for mixed multi-bet tickets.
3. Reconnect restores same round and result without divergence.
