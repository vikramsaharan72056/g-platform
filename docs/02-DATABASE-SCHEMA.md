# 📊 ABCRummy — Database Schema Design

## Overview

The database is designed using **PostgreSQL** with **Prisma ORM**. The schema follows a modular approach with clear separation between user management, wallet/financial operations, and game logic.

---

## Entity Relationship Diagram (High-Level)

```
┌─────────────┐     1:1      ┌──────────────┐     1:N      ┌──────────────────┐
│    User      │─────────────▶│    Wallet     │─────────────▶│  Transaction     │
│             │              │              │              │  (Deposit/       │
│             │              │              │              │   Withdrawal)    │
└──────┬──────┘              └──────────────┘              └──────────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐     N:1      ┌──────────────┐     1:N      ┌──────────────────┐
│     Bet      │─────────────▶│  GameRound    │◀────────────│  RoundResult     │
│              │              │              │              │                  │
└──────────────┘              └──────┬───────┘              └──────────────────┘
                                     │ N:1
                                     ▼
                              ┌──────────────┐
                              │    Game      │
                              │ (Teen Patti, │
                              │  Aviator...) │
                              └──────────────┘
```

---

## Complete Schema Models

### 1. User

```prisma
model User {
  id                String      @id @default(uuid())
  email             String      @unique
  password          String      // bcrypt hashed
  displayName       String?
  phone             String?     @unique
  avatar            String?     // S3 URL
  
  // 2FA
  twoFactorEnabled  Boolean     @default(false)
  twoFactorSecret   String?     // TOTP secret (encrypted)
  
  // KYC
  kycStatus         KycStatus   @default(NONE)
  kycDocuments      Json?       // Array of document URLs
  
  // Status
  status            UserStatus  @default(ACTIVE)
  role              UserRole    @default(PLAYER)
  
  // Relations
  wallet            Wallet?
  bets              Bet[]
  transactions      Transaction[]
  loginHistory      LoginHistory[]
  notifications     Notification[]
  
  // Timestamps
  lastLoginAt       DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt
  
  @@index([email])
  @@index([status])
  @@map("users")
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
  DEACTIVATED
}

enum UserRole {
  PLAYER
  ADMIN
  SUPER_ADMIN
}

enum KycStatus {
  NONE
  PENDING
  VERIFIED
  REJECTED
}
```

### 2. Wallet

```prisma
model Wallet {
  id              String        @id @default(uuid())
  userId          String        @unique
  user            User          @relation(fields: [userId], references: [id])
  
  balance         Decimal       @default(0) @db.Decimal(12, 2)
  bonusBalance    Decimal       @default(0) @db.Decimal(12, 2)
  totalDeposited  Decimal       @default(0) @db.Decimal(12, 2)
  totalWithdrawn  Decimal       @default(0) @db.Decimal(12, 2)
  totalWon        Decimal       @default(0) @db.Decimal(12, 2)
  totalLost       Decimal       @default(0) @db.Decimal(12, 2)
  
  // Lock for concurrent transactions
  version         Int           @default(0) // Optimistic locking
  
  transactions    Transaction[]
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  @@map("wallets")
}
```

### 3. Transaction

```prisma
model Transaction {
  id              String              @id @default(uuid())
  
  // Relations
  userId          String
  user            User                @relation(fields: [userId], references: [id])
  walletId        String
  wallet          Wallet              @relation(fields: [walletId], references: [id])
  
  // Transaction Details
  type            TransactionType
  amount          Decimal             @db.Decimal(12, 2)
  balanceBefore   Decimal             @db.Decimal(12, 2)
  balanceAfter    Decimal             @db.Decimal(12, 2)
  
  // Payment Details (for deposits/withdrawals)
  paymentMethod   String?             // UPI, Bank Transfer, etc.
  paymentProof    String?             // Screenshot S3 URL (for deposits)
  utrNumber       String?             // Unique Transaction Reference
  bankDetails     Json?               // For withdrawal: { accountNo, ifsc, name }
  
  // Status & Admin
  status          TransactionStatus   @default(PENDING)
  adminRemarks    String?
  processedBy     String?             // Admin user ID who processed
  processedAt     DateTime?
  
  // Reference (for game-related transactions)
  betId           String?
  gameRoundId     String?
  
  description     String?
  
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  
  @@index([userId])
  @@index([walletId])
  @@index([type])
  @@index([status])
  @@index([createdAt])
  @@map("transactions")
}

enum TransactionType {
  DEPOSIT
  WITHDRAWAL
  BET_PLACED
  BET_WON
  BET_REFUND
  BONUS_CREDIT
  BONUS_DEBIT
  ADMIN_CREDIT
  ADMIN_DEBIT
}

enum TransactionStatus {
  PENDING
  PROCESSING
  COMPLETED
  REJECTED
  FAILED
  CANCELLED
}
```

