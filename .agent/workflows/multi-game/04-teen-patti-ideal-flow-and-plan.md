# Teen Patti: Ideal Player Flow and Executable Plan

## 1) Ideal Gameplay (Player View)

### Entry
1. User opens Teen Patti from lobby.
2. User sees Player A vs Player B table, timer, and recent winners.

### Betting Phase (`BETTING`)
1. Timer runs (default 30s).
2. User can bet on:
   - Main winner (`player_a`, `player_b`, `tie`)
   - Side markets (`player_a_pair_plus`, `player_b_pair_plus`, `any_trail`)
3. User can place multiple chips across markets before lock.

### Lock and Deal (`LOCKED` -> `PLAYING`)
1. Bets lock.
2. Cards are dealt and revealed with animation:
   - Player A card 1, 2, 3
   - Player B card 1, 2, 3
3. Hand ranks are computed and displayed.

### Result and Settlement
1. Winner and hand type highlight.
2. Side bets resolve from final hands.
3. Wallet settles and next round starts.

## 2) Betting Contract (Ideal)

### Bet Types and Multipliers
1. Main:
   - `player_a`: `1.95x`
   - `player_b`: `1.95x`
   - `tie`: `25x`
2. Side:
   - `player_a_pair_plus`: `3.5x`
   - `player_b_pair_plus`: `3.5x`
   - `any_trail`: `50x`

### Bet Payload
```json
{
  "roundId": "uuid",
  "betType": "player_a_pair_plus",
  "amount": 100
}
```

## 3) Hand Ranking (Highest to Lowest)
1. `TRAIL`
2. `PURE_SEQUENCE`
3. `SEQUENCE`
4. `COLOR`
5. `PAIR`
6. `HIGH_CARD`

## 4) Round Lifecycle (Ideal Timings)
1. `WAITING`: 3s
2. `BETTING`: 30s
3. `LOCKED`: 2s
4. `PLAYING`: 4s card reveal
5. `RESULT`: 5s
6. `SETTLED`: immediate

## 5) Required Real-Time Events
1. `round:created`
2. `round:locked`
3. `teen-patti:cards_revealed`
4. `round:result`
5. `round:settled`
6. `wallet:updated`
7. `round:state`

## 6) Failure and Edge Cases
1. Tie with identical score must settle `tie` only in main market.
2. Side markets settle independent of main winner.
3. Reconnect during card reveal resumes correct reveal index.
4. Settlement rerun should not produce duplicate credits.

## 7) Executable Development Plan

### Backend
1. Build deterministic deck shuffle per round seed.
2. Harden hand evaluator with full ranking tie-break tests.
3. Persist reveal sequence and final rank metadata.
4. Implement settlement map for mixed main + side tickets.

### Mobile
1. Build A/B table layout with staged card reveal animation.
2. Build market board with main and side markets.
3. Render hand names and winner highlight.
4. Implement reconnect snapshot replay.

### Admin
1. Live monitor with hand rank distribution and win ratios.
2. Config controls for limits, timers, and market toggles.
3. Analytics for side-bet hit rates and house PnL by market.

### QA
1. Unit tests for ranking engine and tie-breaker logic.
2. Golden test vectors for known card combinations.
3. E2E tests for:
   - Player A win.
   - Player B win.
   - Tie case.
   - Side bet outcomes.
4. Soak tests for round scheduler continuity.

## 8) Acceptance Criteria
1. Hand evaluator output matches golden vectors 100 percent.
2. Main and side market settlement is consistent for all outcomes.
3. Reveal and reconnect behavior is deterministic in staging.
