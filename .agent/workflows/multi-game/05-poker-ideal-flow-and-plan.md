# Poker (Texas Hold'em Simplified): Ideal Player Flow and Executable Plan

## 1) Ideal Gameplay (Player View)

### Entry
1. User opens Poker from lobby.
2. User sees Player A vs Player B table, timer, and last winning hands.

### Betting Phase (`BETTING`)
1. Single betting window before reveal (default 25s).
2. User bets on:
   - Main winner (`player_a`, `player_b`, `tie`)
   - Side markets (`any_flush_plus`, `full_house_plus`, `four_kind_plus`, `royal_flush`)
3. User can place multiple tickets before lock.

### Lock and Reveal (`LOCKED` -> `PLAYING`)
1. Bets lock.
2. Reveal sequence:
   - Hole cards (A and B)
   - Flop (3 community cards)
   - Turn (1 card)
   - River (1 card)
3. Best 5-card hand for each side is computed.

### Result and Settlement
1. Winner and best hand are shown.
2. Side markets resolve from highest rank between both players.
3. Wallet settles and history updates.

## 2) Betting Contract (Ideal)

### Bet Types and Multipliers
1. Main:
   - `player_a`: `1.95x`
   - `player_b`: `1.95x`
   - `tie`: `20x`
2. Side:
   - `any_flush_plus`: `4x`
   - `full_house_plus`: `8x`
   - `four_kind_plus`: `30x`
   - `royal_flush`: `500x`

### Bet Payload
```json
{
  "roundId": "uuid",
  "betType": "full_house_plus",
  "amount": 250
}
```

## 3) Hand Ranking (Highest to Lowest)
1. `ROYAL_FLUSH`
2. `STRAIGHT_FLUSH`
3. `FOUR_OF_A_KIND`
4. `FULL_HOUSE`
5. `FLUSH`
6. `STRAIGHT`
7. `THREE_OF_A_KIND`
8. `TWO_PAIR`
9. `ONE_PAIR`
10. `HIGH_CARD`

## 4) Round Lifecycle (Ideal Timings)
1. `WAITING`: 3s
2. `BETTING`: 25s
3. `LOCKED`: 2s
4. `PLAYING`: 11s phased reveal
5. `RESULT`: 5s
6. `SETTLED`: immediate

## 5) Required Real-Time Events
1. `round:created`
2. `round:locked`
3. `poker:hole_cards`
4. `poker:flop`
5. `poker:turn`
6. `poker:river`
7. `round:result`
8. `round:settled`
9. `wallet:updated`
10. `round:state`

## 6) Failure and Edge Cases
1. Tie-breaker correctness for equal hand classes.
2. Reconnect during phased reveal must resume correct phase.
3. Side market settlement must reference highest hand across both players.
4. Long reveal delays should auto-timeout to deterministic completion.

## 7) Executable Development Plan

### Backend
1. Implement deterministic shuffle and 7-card evaluator test suite.
2. Build phased reveal state persistence in round metadata.
3. Validate settlement map for all main and side markets.
4. Add telemetry for hand rank frequency and payout volatility.

### Mobile
1. Build board UI with phased reveal timeline.
2. Build market board for main and side markets.
3. Render best-hand breakdown and winner explanation.
4. Implement reconnect and phase replay.

### Admin
1. Live monitor for reveal phase, community cards, and market exposure.
2. Config controls for timer and bet limits.
3. Analytics for hand-rank distribution and side-bet profitability.

### QA
1. Unit tests for evaluator against known poker vectors.
2. Fuzz tests for evaluator consistency.
3. E2E tests for:
   - Player A win.
   - Player B win.
   - Tie.
   - Side market triggers.
4. Load tests with high socket fanout during phased reveal events.

## 8) Acceptance Criteria
1. Evaluator and tie-break rules match golden test vectors.
2. Phase events are ordered and replay-safe under reconnect.
3. Main and side settlement is correct for all tested outcomes.
