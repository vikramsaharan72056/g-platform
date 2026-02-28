# Aviator: Ideal Player Flow and Executable Plan

## 1) Ideal Gameplay (Player View)

### Entry and Setup
1. User opens Aviator from lobby.
2. User sees:
   - Current round state and countdown.
   - Wallet balance.
   - Last 20 crash points.
   - Two optional bet slots (`Bet A`, `Bet B`).
3. User sets:
   - Stake per bet slot.
   - Manual cashout or auto-cashout target.

### Betting Phase (`BETTING`)
1. Timer is visible (default 12s).
2. User can place one or two bets before lock.
3. User can cancel/edit a pending bet until lock.
4. Server confirms each placed bet with `betId`.

### Lock Phase (`LOCKED`)
1. New bets and edits blocked.
2. UI shows locked chips and "Prepare for takeoff".

### Flight Phase (`PLAYING`)
1. Multiplier starts at `1.00x` and grows continuously.
2. Manual bet: user taps cashout any time before crash.
3. Auto bet: cashout triggers automatically at target multiplier.
4. Each successful cashout immediately locks payout for that bet.

### Crash and Result (`RESULT`)
1. Plane crashes at server crash point.
2. Any unresolved bets become losses.
3. UI shows:
   - Crash multiplier.
   - User cashout multipliers.
   - Win/loss per bet slot.

### Settlement (`SETTLED`)
1. Wallet credits apply to won cashouts.
2. Round summary is archived in history.
3. Next round countdown starts.

## 2) Betting Contract (Ideal)

### Bet Types
1. `manual`
2. `auto_cashout`

### Bet Payload
```json
{
  "roundId": "uuid",
  "betType": "manual",
  "amount": 200,
  "betData": {
    "slot": "A",
    "autoCashoutAt": null
  }
}
```

`autoCashoutAt` is required when `betType = auto_cashout`.

### Cashout Payload (WebSocket)
```json
{
  "gameId": "uuid",
  "roundId": "uuid",
  "betId": "uuid",
  "userId": "uuid"
}
```

## 3) Round Lifecycle (Ideal Timings)
1. `WAITING`: 3s
2. `BETTING`: 12s
3. `LOCKED`: 2s
4. `PLAYING`: dynamic until crash
5. `RESULT`: 4s
6. `SETTLED`: immediate transition to next `WAITING`

## 4) Required Real-Time Events
1. `round:created`
2. `round:locked`
3. `aviator:takeoff`
4. `aviator:multiplier`
5. `aviator:cashout` (broadcast)
6. `aviator:crash`
7. `round:settled`
8. `wallet:updated`
9. `round:state` (reconnect snapshot)

## 5) Failure and Edge Cases
1. Late cashout request after crash: reject deterministically.
2. Duplicate cashout request on same `betId`: return prior success (idempotent).
3. Disconnect during flight: restore active bets and latest multiplier on reconnect.
4. Server restart mid-round: recover from persisted round state in Redis/DB.
5. Negative/overflow multiplier or payout: block and alert.

## 6) Executable Development Plan

### Backend
1. Implement commit-reveal fairness chain:
   - Publish `hash` pre-round.
   - Reveal `seed` post-crash.
2. Move active round and bet cashout state to Redis.
3. Enforce idempotent cashout by unique key (`roundId + betId`).
4. Add settlement reconciler job for crash recovery.
5. Add round metrics: crash distribution, avg multiplier, payout ratio.

### Mobile
1. Build dual-slot bet panel with quick chips.
2. Build high-frequency multiplier renderer (target 60 FPS UI, throttled network updates).
3. Implement cashout interaction with optimistic UI + server confirmation.
4. Implement reconnect snapshot restore.
5. Build round history strip with recent crash points.

### Admin
1. Live monitor: current multiplier, active bets, cashout count, crash point.
2. Config controls: min/max bet, betting window, max crash cap, maintenance mode.
3. Analytics: multiplier distribution, RTP trend, abnormal payout spikes.

### QA
1. Unit tests:
   - Crash point generation bounds.
   - Payout precision and rounding.
2. Contract tests:
   - Bet placement and cashout flows.
3. E2E:
   - Manual cashout win/loss.
   - Auto cashout behavior.
   - Reconnect during flight.
4. Load tests:
   - 5k concurrent listeners.
   - Burst cashout window.

## 7) Acceptance Criteria
1. No double-credit across repeated cashout requests.
2. Wallet delta equals exact sum of settled bets for every round.
3. Reconnect restores correct open bets and round status in under 2 seconds.
4. 24-hour staging soak with no stuck round.
