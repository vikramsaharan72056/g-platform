# 🎮 ABCRummy — Game Specifications

## Overview

All 7 games operate on a **time-period (round) based** model. Each game shares a common round lifecycle but has unique game mechanics, bet types, and payout structures.

---

## Common Round Lifecycle

Every game follows this state machine:

```
    ┌──────────┐      Timer      ┌──────────┐      Timer      ┌──────────┐
    │ WAITING  │ ──────────────▶ │ BETTING  │ ──────────────▶ │  LOCKED  │
    │          │                 │          │                 │          │
    └──────────┘                 └──────────┘                 └────┬─────┘
                                                                   │
                                                                   ▼
    ┌──────────┐    Auto        ┌──────────┐      Timer      ┌──────────┐
    │ SETTLED  │ ◀──────────── │  RESULT  │ ◀────────────── │ PLAYING  │
    │          │                │          │                 │          │
    └────┬─────┘                └──────────┘                 └──────────┘
         │
         │ Immediately triggers next round
         ▼
    ┌──────────┐
    │ WAITING  │  (New Round)
    └──────────┘
```

### Lifecycle Phases

| Phase     | Duration      | Description                                                       |
| --------- | ------------- | ----------------------------------------------------------------- |
| WAITING   | 3-5 sec       | Cooldown between rounds, displays previous result                 |
| BETTING   | Configurable  | Users can place/modify bets, countdown timer shown                |
| LOCKED    | 1-2 sec       | Bets finalized, no new bets accepted                              |
| PLAYING   | Configurable  | Game animation plays, result is being generated/revealed          |
| RESULT    | 3-5 sec       | Result displayed, win/loss shown to each user                     |
| SETTLED   | Instant       | Payouts credited to wallets, round archived                       |

---

## Game 1: Teen Patti 🃏

### Description
Indian card game (3-card poker variant). Players bet on which hand wins. In the time-based model, the system deals two hands (Player A vs Player B) and users bet on which hand will win.

### Round Configuration
| Parameter        | Value              |
| ---------------- | ------------------ |
| Round Duration   | 60-90 seconds      |
| Betting Window   | 30 seconds         |
| Min Bet          | ₹10                |
| Max Bet          | ₹10,000            |
| Players Per Room | Unlimited (betting) |

### Bet Types & Payouts

| Bet Type       | Description                              | Payout  |
| -------------- | ---------------------------------------- | ------- |
| Player A       | Player A's hand wins                     | 1.95x   |
| Player B       | Player B's hand wins                     | 1.95x   |
| Tie            | Both hands are equal                     | 25x     |
| Player A Pair+ | Player A has Pair or better              | 3.5x    |
| Player B Pair+ | Player B has Pair or better              | 3.5x    |
| Any Trail      | Either hand has three of a kind          | 50x     |

### Hand Rankings (Highest to Lowest)
1. **Trail / Set** — Three of a kind (e.g., A-A-A)
2. **Pure Sequence** — Consecutive same suit (e.g., 4♥-5♥-6♥)
3. **Sequence / Run** — Consecutive different suits (e.g., 7♠-8♥-9♦)
4. **Color / Flush** — Same suit, non-consecutive (e.g., 2♣-7♣-J♣)
5. **Pair** — Two of a kind (e.g., K-K-3)
6. **High Card** — Highest single card wins

### Game Logic Flow
```
1. BETTING phase starts — show empty table with Player A / Player B positions
2. Users place bets on their chosen outcome
3. LOCKED — Bets finalized
4. PLAYING — Cards dealt one by one with animation:
   - Player A: Card 1, Card 2, Card 3
   - Player B: Card 1, Card 2, Card 3
5. RESULT — Hands compared, winner highlighted
6. SETTLED — Payouts distributed
```

### Admin Controls
- **Force Winner:** Set Player A or Player B as winner for next round
- **Force Hand:** Specify exact cards for either player
- **Win Rate:** Set target win percentage for Player A vs Player B
- **Disable Bet Type:** Temporarily disable specific bet types

