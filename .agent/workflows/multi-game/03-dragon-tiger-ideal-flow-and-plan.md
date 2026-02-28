# Dragon Tiger: Ideal Player Flow and Executable Plan

## 1) Ideal Gameplay (Player View)

### Entry
1. User opens Dragon Tiger from lobby.
2. User sees timer, betting board, and recent winner history.

### Betting Phase (`BETTING`)
1. Timer runs (default 15s).
2. User can bet on:
   - Main: `dragon`, `tiger`, `tie`
   - Side: odd/even, red/black for each side
3. User can combine main and side bets on same round.

### Lock and Reveal (`LOCKED` -> `PLAYING`)
1. Bets lock.
2. Dragon card reveal animation.
3. Short suspense pause.
4. Tiger card reveal animation.

### Result and Settlement
1. Main winner and side outcomes highlight.
2. Payouts settle to wallet.
3. Next round countdown starts.

## 2) Betting Contract (Ideal)

### Bet Types and Multipliers
1. Main:
   - `dragon`: `1.95x`
   - `tiger`: `1.95x`
   - `tie`: `11x`
2. Side:
   - `dragon_odd`, `dragon_even`, `dragon_red`, `dragon_black`: `1.9x`
   - `tiger_odd`, `tiger_even`, `tiger_red`, `tiger_black`: `1.9x`

### Bet Payload
```json
{
  "roundId": "uuid",
  "betType": "dragon_red",
  "amount": 150
}
```

## 3) Round Lifecycle (Ideal Timings)
1. `WAITING`: 3s
2. `BETTING`: 15s
3. `LOCKED`: 2s
4. `PLAYING`: 3s reveal
5. `RESULT`: 4s
6. `SETTLED`: immediate

## 4) Required Real-Time Events
1. `round:created`
2. `round:locked`
3. `dragon-tiger:dragon_revealed`
4. `dragon-tiger:tiger_revealed`
5. `round:result`
6. `round:settled`
7. `wallet:updated`
8. `round:state`

## 5) Failure and Edge Cases
1. Duplicate card draw prevention (same suit+value pair).
2. Reconnect during partial reveal should resume from current phase.
3. Tie handling must settle side bets independently.
4. Round stuck between reveals should auto-failover to result with audit log.

## 6) Executable Development Plan

### Backend
1. Harden card draw generator with deterministic seed per round.
2. Persist reveal phase transitions for reconnect correctness.
3. Validate settlement for concurrent main + side bets.
4. Add tie-frequency and side-bet hit-rate metrics.

### Mobile
1. Build betting board for all main and side markets.
2. Build staged reveal animations with deterministic state replay.
3. Add compact result panel showing each winning market.
4. Implement quick repeat-bet from previous round.

### Admin
1. Live monitor for main outcome and side outcome distributions.
2. Config editor for timers and market enable/disable toggles.
3. Alerting for abnormal tie streaks and payout spikes.

### QA
1. Unit tests for all winning bet combinations.
2. Contract tests for phase-by-phase reveal events.
3. E2E tests:
   - Dragon win.
   - Tiger win.
   - Tie plus side-bet settlement.
4. Statistical simulation for main market distribution.

## 7) Acceptance Criteria
1. Main and side bet settlement matches exact result matrix.
2. Partial reconnect always resumes the same reveal phase.
3. No duplicate card pair in a single round.