### 4. Game

```prisma
model Game {
  id                String       @id @default(uuid())
  
  name              String       @unique
  slug              String       @unique  // e.g., "teen-patti", "aviator"
  type              GameType
  
  // Configuration
  minBet            Decimal      @db.Decimal(12, 2)
  maxBet            Decimal      @db.Decimal(12, 2)
  roundDuration     Int          // seconds
  bettingWindow     Int          // seconds (time before round locks bets)
  maxPlayersPerRoom Int?         // null = unlimited
  
  // House Edge
  houseEdge         Decimal      @default(5) @db.Decimal(5, 2) // percentage
  
  // Admin Controls
  isActive          Boolean      @default(true)
  isMaintenanceMode Boolean      @default(false)
  
  // Game-specific config stored as JSON
  config            Json?        // Flexible per-game settings
  
  // Relations
  rounds            GameRound[]
  adminControls     GameAdminControl[]
  
  // Assets
  thumbnail         String?      // S3 URL
  banner            String?      // S3 URL
  
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  
  @@map("games")
}

enum GameType {
  CARD_GAME       // Teen Patti, Dragon Tiger, Poker
  CRASH_GAME      // Aviator
  DICE_GAME       // 7 Up Down
  SLOT_GAME       // Future
  ROULETTE_GAME   // Future
}
```

### 5. GameRound

```prisma
model GameRound {
  id              String          @id @default(uuid())
  
  gameId          String
  game            Game            @relation(fields: [gameId], references: [id])
  
  roundNumber     Int             // Sequential round number for the game
  
  // Timing
  status          RoundStatus     @default(WAITING)
  bettingStartAt  DateTime
  bettingEndAt    DateTime
  playStartAt     DateTime?
  resultAt        DateTime?
  settledAt       DateTime?
  
  // Result
  result          Json?           // Game-specific result data
  resultHash      String?         // Pre-generated hash for provably fair
  resultSeed      String?         // Revealed after round ends
  
  // Admin Override
  isOverridden    Boolean         @default(false)
  overriddenBy    String?         // Admin user ID
  overrideReason  String?
  originalResult  Json?           // Store original result if overridden
  
  // Stats
  totalBets       Int             @default(0)
  totalBetAmount  Decimal         @default(0) @db.Decimal(14, 2)
  totalPayout     Decimal         @default(0) @db.Decimal(14, 2)
  housePnl        Decimal         @default(0) @db.Decimal(14, 2) // profit/loss
  
  // Relations
  bets            Bet[]
  roundResults    RoundResult[]
  
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  
  @@unique([gameId, roundNumber])
  @@index([gameId])
  @@index([status])
  @@index([createdAt])
  @@map("game_rounds")
}

enum RoundStatus {
  WAITING       // Waiting for next round to start
  BETTING       // Accepting bets
  LOCKED        // Bets locked, preparing to play
  PLAYING       // Game in progress (animation phase)
  RESULT        // Result declared, settlement in progress  
  SETTLED       // All bets settled
  CANCELLED     // Round cancelled (refunds issued)
}
```

### 6. Bet