### Result Data Structure
```json
{
  "playerA": {
    "cards": ["AH", "KH", "QH"],
    "handRank": "PURE_SEQUENCE",
    "handName": "Pure Sequence (A-K-Q Hearts)"
  },
  "playerB": {
    "cards": ["7S", "7D", "3C"],
    "handRank": "PAIR",
    "handName": "Pair of 7s"
  },
  "winner": "PLAYER_A",
  "winningHand": "PURE_SEQUENCE"
}
```

---

## Game 2: Aviator ✈️

### Description
A crash-style game where a multiplier increases from 1.00x and can "crash" at any random point. Players must cash out before the crash to win. In time-based mode, all players bet during the betting window, and the plane flies with an increasing multiplier. Players tap "Cash Out" during the flight to lock in their multiplier.

### Round Configuration
| Parameter        | Value              |
| ---------------- | ------------------ |
| Round Duration   | 15-60 seconds      |
| Betting Window   | 10 seconds         |
| Min Bet          | ₹10                |
| Max Bet          | ₹5,000             |
| Players Per Room | Unlimited          |

### Game Mechanics

#### Multiplier Curve
```
Multiplier = 1.00x → increases exponentially → crashes at random point

Example crash points: 1.24x, 2.45x, 5.67x, 1.01x, 15.32x, 100.00x (rare)
```

#### Crash Point Generation (Provably Fair)
```
1. Server generates a random seed before the round
2. Hash of seed is published before round starts
3. Crash point = max(1, floor(100 / (100 - random(0,100)))) 
   with house edge applied
4. After round, seed is revealed — players can verify
```

### Bet Types & Payouts

| Bet Type     | Description                                     | Payout           |
| ------------ | ----------------------------------------------- | ---------------- |
| Manual       | Player manually clicks "Cash Out" during flight | Multiplier at cash-out |
| Auto Cashout | Set target multiplier — auto cashout at that value | Target multiplier |

### Game Logic Flow
```
1. BETTING — Users place bets (can set auto-cashout multiplier)
2. LOCKED — Bets finalized
3. PLAYING — Airplane takes off:
   - Multiplier starts at 1.00x
   - Multiplier increases in real-time (WebSocket broadcast every 100ms)
   - Players can tap "Cash Out" at any time
   - If crash point reached → airplane crashes → animation plays
4. RESULT — Show crash point, list of winners/losers
5. SETTLED — Pay winners based on their cashout multiplier
```

### Real-Time Data (WebSocket Events)
```
Server → Client (every 100ms during PLAYING):
{
  "event": "aviator:multiplier",
  "data": {
    "multiplier": 2.34,
    "elapsed": 5200  // ms since round start
  }
}

Server → Client (on crash):
{
  "event": "aviator:crash",
  "data": {
    "crashPoint": 2.45,
    "roundId": "xxx"
  }
}

Client → Server (on cashout):
{
  "event": "aviator:cashout",
  "data": {
    "betId": "xxx"
  }
}
```

### Admin Controls
- **Force Crash Point:** Set exact crash point for next round
- **Max Crash Point:** Cap the maximum multiplier
- **Crash Probability:** Adjust probability distribution (e.g., make low crashes more frequent)
- **Target House Edge:** Set percentage the house keeps over time

### Result Data Structure
```json
{
  "crashPoint": 2.45,
  "duration": 8500,
  "seed": "abc123...",
  "hash": "sha256...",
  "totalBets": 150,
  "totalBetAmount": 25000,
  "totalPayout": 18000,
  "cashouts": [
    { "userId": "xxx", "multiplier": 1.50, "amount": 100, "payout": 150 },
    { "userId": "yyy", "multiplier": 2.30, "amount": 200, "payout": 460 }
  ]
}
```

---

## Game 3: 7 Up Down 🎲

### Description
Simple dice game. Two dice are rolled, and the total determines the outcome — 7 (Seven), below 7 (Down/Under), or above 7 (Up/Over).

