# ⚠️ ABCRummy — Critical Addendum: Missing Systems & Edge Cases

## Why This Document Exists

The core docs (01-06) cover the **happy path**. This document covers everything else — the systems, edge cases, and operational realities that separate a production gaming platform from a prototype. 

Every section below is something that **will** cause problems if not planned from Day 1.

---

## Table of Contents

1. [House Bankroll & Exposure Management](#1-house-bankroll--exposure-management)
2. [Turnover / Wagering Requirements](#2-turnover--wagering-requirements)
3. [Bonus & Promotion Engine](#3-bonus--promotion-engine)
4. [Referral & Affiliate System](#4-referral--affiliate-system)
5. [VIP / Loyalty Tier System](#5-vip--loyalty-tier-system)
6. [Anti-Fraud & Risk Engine](#6-anti-fraud--risk-engine)
7. [Responsible Gaming](#7-responsible-gaming)
8. [Connection Recovery & Game State Sync](#8-connection-recovery--game-state-sync)
9. [Server-Client Time Synchronization](#9-server-client-time-synchronization)
10. [Multi-Device & Session Management](#10-multi-device--session-management)
11. [Commission / Rake Model](#11-commission--rake-model)
12. [Banner, Popup & Engagement System](#12-banner-popup--engagement-system)
13. [Customer Support System](#13-customer-support-system)
14. [App Lifecycle Management](#14-app-lifecycle-management)
15. [Concurrency, Idempotency & Failure Recovery](#15-concurrency-idempotency--failure-recovery)
16. [Legal & Compliance](#16-legal--compliance)
17. [Database Schema Additions](#17-database-schema-additions)
18. [Updated Execution Plan Impact](#18-updated-execution-plan-impact)

---

## 1. House Bankroll & Exposure Management

### The Problem
If 500 users all bet ₹10,000 on "Player A" in Teen Patti and Player A wins, the platform owes ₹97,50,000 (₹500 × ₹10,000 × 1.95x). Without tracking this, the house can go bankrupt in a single round.

### What's Needed

#### A. House Wallet
```
┌──────────────────────────────────────────────────────┐
│  HOUSE WALLET                                        │
│                                                      │
│  Starting Bankroll:     ₹50,00,000                   │
│  Current Balance:       ₹48,50,000                   │
│  Today's P&L:           +₹1,20,000                   │
│  Active Exposure:       ₹3,45,000  ⚠️                │
│  Reserve (Locked):      ₹10,00,000                   │
│  Available for Payout:  ₹38,50,000                   │
│                                                      │
│  Auto-Actions:                                       │
│  • If exposure > 70% of balance → Alert admin        │
│  • If exposure > 90% of balance → Auto-limit bets    │
│  • If balance < reserve → Pause all games            │
└──────────────────────────────────────────────────────┘
```

#### B. Per-Round Exposure Calculation
```typescript
interface RoundExposure {
  roundId: string;
  gameSlug: string;
  
  // For each possible outcome, calculate max loss
  outcomes: {
    outcome: string;           // "PLAYER_A", "PLAYER_B", "TIE"
    totalBetOnOutcome: number; // Total money bet on this outcome
    maxPayout: number;         // totalBet × odds
    netExposure: number;       // maxPayout - betsOnOtherOutcomes
  }[];
  
  worstCaseExposure: number;   // Max the house can lose this round
  bestCaseProfit: number;      // Max the house can win this round
}
```

#### C. Dynamic Bet Limiting
When exposure on one side gets too high:
- **Soft limit:** Reduce max bet for the heavily-bet side
- **Hard limit:** Stop accepting bets on that side
- **Odds adjustment:** Slightly reduce payout odds for the popular side
- **Admin alert:** Notify admin in real-time

#### D. Admin House Wallet Controls
- View real-time house balance
- Set minimum reserve (games auto-pause if breached)
- View exposure per active round
- Manual house wallet top-up
- Daily/weekly P&L reports with breakdown by game

---

## 2. Turnover / Wagering Requirements

### The Problem
Without turnover requirements, users will:
1. Deposit ₹10,000
2. Place one small bet of ₹100
3. Withdraw ₹9,900 immediately

This creates massive payment processing costs with zero house revenue.

### Implementation

```
┌──────────────────────────────────────────────────────┐
│  TURNOVER RULES                                      │
│                                                      │
│  Before withdrawal is allowed, user must have:       │
│                                                      │
│  Total Bet Amount ≥ Deposit Amount × Turnover Factor │
│                                                      │
│  Example:                                            │
│  • User deposits ₹10,000                             │
│  • Turnover factor: 1x (configurable by admin)       │
│  • User must place bets totaling ₹10,000             │
│  • Only then can they request withdrawal              │
│                                                      │
│  Bonus Balance Turnover:                             │
│  • Bonus money has separate, higher turnover (3-5x)  │
│  • Bonus of ₹500 requires ₹2,500 in total bets      │
│  • Bonus cannot be withdrawn, only winnings from it   │
└──────────────────────────────────────────────────────┘
```

#### Wallet Split Logic
```
User's Wallet:
├── Main Balance:  ₹5,000  (withdrawable after turnover)
├── Bonus Balance: ₹500    (non-withdrawable, playable only)
└── Locked Balance: ₹0     (in active bets)

Bet Deduction Priority:
1. Bonus Balance first (burns bonus first)
2. Then Main Balance

Winning Credit:
→ Always goes to Main Balance (makes winnings withdrawable)
```

#### Withdrawal Eligibility Check
```typescript
function canWithdraw(userId: string): WithdrawalEligibility {
  const wallet = getWallet(userId);
  const turnoverRequired = wallet.totalDeposited * TURNOVER_FACTOR;
  const turnoverCompleted = wallet.totalBetVolume;
  
  return {
    eligible: turnoverCompleted >= turnoverRequired,
    turnoverRequired,
    turnoverCompleted,
    turnoverRemaining: Math.max(0, turnoverRequired - turnoverCompleted),
    maxWithdrawable: wallet.balance - wallet.bonusBalance
  };
}
```

#### Admin Controls
- Set global turnover factor (1x, 1.5x, 2x, etc.)
- Set bonus turnover factor (3x, 5x, etc.)
- Override for specific users (VIP bypass)
- View turnover progress per user

---

## 3. Bonus & Promotion Engine

### The Problem
Gaming platforms live and die by their bonus/promotion strategy. Without a flexible bonus engine, every promotion requires code changes.

### Bonus Types

| Bonus Type            | Trigger                        | Amount/Logic                         | Turnover |
| --------------------- | ------------------------------ | ------------------------------------ | -------- |
| Welcome Bonus         | First registration             | Flat ₹50-₹100                       | 3x       |
| First Deposit Bonus   | First deposit                  | 100% match up to ₹500               | 5x       |
| Reload Bonus          | Subsequent deposits            | 20-50% match up to ₹200             | 3x       |
| Referral Bonus        | Friend signs up + deposits     | ₹100 to referrer                     | 2x       |
| Daily Login Bonus     | Login streak                   | Day 1: ₹5, Day 7: ₹50              | 1x       |
| Cashback              | Weekly losses                  | 5-10% of net losses                  | 1x       |
| Special Event         | Admin-created                  | Custom amount/rules                  | Custom   |
| Loss Recovery         | After losing streak (5+ rounds)| Small credit (₹10-₹50)              | 2x       |

### Daily Login Reward System
```
Day 1: ₹5    Day 2: ₹5    Day 3: ₹10   Day 4: ₹10
Day 5: ₹15   Day 6: ₹20   Day 7: ₹50 🎉
(Streak resets if a day is missed)
(Calendar UI with animated reward collection)
```

### Cashback System
```
Every Monday at 00:00:
  For each active user:
    netLoss = totalBet(last 7 days) - totalWon(last 7 days)
    if netLoss > 0:
      cashback = netLoss × cashbackPercentage (5-10%)
      cashback = min(cashback, maxCashbackLimit)
      credit to bonusBalance with turnover requirement
      send notification
```

### Database Model
```prisma
model Bonus {
  id              String      @id @default(uuid())
  
  name            String      // "Welcome Bonus", "Weekly Cashback"
  type            BonusType
  
  // Trigger
  triggerEvent    String      // "registration", "first_deposit", "daily_login", etc.
  
  // Value
  valueType       String      // "FLAT", "PERCENTAGE"
  value           Decimal     @db.Decimal(12, 2)  // Amount or percentage
  maxValue        Decimal?    @db.Decimal(12, 2)  // Cap for percentage bonuses
  minDepositRequired Decimal? @db.Decimal(12, 2)  // Minimum deposit to qualify
  
  // Restrictions
  turnoverFactor  Decimal     @default(3) @db.Decimal(4, 2)
  expiresInDays   Int         @default(30)         // Auto-expire unused bonus
  maxClaimsPerUser Int        @default(1)
  
  // Availability
  isActive        Boolean     @default(true)
  startDate       DateTime?
  endDate         DateTime?
  totalBudget     Decimal?    @db.Decimal(14, 2)
  usedBudget      Decimal     @default(0) @db.Decimal(14, 2)
  
  claims          BonusClaim[]
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@map("bonuses")
}

model BonusClaim {
  id              String      @id @default(uuid())
  userId          String
  bonusId         String
  bonus           Bonus       @relation(fields: [bonusId], references: [id])
  
  amount          Decimal     @db.Decimal(12, 2)
  turnoverRequired Decimal    @db.Decimal(14, 2)
  turnoverCompleted Decimal   @default(0) @db.Decimal(14, 2)
  
  status          String      // "ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"
  expiresAt       DateTime
  
  createdAt       DateTime    @default(now())
  
  @@index([userId])
  @@map("bonus_claims")
}

enum BonusType {
  WELCOME
  FIRST_DEPOSIT
  RELOAD_DEPOSIT
  REFERRAL
  DAILY_LOGIN
  CASHBACK
  SPECIAL_EVENT
  LOSS_RECOVERY
}
```

---

## 4. Referral & Affiliate System

### The Problem
Organic user acquisition for gaming apps is nearly impossible. A referral/affiliate system is the primary growth engine.

### How It Works

```
┌──────────────────────────────────────────────────────┐
│  REFERRAL FLOW                                       │
│                                                      │
│  1. User A shares referral code/link                 │
│  2. User B signs up using referral code              │
│  3. User B makes first deposit (min ₹100)            │
│  4. User A gets ₹100 bonus (credited to bonus wallet)│
│  5. User B gets ₹50 welcome bonus                    │
│                                                      │
│  OPTIONAL — Lifetime Commission:                     │
│  • User A earns 1-2% of User B's total bet volume   │
│  • Paid weekly to User A's main wallet               │
│  • Creates a self-sustaining referral network        │
└──────────────────────────────────────────────────────┘
```

### Multi-Level Referral (Optional, Admin-Configurable)
```
Level 1: Direct referral → 2% commission
Level 2: Referral's referral → 0.5% commission
(Max 2 levels to keep it simple)
```

### Database Model
```prisma
model Referral {
  id              String    @id @default(uuid())
  
  referrerId      String    // User who referred
  refereeId       String    @unique  // User who was referred
  referralCode    String    // Code used
  
  // Tracking
  refereeDeposited Boolean  @default(false)
  referrerPaid     Boolean  @default(false)
  refereePaid      Boolean  @default(false)
  
  // Commission
  lifetimeCommission Decimal @default(0) @db.Decimal(14, 2)
  lastCommissionAt   DateTime?
  
  createdAt       DateTime  @default(now())
  
  @@index([referrerId])
  @@map("referrals")
}

// Add to User model:
// referralCode    String    @unique @default(cuid())  // User's own referral code
// referredBy      String?   // Referral code used during signup
```

### Admin Analytics
- Total referrals (successful vs pending)
- Top referrers leaderboard
- Commission payouts over time
- Referral-to-deposit conversion rate
- Revenue generated from referred users

---

## 5. VIP / Loyalty Tier System

### The Problem
High-value players (whales) need to feel special or they'll leave for competitors. A tier system increases retention and lifetime value.

### Tier Structure

| Tier       | Required Monthly Volume | Benefits                                     |
| ---------- | ----------------------- | -------------------------------------------- |
| 🥉 Bronze  | ₹0 - ₹10,000          | Base payouts, standard support               |
| 🥈 Silver  | ₹10,001 - ₹50,000     | 2% cashback, priority withdrawals (< 12 hrs) |
| 🥇 Gold    | ₹50,001 - ₹2,00,000   | 5% cashback, priority support, higher limits  |
| 💎 Diamond | ₹2,00,001+             | 10% cashback, VIP manager, instant withdrawal |

### Tier Mechanics
- **Calculated monthly** based on total bet volume
- **Grace period:** 1 month (if user drops below threshold, they keep tier for 1 extra month)
- **Tier-down notification:** "Your Gold status expires in 7 days. Bet ₹20,000 more to retain it."
- **Exclusive games:** Admin can restrict certain tables/limits to Gold+ users

### Implementation
```prisma
model UserVipTier {
  id              String    @id @default(uuid())
  userId          String    @unique
  
  currentTier     VipTier   @default(BRONZE)
  monthlyVolume   Decimal   @default(0) @db.Decimal(14, 2)
  lifetimeVolume  Decimal   @default(0) @db.Decimal(14, 2)
  
  tierExpiresAt   DateTime?
  lastTierUpdate  DateTime?
  
  cashbackRate    Decimal   @default(0) @db.Decimal(4, 2)
  maxWithdrawalPerDay Decimal @db.Decimal(12, 2)
  withdrawalPriority Int    @default(0) // Higher = processed first
  
  @@map("user_vip_tiers")
}

enum VipTier {
  BRONZE
  SILVER
  GOLD
  DIAMOND
}
```

---

## 6. Anti-Fraud & Risk Engine

### The Problem
Gaming platforms are prime targets for fraud: multi-accounting, collusion, bonus abuse, payment fraud, and money laundering.

### Fraud Detection Systems

#### A. Multi-Account Detection
```
Signals checked on registration & login:
├── Device fingerprint (hardware ID, screen size, installed fonts)
├── IP address (flag if shared IP has multiple accounts)
├── Phone number (one-to-one with account)
├── Email domain (flag disposable emails: tempmail, guerrilla, etc.)
├── GPS location (if permitted)
└── Behavioral patterns (bet timing, amount patterns)

Action Matrix:
├── Same device, different account → BLOCK registration
├── Same IP, 3+ accounts → FLAG for review
├── Disposable email → BLOCK registration
└── Same phone → BLOCK registration
```

#### B. Collusion Detection (For multiplayer games)
```
In Teen Patti / Poker (if multiplayer mode added):
├── Two players always in same room → FLAG
├── One player consistently folds to another → FLAG
├── Win rate between two specific players is abnormal → FLAG
└── Same IP/device players in same game → BLOCK
```

#### C. Bonus Abuse Detection
```
├── Multiple accounts claiming welcome bonus → BLOCK
├── Depositing and withdrawing without playing → FLAG (turnover check)
├── Only playing minimum bets to meet turnover → FLAG
├── Creating accounts just for referral bonus → FLAG
└── Pattern: deposit → claim bonus → play lowest-risk bets → withdraw
```

#### D. Money Laundering Patterns
```
├── Large deposits followed by immediate withdrawal → FLAG
├── Round-trip: Deposit ₹1,00,000 → Bet ₹1,000 → Withdraw ₹99,000 → FLAG
├── Multiple small deposits from different sources → FLAG
├── Unusual deposit frequency (10+ deposits per day) → FLAG
└── Deposits and withdrawals to different bank accounts → FLAG
```

#### E. Bot Detection
```
├── Perfectly timed bets (consistent millisecond precision) → FLAG
├── Playing 24/7 without breaks → FLAG
├── No variation in bet amounts → FLAG
├── Inhuman response times on cashout (Aviator) → FLAG
└── No app backgrounding/foregrounding patterns → FLAG
```

### Risk Score System
```typescript
interface UserRiskScore {
  userId: string;
  overallScore: number;        // 0-100 (higher = riskier)
  
  factors: {
    multiAccountRisk: number;   // 0-100
    bonusAbuseRisk: number;     // 0-100
    moneyLaunderingRisk: number; // 0-100
    botRisk: number;            // 0-100
    collusionRisk: number;      // 0-100
  };
  
  flags: string[];              // Active flags
  lastUpdated: Date;
  
  // Auto-actions based on score
  // 0-30:  Normal
  // 30-60: Enhanced monitoring (admin notified)
  // 60-80: Restricted (higher turnover req, lower limits)
  // 80+:   Auto-suspended pending review
}
```

### Database Model
```prisma
model FraudFlag {
  id              String    @id @default(uuid())
  userId          String
  
  type            String    // "MULTI_ACCOUNT", "BONUS_ABUSE", "MONEY_LAUNDERING", etc.
  severity        String    // "LOW", "MEDIUM", "HIGH", "CRITICAL"
  description     String
  evidence        Json      // Supporting data
  
  status          String    @default("OPEN") // "OPEN", "REVIEWED", "DISMISSED", "ACTIONED"
  reviewedBy      String?
  reviewNotes     String?
  actionTaken     String?   // "NONE", "WARNING", "RESTRICTED", "SUSPENDED", "BANNED"
  
  createdAt       DateTime  @default(now())
  reviewedAt      DateTime?
  
  @@index([userId])
  @@index([type])
  @@index([status])
  @@map("fraud_flags")
}

model DeviceFingerprint {
  id              String    @id @default(uuid())
  userId          String
  
  deviceId        String    // Hardware/generated unique ID
  deviceModel     String?
  osVersion       String?
  appVersion      String?
  screenResolution String?
  ipAddress       String
  
  firstSeenAt     DateTime  @default(now())
  lastSeenAt      DateTime  @default(now())
  
  @@index([deviceId])
  @@index([userId])
  @@index([ipAddress])
  @@map("device_fingerprints")
}
```

---

## 7. Responsible Gaming

### Why This Matters
Even in markets with lighter regulation, responsible gaming features protect the platform legally and ethically. They also build user trust.

### Features

#### A. Self-Imposed Limits (User-Controlled)
```
┌──────────────────────────────────────────────────────┐
│  My Limits (User Settings)                           │
│                                                      │
│  Daily Deposit Limit:    [₹ 5,000    ] per day       │
│  Daily Bet Limit:        [₹ 10,000   ] per day       │
│  Daily Loss Limit:       [₹ 3,000    ] per day       │
│  Session Time Limit:     [2 hours     ] per session   │
│                                                      │
│  ⚠️ Once set, limits can only be DECREASED           │
│  immediately. INCREASING requires a 24-hour           │
│  cooling-off period.                                  │
└──────────────────────────────────────────────────────┘
```

#### B. Self-Exclusion
```
User can self-exclude for:
├── 24 hours   (immediate, no admin approval needed)
├── 7 days     (immediate)
├── 30 days    (immediate)
├── 6 months   (immediate, cannot be reversed early)
└── Permanent  (requires contacting support to reverse)

During exclusion:
├── Cannot login to the app
├── Cannot place bets
├── Active bets are settled normally
├── Withdrawal of remaining balance is still allowed
└── Promotional emails/notifications are stopped
```

#### C. Reality Checks (Pop-up Reminders)
```
After every 60 minutes of continuous play:
┌─────────────────────────────────────────┐
│  ⏰ Reality Check                       │
│                                         │
│  You've been playing for 1 hour.       │
│                                         │
│  Session Summary:                       │
│  • Bets placed: 23                      │
│  • Total wagered: ₹4,500               │
│  • Net result: -₹800                    │
│                                         │
│  [Continue Playing]  [Take a Break]     │
└─────────────────────────────────────────┘
```

#### D. Cool-Down Period After Big Losses
```
If user loses > ₹X in a single round or > ₹Y in an hour:
  → 5-minute forced cool-down
  → Display: "Take a moment. You can resume in 4:59..."
  → No bets allowed during cool-down
  → Cannot be skipped
```

### Database Model
```prisma
model UserLimit {
  id              String    @id @default(uuid())
  userId          String    @unique
  
  dailyDepositLimit    Decimal? @db.Decimal(12, 2)
  dailyBetLimit        Decimal? @db.Decimal(12, 2)
  dailyLossLimit       Decimal? @db.Decimal(12, 2)
  sessionTimeLimit     Int?     // minutes
  
  // Tracking current period usage
  todayDeposited       Decimal  @default(0) @db.Decimal(12, 2)
  todayBetTotal        Decimal  @default(0) @db.Decimal(12, 2)
  todayLossTotal       Decimal  @default(0) @db.Decimal(12, 2)
  currentSessionStart  DateTime?
  
  // Self-exclusion
  selfExcludedUntil    DateTime?
  selfExclusionType    String?  // "24h", "7d", "30d", "6m", "permanent"
  
  lastResetAt          DateTime @default(now()) // Daily limit reset
  updatedAt            DateTime @updatedAt
  
  @@map("user_limits")
}
```

---

## 8. Connection Recovery & Game State Sync

### The Problem
In India, network connections drop frequently (tunnels, poor coverage, switching between WiFi/4G). If a user's connection drops mid-game:
- In Aviator: Did their cashout go through?
- Mid-round: Did their bet get placed?
- On result: Did they miss their winnings?

### Solution: State Recovery Protocol

```typescript
// On reconnect, client sends:
{
  event: "sync:request",
  data: {
    lastKnownRoundId: "uuid",
    lastKnownRoundStatus: "BETTING",
    pendingBetIds: ["bet1", "bet2"],      // Bets placed but not confirmed
    lastKnownBalance: 5000.00,
    lastEventTimestamp: 1645000000000
  }
}

// Server responds with:
{
  event: "sync:response",
  data: {
    currentRound: {
      roundId: "uuid",
      status: "RESULT",
      result: { ... },                    // If round already finished
      timeRemaining: 0
    },
    missedEvents: [                        // Everything since disconnect
      { event: "round:result", data: {...}, timestamp: ... },
      { event: "bet:result",   data: {...}, timestamp: ... }
    ],
    betStatuses: {                         // Confirm pending bets
      "bet1": { status: "WON", payout: 975 },
      "bet2": { status: "LOST", payout: 0 }
    },
    currentBalance: 5475.00,               // Authoritative balance
    walletChanges: [                        // Itemized changes since disconnect
      { type: "BET_WON", amount: +975, betId: "bet1" },
      { type: "BET_LOST", amount: -500, betId: "bet2" }
    ]
  }
}
```

### Critical Rules
1. **Server is ALWAYS the source of truth** — client never decides outcomes
2. **Bets are not confirmed until server ACKs** — client shows "Placing..." until confirmed
3. **Aviator cashout** — if connection drops, server auto-cashes out at the multiplier when disconnect was detected (server-side timestamp)
4. **Missed results** — on reconnect, show a "While you were away..." summary modal
5. **Duplicate bet prevention** — every bet request has a client-generated `idempotencyKey`; server rejects duplicates

### Reconnection UI
```
┌─────────────────────────────────────────┐
│  ⚡ Reconnecting...                     │
│                                         │
│  ████████████░░░░░░░░  60%              │
│                                         │
│  Your bets and balance are safe.        │
│  Please wait while we sync your game.   │
└─────────────────────────────────────────┘

// After reconnect:
┌─────────────────────────────────────────┐
│  📋 While You Were Away                 │
│                                         │
│  Round #1523: Result — Player A Won     │
│  • Your bet: ₹500 on Player A → WON    │
│  • Payout: ₹975                         │
│                                         │
│  Round #1524: Result — Tie              │
│  • No bet placed                        │
│                                         │
│  Updated Balance: ₹5,475               │
│                                         │
│                          [OK, Got It]    │
└─────────────────────────────────────────┘
```

---

## 9. Server-Client Time Synchronization

### The Problem
If the user's device clock is 5 seconds ahead of the server, they might:
- Think betting is still open when it's already locked
- See incorrect countdown timers
- Try to cashout in Aviator after the crash already happened

### Solution: Time Offset Calculation

```typescript
// Client-side: Calculate offset on app start and periodically
async function syncTime(): Promise<number> {
  const t1 = Date.now();                        // Client send time
  const response = await fetch('/api/v1/time');  // Server responds with its time
  const t4 = Date.now();                        // Client receive time
  
  const serverTime = response.data.serverTime;  // t2 ≈ t3 (processing is instant)
  const roundTrip = t4 - t1;
  const oneWayLatency = roundTrip / 2;
  
  // Offset = how far ahead server is from client
  const offset = serverTime - t1 - oneWayLatency;
  
  return offset;  // Add this to Date.now() to get server time
}

// Usage everywhere in the app:
function getServerTime(): number {
  return Date.now() + timeOffset;
}

// All countdown timers use server time:
const remaining = round.bettingEndsAt - getServerTime();
```

### API Endpoint
```
GET /api/v1/time

Response:
{
  "serverTime": 1645000000000,   // Unix ms
  "roundTripEstimate": true
}
```

### Rules
- Sync on app startup
- Re-sync every 5 minutes
- Re-sync after every reconnection
- All game timers use server-adjusted time
- **Betting close decision is ALWAYS server-side** — client timer is only cosmetic

---

## 10. Multi-Device & Session Management

### Policy Options (Admin-Configurable)

| Policy                     | Description                                         |
| -------------------------- | --------------------------------------------------- |
| **Single Device Only**     | Login on new device → auto-logout on old device     |
| **Multiple Devices**       | Allow but prevent same game from two devices         |
| **View-Only Multi-Device** | Second device can view but not place bets            |

### Recommended: Single Active Session
```
User logs in on Device B:
  → Server invalidates Device A's session
  → Device A's WebSocket receives "session:invalidated"
  → Device A shows: "You've logged in from another device"
  → Device A redirects to login screen
```

### Implementation
```typescript
// On login:
async function handleLogin(userId: string, deviceInfo: DeviceInfo) {
  // 1. Invalidate all existing sessions for this user
  await redis.del(`session:${userId}:*`);
  
  // 2. Emit force-logout to any connected sockets
  socketServer.to(`user:${userId}`).emit('session:invalidated', {
    reason: 'Another device logged in',
    newDevice: deviceInfo.model
  });
  
  // 3. Create new session
  const sessionId = generateSessionId();
  await redis.set(`session:${userId}:${sessionId}`, deviceInfo, 'EX', 86400);
  
  return sessionId;
}
```

---

## 11. Commission / Rake Model

### The Problem
The house edge / commission model varies by game type. This needs to be clearly defined and configurable.

### Commission Models by Game Type

#### A. Spread Model (Dragon Tiger, Teen Patti, 7 Up Down)
```
Payout = Bet × (TrueOdds - HouseEdge)

Example (Dragon Tiger):
  True odds of winning: 50%  → True payout: 2.00x
  With 2.5% house edge:     → Actual payout: 1.95x
  
  The 0.05x difference is the commission (built into odds)
```

#### B. Crash Model (Aviator)
```
Crash point algorithm includes built-in house edge:

function generateCrashPoint(houseEdge: number = 0.05): number {
  const random = Math.random();
  
  // With 5% house edge, 5% of rounds crash at 1.00x (instant crash)
  if (random < houseEdge) return 1.00;
  
  // Remaining rounds follow exponential distribution
  return Math.floor(100 / (random * 100)) / 100;
}
```

#### C. Fixed Commission (Poker — if multiplayer)
```
Rake = min(BetAmount × RakePercentage, MaxRakeCap)

Example: 5% rake with ₹200 cap
  Pot of ₹1,000 → Rake = ₹50
  Pot of ₹10,000 → Rake = ₹200 (capped)
```

### Admin Controls
- Set house edge per game (0.5% - 20%)
- View theoretical vs actual house edge
- Adjust instantly (applies from next round)

---

## 12. Banner, Popup & Engagement System

### The Problem
The app needs to communicate promotions, updates, and events without requiring app updates.

### Admin-Managed Content Types

#### A. Home Screen Banners (Carousel)
```prisma
model Banner {
  id              String    @id @default(uuid())
  title           String
  imageUrl        String    // S3 URL (optimized for mobile)
  linkType        String    // "game", "deposit", "external", "none"
  linkTarget      String?   // game slug, URL, or screen name
  
  position        Int       // Display order
  isActive        Boolean   @default(true)
  startDate       DateTime?
  endDate         DateTime?
  
  // Targeting
  targetTier      VipTier?  // Show only to specific tier
  targetNewUsers  Boolean   @default(false) // Show only to new users
  
  createdBy       String
  createdAt       DateTime  @default(now())
  
  @@map("banners")
}
```

#### B. Popup Announcements
```
Trigger types:
├── On app open (once per day)
├── On game entry (before first bet)
├── On deposit page (upsell)
├── After X consecutive losses (responsible gaming)
└── Scheduled (admin sets exact time)

Content:
├── Image + CTA button
├── Rich text announcement
├── Promotional code input
└── Event countdown
```

#### C. Ticker Notifications (In-Game)
```
"🎉 Player XYZ just won ₹25,000 on Aviator!"
"🔥 New: 200% Deposit Bonus this weekend!"
"⚡ Poker tournament starts in 30 minutes!"

(These are real but anonymized — builds social proof and FOMO)
```

#### D. Push Notifications (Firebase Cloud Messaging)
```
Automated triggers:
├── Deposit approved: "₹1,000 added to your wallet!"
├── Withdrawal processed: "₹5,000 sent to your bank"
├── Daily bonus available: "Claim your Day 5 reward: ₹15!"
├── Inactive user (3+ days): "We miss you! ₹50 bonus waiting"
├── Favorite game round starting: "Teen Patti round starting in 30s"
├── Referral bonus earned: "Your friend just deposited! ₹100 bonus!"
└── Admin broadcast: Custom message to all/segment
```

---

## 13. Customer Support System

### In-App Support

#### A. Help Center (FAQ)
- Searchable knowledge base
- Categories: Account, Deposits, Withdrawals, Games, Technical
- Admin-managed content (create/edit/delete articles)

#### B. Live Chat / Ticket System
```
Options (choose one):
├── Option A: Integrate Freshdesk / Zendesk widget
├── Option B: Build basic in-app chat with admin panel
└── Option C: WhatsApp Business API link

Recommended: Option A (Freshdesk/Zendesk) — cheaper to maintain
Fallback: WhatsApp link for MVP
```

#### C. Quick Actions in Support
- Report a bug
- Dispute a bet result
- Request account deletion
- Report another user

---

## 14. App Lifecycle Management

### A. Force Update Mechanism
```typescript
// On app startup, check:
const response = await api.get('/app/version-check', {
  currentVersion: '1.0.5',
  platform: 'android'
});

// Response:
{
  "updateRequired": true,         // Must update to continue
  "updateRecommended": false,     // Soft prompt
  "minimumVersion": "1.0.6",
  "latestVersion": "1.1.0",
  "updateUrl": "https://play.google.com/...",
  "message": "Critical security update. Please update to continue."
}
```

### B. Maintenance Mode Handling
```
When admin enables maintenance mode:

For users currently in a game:
  1. Current round completes normally (don't disrupt mid-round)
  2. No new rounds start
  3. All active bets are settled
  4. Show maintenance screen:
     ┌─────────────────────────────────────────┐
     │  🔧 Under Maintenance                   │
     │                                         │
     │  We're improving your experience.       │
     │  We'll be back shortly!                 │
     │                                         │
     │  Estimated downtime: ~30 minutes        │
     │                                         │
     │  Your balance: ₹5,475 (Safe ✅)         │
     └─────────────────────────────────────────┘

For new logins:
  → Show maintenance screen immediately
  → Allow viewing balance (read-only)
```

### C. Feature Flags
```prisma
model FeatureFlag {
  id          String    @id @default(uuid())
  key         String    @unique  // "enable_poker", "show_referral_banner"
  value       Boolean   @default(false)
  description String?
  
  // Targeting
  rolloutPercentage Int @default(100)  // 0-100, for gradual rollouts
  targetTiers       Json?              // ["GOLD", "DIAMOND"]
  
  updatedBy   String?
  updatedAt   DateTime  @updatedAt
  
  @@map("feature_flags")
}
```
This lets admin enable/disable features without app updates.

---

## 15. Concurrency, Idempotency & Failure Recovery

### A. Wallet Concurrency (Most Critical)

```
Scenario: User has ₹1,000. Two bet requests arrive simultaneously:
  Bet 1: ₹600 on Teen Patti
  Bet 2: ₹600 on Aviator
  
WITHOUT proper locking:
  Both read balance = ₹1,000 ✓
  Both deduct ₹600
  Final balance = -₹200 ❌ (negative!)
```

#### Solution: Optimistic Locking + Database Transactions
```typescript
async function deductBalance(walletId: string, amount: number): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    // 1. Read wallet with version
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    
    // 2. Check balance
    if (wallet.balance < amount) {
      throw new InsufficientBalanceError();
    }
    
    // 3. Update with version check (optimistic lock)
    const updated = await tx.wallet.updateMany({
      where: { 
        id: walletId, 
        version: wallet.version  // Only succeeds if no one else modified
      },
      data: { 
        balance: { decrement: amount },
        version: { increment: 1 }
      }
    });
    
    // 4. If version mismatch, retry
    if (updated.count === 0) {
      throw new ConcurrencyError('Wallet was modified, retry');
    }
    
    return true;
  });
}
```

### B. Idempotency for Bet Placement
```typescript
// Client sends idempotency key with every bet:
{
  "idempotencyKey": "client-generated-uuid-123",
  "roundId": "xxx",
  "betType": "PLAYER_A",
  "amount": 500
}

// Server checks:
const existing = await redis.get(`idempotency:${idempotencyKey}`);
if (existing) {
  return existing;  // Return same response as before (no double-bet)
}

// Process bet...
await redis.set(`idempotency:${idempotencyKey}`, response, 'EX', 3600);
```

### C. Settlement Failure Recovery
```
If server crashes during bet settlement:

1. On startup, check for rounds in "RESULT" status (not "SETTLED")
2. Re-run settlement for those rounds
3. Settlement is idempotent — won't double-pay
4. Each bet has a "settledAt" timestamp — skip if already settled
```

### D. Deposit/Withdrawal Atomicity
```
Deposit approval must be atomic:
  1. Mark deposit as APPROVED       ──┐
  2. Credit user wallet              │ Single DB transaction
  3. Create transaction record       │
  4. Send notification              ──┘ (can be async)
  
If any step 1-3 fails → entire operation rolls back
Notification (step 4) is async and can retry
```

---

## 16. Legal & Compliance

### Required Pages / Documents

| Document              | Where                    | Purpose                                  |
| --------------------- | ------------------------ | ---------------------------------------- |
| Terms of Service      | In-app + Website         | Legal agreement with users               |
| Privacy Policy        | In-app + Website         | GDPR/data protection compliance          |
| Responsible Gaming    | In-app                   | Shows commitment to safe gaming          |
| Refund Policy         | In-app                   | Deposit/withdrawal dispute resolution    |
| KYC Policy            | In-app                   | When/why identity verification is needed |
| Game Rules            | Per game (in-app)        | Clear rules, odds, and payout tables     |

### Age Verification
```
On signup:
  ☑ I am 18 years or older
  ☑ I agree to the Terms of Service
  ☑ I understand this involves real money
```

### Data Retention Policy
- Transaction records: Minimum 5 years (financial regulation)
- Game results: Minimum 1 year
- Login history: 6 months
- Chat/support tickets: 2 years
- Account data after deletion request: 90-day grace period, then purge

---

## 17. Database Schema Additions

Summary of all new models introduced in this addendum:

```
NEW MODELS:
├── HouseWallet        — Platform bankroll tracking
├── RoundExposure      — Per-round risk tracking
├── Bonus              — Promotion definitions
├── BonusClaim         — User bonus claims & tracking
├── Referral           — Referral relationships & commission
├── UserVipTier        — VIP loyalty tier data
├── FraudFlag          — Fraud detection flags
├── DeviceFingerprint  — Device tracking for fraud
├── UserLimit          — Self-imposed responsible gaming limits
├── Banner             — Admin-managed promotional banners
├── FeatureFlag        — Feature toggles

MODIFIED MODELS:
├── User               — Add: referralCode, referredBy, riskScore
├── Wallet             — Add: lockedBalance, bonusTurnoverRequired
├── Transaction        — Add: idempotencyKey
├── Bet                — Add: idempotencyKey, commissionAmount
└── WithdrawalRequest  — Add: turnoverCheck, riskFlags
```

---

## 18. Updated Execution Plan Impact

These additions add approximately **3-4 extra sprints** to the timeline:

| Additional Sprint | Duration | Contents                                                |
| ----------------- | -------- | ------------------------------------------------------- |
| Sprint 3.5        | 2 weeks  | Bonus engine, referral system, daily rewards            |
| Sprint 6.5        | 2 weeks  | Fraud engine, risk scoring, responsible gaming          |
| Sprint 8.5        | 2 weeks  | Admin: bonus management, fraud review, VIP, banners     |
| Sprint 10.5       | 1 week   | Mobile: connection recovery, time sync, feature flags   |

**Updated total timeline: 20-24 weeks (5-6 months)**

### Priority Matrix for Addendum Features

| Priority | Features                                                          |
| -------- | ----------------------------------------------------------------- |
| P0 (MVP) | Turnover requirements, wallet concurrency, connection recovery, time sync, idempotency, maintenance mode handling |
| P1 (V1.1)| Bonus engine (welcome + first deposit), referral basic, house bankroll tracking, multi-device handling, push notifications, force update |
| P2 (V1.2)| VIP tiers, cashback, fraud detection (multi-account + bonus abuse), daily login rewards, banners, self-imposed limits |
| P3 (V2.0)| Full risk engine, advanced analytics, affiliate system, live chat support, feature flags, collusion detection |

---

> **This document should be read alongside the core documentation (01-06).  
> Together, they form the complete specification for ABCRummy.**