```prisma
model Bet {
  id              String        @id @default(uuid())
  
  // Relations
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  gameRoundId     String
  gameRound       GameRound     @relation(fields: [gameRoundId], references: [id])
  
  // Bet Details
  amount          Decimal       @db.Decimal(12, 2)
  betType         String        // Game-specific: "player_a", "up", "dragon", "fold", etc.
  betData         Json?         // Additional bet parameters
  
  // Odds & Payout
  odds            Decimal?      @db.Decimal(8, 4)
  potentialPayout Decimal?      @db.Decimal(14, 2)
  actualPayout    Decimal       @default(0) @db.Decimal(14, 2)
  
  // Status
  status          BetStatus     @default(PLACED)
  settledAt       DateTime?
  
  // Transaction references
  placeTxnId      String?       // Transaction ID for bet placement
  payoutTxnId     String?       // Transaction ID for payout
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  @@index([userId])
  @@index([gameRoundId])
  @@index([status])
  @@index([createdAt])
  @@map("bets")
}

enum BetStatus {
  PLACED
  WON
  LOST
  REFUNDED
  CANCELLED
}
```

### 7. RoundResult

```prisma
model RoundResult {
  id              String      @id @default(uuid())
  
  gameRoundId     String
  gameRound       GameRound   @relation(fields: [gameRoundId], references: [id])
  
  // Result data varies by game type
  resultType      String      // "card_deal", "crash_point", "dice_roll", etc.
  resultData      Json        // Full result details
  
  // For card games
  // resultData example: { "cards": [...], "winner": "player_a", "hand": "trail" }
  
  // For Aviator
  // resultData example: { "crashPoint": 2.45, "multiplierHistory": [...] }
  
  // For 7 Up Down
  // resultData example: { "dice1": 4, "dice2": 3, "total": 7, "outcome": "seven" }
  
  // For Dragon & Tiger
  // resultData example: { "dragonCard": "KH", "tigerCard": "5S", "winner": "dragon" }
  
  createdAt       DateTime    @default(now())
  
  @@index([gameRoundId])
  @@map("round_results")
}
```

### 8. GameAdminControl

```prisma
model GameAdminControl {
  id              String      @id @default(uuid())
  
  gameId          String
  game            Game        @relation(fields: [gameId], references: [id])
  
  // Control Type
  controlType     AdminControlType
  
  // Configuration
  config          Json
  // Examples:
  // FORCE_RESULT:  { "roundId": "xxx", "result": { ... } }
  // WIN_RATE:      { "targetWinRate": 40, "period": "hourly" }
  // BET_LIMITS:    { "minBet": 10, "maxBet": 5000 }
  // PLAYER_LIMIT:  { "targetUserId": "xxx", "maxWin": 1000 }
  
  isActive        Boolean     @default(true)
  
  createdBy       String      // Admin user ID
  expiresAt       DateTime?   // Auto-disable after this time
  
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  
  @@index([gameId])
  @@index([controlType])
  @@map("game_admin_controls")
}

enum AdminControlType {
  FORCE_RESULT       // Force a specific outcome for next round
  WIN_RATE_CONTROL   // Set target win rates
  BET_LIMITS         // Override bet limits
  PLAYER_LIMIT       // Limit specific player's winnings
  ROUND_TIMER        // Override round duration
  MAINTENANCE        // Put game in maintenance
}
```

### 9. Deposit (QR Scanner Based)

```prisma
model DepositRequest {
  id              String              @id @default(uuid())
  
  userId          String
  user            User                @relation(fields: [userId], references: [id])
  
  amount          Decimal             @db.Decimal(12, 2)
  
  // QR / Payment Info
  paymentQrId     String              // Reference to the admin's QR code used
  paymentQr       PaymentQR           @relation(fields: [paymentQrId], references: [id])
  
  // Proof
  screenshotUrl   String?             // S3 URL of payment screenshot
  utrNumber       String?             // Unique Transaction Reference
  paymentMethod   String              // UPI, Bank Transfer, etc.
  
  // Admin review
  status          DepositStatus       @default(PENDING)
  reviewedBy      String?             // Admin user ID
  reviewRemarks   String?
  reviewedAt      DateTime?
  
  // Linked transaction (created on approval)
  transactionId   String?
  
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  
  @@index([userId])
  @@index([status])
  @@map("deposit_requests")
}

enum DepositStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}

model PaymentQR {
  id              String            @id @default(uuid())
  
  name            String            // Label: "UPI - Primary", "Bank Account 1"
  type            String            // UPI, BANK
  qrCodeUrl       String            // S3 URL of QR image
  upiId           String?           // UPI ID if applicable
  bankDetails     Json?             // { accountNo, ifsc, bankName, holderName }
  
  isActive        Boolean           @default(true)
  dailyLimit      Decimal?          @db.Decimal(14, 2)
  dailyCollected  Decimal           @default(0) @db.Decimal(14, 2)
  
  deposits        DepositRequest[]
  
  createdBy       String            // Admin user ID
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  
  @@map("payment_qrs")
}
```