### Round Configuration
| Parameter        | Value              |
| ---------------- | ------------------ |
| Round Duration   | 30-45 seconds      |
| Betting Window   | 20 seconds         |
| Min Bet          | ₹10                |
| Max Bet          | ₹10,000            |
| Players Per Room | Unlimited          |

### Bet Types & Payouts

| Bet Type   | Condition     | Probability | Payout |
| ---------- | ------------- | ----------- | ------ |
| Down (Under 7) | Total 2-6  | 41.67%      | 2.00x  |
| Seven (Lucky 7)| Total = 7  | 16.67%      | 5.00x  |
| Up (Over 7)    | Total 8-12 | 41.67%      | 2.00x  |

### Dice Probabilities Reference

| Total | Combinations | Probability |
| ----- | ------------ | ----------- |
| 2     | 1            | 2.78%       |
| 3     | 2            | 5.56%       |
| 4     | 3            | 8.33%       |
| 5     | 4            | 11.11%      |
| 6     | 5            | 13.89%      |
| 7     | 6            | 16.67%      |
| 8     | 5            | 13.89%      |
| 9     | 4            | 11.11%      |
| 10    | 3            | 8.33%       |
| 11    | 2            | 5.56%       |
| 12    | 1            | 2.78%       |

### Game Logic Flow
```
1. BETTING — Show two dice with "?" — users bet on Up, Down, or 7
2. LOCKED — Bets finalized
3. PLAYING — Dice roll animation (2-3 seconds)
   - Dice 1 lands first, suspense
   - Dice 2 lands, total revealed
4. RESULT — Show outcome (Up/Down/7), highlight winning bets
5. SETTLED — Payouts distributed
```

### Admin Controls
- **Force Outcome:** Set exact dice values (e.g., dice1=3, dice2=4 → 7)
- **Bias Setting:** Adjust probability weights (e.g., reduce "7" frequency)
- **Streak Prevention:** Auto-adjust to prevent long winning streaks

### Result Data Structure
```json
{
  "dice1": 4,
  "dice2": 3,
  "total": 7,
  "outcome": "SEVEN",
  "rollAnimation": {
    "dice1Frames": [2, 5, 1, 6, 4],
    "dice2Frames": [6, 3, 2, 5, 3]
  }
}
```

---

## Game 4: Dragon and Tiger 🐉🐯

### Description
One of the simplest card games. One card is dealt for Dragon, one for Tiger. The higher card wins. Based purely on luck with minimal decision-making.

### Round Configuration
| Parameter        | Value              |
| ---------------- | ------------------ |
| Round Duration   | 25-30 seconds      |
| Betting Window   | 15 seconds         |
| Min Bet          | ₹10                |
| Max Bet          | ₹10,000            |
| Players Per Room | Unlimited          |