### 10. WithdrawalRequest

```prisma
model WithdrawalRequest {
  id              String                @id @default(uuid())
  
  userId          String
  user            User                  @relation(fields: [userId], references: [id])
  
  amount          Decimal               @db.Decimal(12, 2)
  
  // Bank / UPI Details
  payoutMethod    String                // UPI, BANK, PAYTM
  payoutDetails   Json                  // { upiId } or { accountNo, ifsc, bankName, holderName }
  
  // Admin review
  status          WithdrawalStatus      @default(PENDING)
  reviewedBy      String?               // Admin user ID
  reviewRemarks   String?
  reviewedAt      DateTime?
  
  // Payment proof (from admin side)
  paymentProof    String?               // S3 URL of payment confirmation
  paymentRef      String?               // Reference number from payment gateway
  
  // Linked transaction
  transactionId   String?
  
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  
  @@index([userId])
  @@index([status])
  @@map("withdrawal_requests")
}

enum WithdrawalStatus {
  PENDING
  PROCESSING
  COMPLETED
  REJECTED
  ON_HOLD
}
```

### 11. Supporting Models

```prisma
model LoginHistory {
  id            String      @id @default(uuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  
  ipAddress     String
  userAgent     String
  deviceInfo    Json?       // { device, os, browser }
  location      String?
  
  loginAt       DateTime    @default(now())
  
  @@index([userId])
  @@map("login_history")
}

model Notification {
  id            String      @id @default(uuid())
  userId        String
  user          User        @relation(fields: [userId], references: [id])
  
  type          String      // "deposit_approved", "withdrawal_processed", "game_result", etc.
  title         String
  body          String
  data          Json?       // Additional notification data
  isRead        Boolean     @default(false)
  
  createdAt     DateTime    @default(now())
  
  @@index([userId])
  @@index([isRead])
  @@map("notifications")
}

model SystemSetting {
  id            String      @id @default(uuid())
  key           String      @unique
  value         Json
  description   String?
  
  updatedBy     String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  @@map("system_settings")
}

model AuditLog {
  id            String      @id @default(uuid())
  
  userId        String
  action        String      // "admin.game.override", "admin.deposit.approve", etc.
  resource      String      // "game_round", "deposit_request", etc.
  resourceId    String
  details       Json?       // Change details
  ipAddress     String?
  
  createdAt     DateTime    @default(now())
  
  @@index([userId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}
```

---

## Database Indexes Summary

| Table              | Index Columns                     | Purpose                          |
| ------------------ | --------------------------------- | -------------------------------- |
| users              | email, status                     | Auth lookups, admin filtering    |
| transactions       | userId, walletId, type, status    | Wallet history, admin review     |
| game_rounds        | gameId, status, createdAt         | Active rounds, game history      |
| bets               | userId, gameRoundId, status       | User bet history, settlement     |
| deposit_requests   | userId, status                    | Deposit review queue             |
| withdrawal_requests| userId, status                    | Withdrawal review queue          |
| audit_logs         | userId, action, createdAt         | Admin activity tracking          |

---

## Migration Strategy

1. **Development:** Use `prisma migrate dev` for iterative schema changes
2. **Staging:** Use `prisma migrate deploy` with seeded test data
3. **Production:** Use `prisma migrate deploy` with backup-first strategy

---

> **Next:** See `03-GAME-SPECIFICATIONS.md` for detailed game logic documentation.