### Card Values
```
A(1) < 2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J(11) < Q(12) < K(13)
```
- **Tie:** When both cards have the same value (suit doesn't matter)

### Bet Types & Payouts

| Bet Type       | Description                    | Payout  |
| -------------- | ------------------------------ | ------- |
| Dragon         | Dragon card is higher          | 1.95x   |
| Tiger          | Tiger card is higher           | 1.95x   |
| Tie            | Both cards same value          | 11x     |
| Dragon Odd     | Dragon card is odd             | 1.90x   |
| Dragon Even    | Dragon card is even            | 1.90x   |
| Tiger Odd      | Tiger card is odd              | 1.90x   |
| Tiger Even     | Tiger card is even             | 1.90x   |
| Dragon Red     | Dragon card is Hearts/Diamonds | 1.90x   |
| Dragon Black   | Dragon card is Spades/Clubs    | 1.90x   |
| Tiger Red      | Tiger card is Hearts/Diamonds  | 1.90x   |
| Tiger Black    | Tiger card is Spades/Clubs     | 1.90x   |

### Game Logic Flow
```
1. BETTING — Show Dragon and Tiger positions with facedown cards
2. LOCKED — Bets finalized
3. PLAYING — Card reveal animation:
   - Dragon card flips over (1.5 sec)
   - Suspense pause (0.5 sec)
   - Tiger card flips over (1.5 sec)
4. RESULT — Winner highlighted with animation, side bets resolved
5. SETTLED — Payouts distributed
```

### Admin Controls
- **Force Winner:** Set Dragon or Tiger as next winner
- **Force Cards:** Specify exact cards for Dragon and Tiger
- **Tie Frequency:** Adjust how often ties occur
- **Card Distribution:** Control card value distribution

### Result Data Structure
```json
{
  "dragonCard": {
    "value": "K",
    "suit": "HEARTS",
    "numericValue": 13
  },
  "tigerCard": {
    "value": "5",
    "suit": "SPADES",
    "numericValue": 5
  },
  "winner": "DRAGON",
  "isDragonOdd": true,
  "isDragonRed": true,
  "isTigerOdd": true,
  "isTigerRed": false
}
```

---

## Game 5: Poker (Texas Hold'em — Simplified) ♠️

### Description
Simplified Texas Hold'em Poker adapted for time-based rounds. The system deals community cards and two hole cards each to Player A and Player B. Users bet on which player will win based on the best 5-card hand.

### Round Configuration
| Parameter        | Value              |
| ---------------- | ------------------ |
| Round Duration   | 60-120 seconds     |
| Betting Window   | 25 seconds         |
| Min Bet          | ₹20                |
| Max Bet          | ₹25,000            |
| Players Per Room | Unlimited (betting) |

### Hand Rankings (Highest to Lowest)
1. **Royal Flush** — A-K-Q-J-10 same suit
2. **Straight Flush** — Five consecutive same suit
3. **Four of a Kind** — Four cards same value
4. **Full House** — Three of a kind + pair
5. **Flush** — Five cards same suit
6. **Straight** — Five consecutive cards
7. **Three of a Kind** — Three cards same value
8. **Two Pair** — Two different pairs
9. **One Pair** — Two cards same value
10. **High Card** — Highest card wins

### Bet Types & Payouts

| Bet Type             | Description                           | Payout  |
| -------------------- | ------------------------------------- | ------- |
| Player A Wins        | Player A has better final hand        | 1.95x   |
| Player B Wins        | Player B has better final hand        | 1.95x   |
| Tie                  | Both players have equal hands         | 20x     |
| Any Flush+           | Either player has Flush or better     | 4x      |
| Any Full House+      | Either player has Full House or better| 8x      |
| Any Four of a Kind+  | Either player has Quads or better     | 30x     |
| Royal Flush          | Any player hits Royal Flush           | 500x    |

### Game Logic Flow (Multi-Phase Reveal)
```
1. BETTING (Phase 1 — Pre-Flop):
   - Deal 2 hole cards to Player A (shown face down)
   - Deal 2 hole cards to Player B (shown face down)
   - Users place initial bets

2. LOCKED — Bets finalized

3. PLAYING (Phase 2 — Flop):
   - Reveal Player A's hole cards
   - Reveal Player B's hole cards
   - Deal 3 community cards (The Flop)
   - Pause for 5 seconds

4. PLAYING (Phase 3 — Turn):
   - Deal 4th community card (The Turn)
   - Pause for 3 seconds

5. PLAYING (Phase 4 — River):
   - Deal 5th community card (The River)
   - Pause for 3 seconds

6. RESULT — Best 5-card hands determined, winner announced
7. SETTLED — Payouts distributed
```

### Admin Controls
- **Force Winner:** Set Player A or Player B
- **Force Community Cards:** Specify flop, turn, river
- **Force Hole Cards:** Specify cards for either player
- **Hand Frequency:** Control how often premium hands appear

### Result Data Structure
```json
{
  "playerA": {
    "holeCards": ["AH", "KH"],
    "bestHand": ["AH", "KH", "QH", "JH", "10H"],
    "handRank": "ROYAL_FLUSH",
    "handName": "Royal Flush (Hearts)"
  },
  "playerB": {
    "holeCards": ["9S", "9D"],
    "bestHand": ["9S", "9D", "9C", "QH", "JH"],
    "handRank": "THREE_OF_A_KIND",
    "handName": "Three of a Kind (9s)"
  },
  "communityCards": ["QH", "JH", "10H", "9C", "3D"],
  "winner": "PLAYER_A",
  "winningHand": "ROYAL_FLUSH"
}
```

---

## Game 6: TBD 🔲

> **Status:** Pending — Slot reserved for future game  
> **Suggestions:** Roulette, Andar Bahar, Color Prediction, Lucky Wheel, Cricket Betting

### Requirements When Defined
- Must follow the same round lifecycle
- Must integrate with existing bet/wallet/admin systems
- Must support admin game controls

---

## Game 7: TBD 🔲

> **Status:** Pending — Slot reserved for future game  
> **Suggestions:** Mines, Plinko, Blackjack, Ludo, Hi-Lo

### Requirements When Defined
- Must follow the same round lifecycle
- Must integrate with existing bet/wallet/admin systems
- Must support admin game controls

---

## Common Game Engine Interface

All games implement this common interface:

```typescript
interface IGameEngine {
  // Lifecycle
  startRound(gameId: string): Promise<GameRound>;
  openBetting(roundId: string): Promise<void>;
  lockBetting(roundId: string): Promise<void>;
  play(roundId: string): Promise<void>;
  generateResult(roundId: string, adminOverride?: any): Promise<RoundResult>;
  settleBets(roundId: string): Promise<SettlementSummary>;
  
  // Betting
  placeBet(roundId: string, userId: string, bet: BetInput): Promise<Bet>;
  cancelBet(betId: string): Promise<void>;
  
  // Queries
  getCurrentRound(gameId: string): Promise<GameRound>;
  getRoundHistory(gameId: string, limit: number): Promise<GameRound[]>;
  
  // Admin
  forceResult(roundId: string, result: any): Promise<void>;
  getAnalytics(gameId: string, period: string): Promise<GameAnalytics>;
}

interface BetInput {
  amount: number;
  betType: string;
  betData?: any;  // Game-specific additional data
}

interface SettlementSummary {
  roundId: string;
  totalBets: number;
  totalBetAmount: number;
  totalPayout: number;
  housePnl: number;
  winners: number;
  losers: number;
}

interface GameAnalytics {
  totalRounds: number;
  totalBetVolume: number;
  totalPayout: number;
  housePnl: number;
  averageBetSize: number;
  uniquePlayers: number;
  topWinners: UserSummary[];
  betDistribution: Record<string, number>;
}
```

---

## WebSocket Event Architecture

### Namespace Structure
```
/games              — Global game lobby
/games/teen-patti    — Teen Patti game room
/games/aviator      — Aviator game room
/games/7-up-down    — 7 Up Down game room
/games/dragon-tiger — Dragon & Tiger game room
/games/poker        — Poker game room
```

### Common Events (All Games)

| Direction       | Event                  | Payload                                  |
| --------------- | ---------------------- | ---------------------------------------- |
| Server → Client | `round:new`            | `{ roundId, roundNumber, bettingEndsAt }` |
| Server → Client | `round:betting-open`   | `{ roundId, countdown }`                 |
| Server → Client | `round:locked`         | `{ roundId }`                            |
| Server → Client | `round:playing`        | `{ roundId, gameData }`                  |
| Server → Client | `round:result`         | `{ roundId, result, winners }`           |
| Server → Client | `round:settled`        | `{ roundId, settlement }`                |
| Client → Server | `bet:place`            | `{ roundId, betType, amount, betData }`  |
| Client → Server | `bet:cancel`           | `{ betId }`                              |
| Server → Client | `bet:confirmed`        | `{ betId, status }`                      |
| Server → Client | `bet:result`           | `{ betId, won, payout }`                 |
| Server → Client | `players:count`        | `{ count }`                              |
| Server → Client | `wallet:update`        | `{ balance, change }`                    |

---

> **Next:** See `04-API-SPECIFICATIONS.md` for complete API endpoint documentation.
