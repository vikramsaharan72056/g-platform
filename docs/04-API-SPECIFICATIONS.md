# 🔌 ABCRummy — API Specifications

## Overview

The backend exposes RESTful APIs for CRUD operations and WebSocket connections for real-time game interactions. All APIs are versioned under `/api/v1/`.

---

## Base Configuration

| Property          | Value                                    |
| ----------------- | ---------------------------------------- |
| Base URL          | `https://api.abcrummy.com/api/v1`        |
| WebSocket URL     | `wss://api.abcrummy.com`                 |
| Auth Header       | `Authorization: Bearer <jwt_token>`      |
| Content Type      | `application/json`                       |
| Rate Limit        | 100 req/min (auth), 20 req/min (public)  |

---

## 1. Authentication APIs

### 1.1 Register

```
POST /auth/register
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "displayName": "JohnDoe",
  "phone": "+919876543210"    // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "JohnDoe",
      "twoFactorEnabled": false
    },
    "token": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

**Validations:**
- Email: Valid format, unique
- Password: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
- Display Name: 3-30 chars, alphanumeric + underscore

---

### 1.2 Login

```
POST /auth/login
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123"
}
```

**Response (200) — Without 2FA:**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

**Response (200) — With 2FA Enabled:**
```json
{
  "success": true,
  "data": {
    "requires2FA": true,
    "tempToken": "temporary_token_for_2fa_verification"
  }
}
```

---

### 1.3 Verify 2FA

```
POST /auth/verify-2fa
```

**Request Body:**
```json
{
  "tempToken": "temporary_token_from_login",
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

---

### 1.4 Enable 2FA

```
POST /auth/2fa/enable
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",          // Base32 encoded
    "qrCodeUrl": "otpauth://totp/ABCRummy:user@example.com?secret=...",
    "qrCodeImage": "data:image/png;base64,..."  // QR code as base64 image
  }
}
```

---

### 1.5 Confirm 2FA Setup

```
POST /auth/2fa/confirm
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "code": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "backupCodes": ["abc123", "def456", "ghi789", ...]  // 10 backup codes
  }
}
```

---

### 1.6 Disable 2FA

```
DELETE /auth/2fa/disable
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "code": "123456",
  "password": "current_password"
}
```

---

### 1.7 Refresh Token

```
POST /auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

---

### 1.8 Forgot Password

```
POST /auth/forgot-password
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

---

### 1.9 Reset Password

```
POST /auth/reset-password
```

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "NewSecureP@ss123"
}
```

---

## 2. User Profile APIs

### 2.1 Get Profile

```
GET /users/profile
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "JohnDoe",
    "phone": "+919876543210",
    "avatar": "https://s3.../avatar.jpg",
    "twoFactorEnabled": true,
    "kycStatus": "VERIFIED",
    "wallet": {
      "balance": 5000.00,
      "bonusBalance": 200.00
    },
    "stats": {
      "totalGamesPlayed": 150,
      "totalWinnings": 25000.00,
      "totalBetAmount": 50000.00,
      "memberSince": "2026-01-15T00:00:00Z"
    },
    "createdAt": "2026-01-15T00:00:00Z"
  }
}
```

### 2.2 Update Profile

```
PATCH /users/profile
Authorization: Bearer <token>
```

**Request Body (Multipart):**
```json
{
  "displayName": "NewName",
  "phone": "+919876543210",
  "avatar": "<file>"
}
```

### 2.3 Change Password

```
POST /users/change-password
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "currentPassword": "OldP@ss123",
  "newPassword": "NewP@ss456"
}
```

---

## 3. Wallet APIs

### 3.1 Get Wallet Balance

```
GET /wallet/balance
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "balance": 5000.00,
    "bonusBalance": 200.00,
    "totalDeposited": 20000.00,
    "totalWithdrawn": 10000.00,
    "totalWon": 15000.00,
    "totalLost": 20000.00,
    "pendingDeposits": 500.00,
    "pendingWithdrawals": 1000.00
  }
}
```

### 3.2 Get Transaction History

```
GET /wallet/transactions?page=1&limit=20&type=DEPOSIT&status=COMPLETED&from=2026-01-01&to=2026-02-21
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "type": "DEPOSIT",
        "amount": 1000.00,
        "balanceBefore": 4000.00,
        "balanceAfter": 5000.00,
        "status": "COMPLETED",
        "description": "UPI Deposit via QR",
        "createdAt": "2026-02-20T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

---

## 4. Deposit APIs (QR Scanner Based)

### 4.1 Get Available Payment QR Codes

```
GET /deposit/qr-codes
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "UPI - Primary",
      "type": "UPI",
      "qrCodeUrl": "https://s3.../qr1.png",
      "upiId": "abcrummy@upi"
    },
    {
      "id": "uuid",
      "name": "Bank Transfer",
      "type": "BANK",
      "bankDetails": {
        "bankName": "HDFC Bank",
        "accountNo": "XXXX1234",
        "ifsc": "HDFC00001",
        "holderName": "ABCRummy Pvt Ltd"
      }
    }
  ]
}
```

### 4.2 Submit Deposit Request

```
POST /deposit/request
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
```
paymentQrId: "uuid"            // Which QR code was used
amount: 1000
paymentMethod: "UPI"           // UPI, BANK_TRANSFER
utrNumber: "UTR123456789"     // Transaction reference number
screenshot: <file>             // Payment screenshot image
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "depositId": "uuid",
    "amount": 1000.00,
    "status": "PENDING",
    "message": "Deposit request submitted. Will be processed within 15 minutes."
  }
}
```

### 4.3 Get Deposit History

```
GET /deposit/history?page=1&limit=20&status=PENDING
Authorization: Bearer <token>
```

---

## 5. Withdrawal APIs

### 5.1 Request Withdrawal

```
POST /withdrawal/request
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "amount": 5000.00,
  "payoutMethod": "UPI",
  "payoutDetails": {
    "upiId": "user@upi"
  }
}
```

**OR for Bank Transfer:**
```json
{
  "amount": 5000.00,
  "payoutMethod": "BANK",
  "payoutDetails": {
    "accountNo": "1234567890",
    "ifsc": "HDFC0001234",
    "bankName": "HDFC Bank",
    "holderName": "John Doe"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "withdrawalId": "uuid",
    "amount": 5000.00,
    "status": "PENDING",
    "estimatedTime": "24-48 hours",
    "message": "Withdrawal request submitted for admin verification."
  }
}
```

**Validations:**
- Minimum withdrawal: ₹500
- Maximum per day: ₹50,000
- Balance must be sufficient
- No pending withdrawals (one at a time)
- Must have verified identity (optional: admin configurable)

### 5.2 Get Withdrawal History

```
GET /withdrawal/history?page=1&limit=20&status=COMPLETED
Authorization: Bearer <token>
```

### 5.3 Cancel Withdrawal (Only if PENDING)

```
POST /withdrawal/:id/cancel
Authorization: Bearer <token>
```

---

## 6. Game APIs

### 6.1 Get Available Games

```
GET /games
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Teen Patti",
      "slug": "teen-patti",
      "type": "CARD_GAME",
      "thumbnail": "https://s3.../teen-patti.png",
      "banner": "https://s3.../teen-patti-banner.png",
      "minBet": 10,
      "maxBet": 10000,
      "isActive": true,
      "onlinePlayers": 234,
      "currentRound": {
        "roundId": "uuid",
        "roundNumber": 1523,
        "status": "BETTING",
        "bettingEndsAt": "2026-02-21T17:30:00Z"
      }
    }
  ]
}
```

### 6.2 Get Game Details

```
GET /games/:slug
Authorization: Bearer <token>
```

### 6.3 Get Game Round History

```
GET /games/:slug/rounds?page=1&limit=50
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "rounds": [
      {
        "roundId": "uuid",
        "roundNumber": 1523,
        "result": { ... },       // Game-specific
        "totalBets": 45,
        "totalBetAmount": 15000,
        "createdAt": "2026-02-21T17:25:00Z"
      }
    ],
    "pagination": { ... }
  }
}
```

### 6.4 Get My Bet History for a Game

```
GET /games/:slug/my-bets?page=1&limit=20
Authorization: Bearer <token>
```

---

## 7. Betting APIs (REST Fallback — Primary via WebSocket)

### 7.1 Place Bet

```
POST /bets/place
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "gameRoundId": "uuid",
  "betType": "PLAYER_A",
  "amount": 500,
  "betData": {}              // Game-specific additional data
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "betId": "uuid",
    "gameRoundId": "uuid",
    "betType": "PLAYER_A",
    "amount": 500,
    "odds": 1.95,
    "potentialPayout": 975,
    "status": "PLACED"
  }
}
```

### 7.2 Get My Active Bets

```
GET /bets/active
Authorization: Bearer <token>
```

### 7.3 Get Bet History

```
GET /bets/history?page=1&limit=20&gameSlug=aviator&status=WON
Authorization: Bearer <token>
```

---

## 8. Notification APIs

### 8.1 Get Notifications

```
GET /notifications?page=1&limit=20&unreadOnly=true
Authorization: Bearer <token>
```

### 8.2 Mark as Read

```
PATCH /notifications/:id/read
Authorization: Bearer <token>
```

### 8.3 Mark All as Read

```
PATCH /notifications/read-all
Authorization: Bearer <token>
```

---

## 9. Admin APIs

All admin APIs require `role: ADMIN` or `role: SUPER_ADMIN`.

### 9.1 Dashboard

```
GET /admin/dashboard
Authorization: Bearer <admin_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalUsers": 15234,
      "activeUsers24h": 2341,
      "totalDeposits": 5000000.00,
      "totalWithdrawals": 3500000.00,
      "totalRevenue": 1500000.00,
      "pendingDeposits": 45,
      "pendingWithdrawals": 23
    },
    "gameStats": [
      {
        "gameSlug": "teen-patti",
        "totalRounds24h": 480,
        "totalBetVolume24h": 250000.00,
        "totalPayout24h": 230000.00,
        "housePnl24h": 20000.00,
        "activePlayers": 89
      }
    ],
    "recentActivity": [ ... ],
    "charts": {
      "revenue7d": [ ... ],
      "userGrowth30d": [ ... ]
    }
  }
}
```

### 9.2 User Management

```
GET    /admin/users?page=1&limit=20&search=john&status=ACTIVE
GET    /admin/users/:id
PATCH  /admin/users/:id/status     // Ban, suspend, activate
GET    /admin/users/:id/wallet
GET    /admin/users/:id/bets
POST   /admin/users/:id/credit     // Add balance
POST   /admin/users/:id/debit      // Remove balance
```

### 9.3 Deposit Management

```
GET    /admin/deposits?page=1&limit=20&status=PENDING
GET    /admin/deposits/:id
POST   /admin/deposits/:id/approve
POST   /admin/deposits/:id/reject
```

**Approve Request:**
```json
{
  "remarks": "Payment verified via UPI"
}
```

**Reject Request:**
```json
{
  "remarks": "Invalid screenshot, UTR does not match"
}
```

### 9.4 Withdrawal Management

```
GET    /admin/withdrawals?page=1&limit=20&status=PENDING
GET    /admin/withdrawals/:id
POST   /admin/withdrawals/:id/approve
POST   /admin/withdrawals/:id/reject
POST   /admin/withdrawals/:id/put-on-hold
```

**Approve Request:**
```json
{
  "remarks": "Payment sent",
  "paymentRef": "NEFT_REF_123456",
  "paymentProof": "<file>"          // Optional screenshot
}
```

### 9.5 Game Management

```
GET    /admin/games
GET    /admin/games/:slug
PATCH  /admin/games/:slug/config    // Update game config
POST   /admin/games/:slug/toggle    // Enable/disable game
POST   /admin/games/:slug/maintenance // Toggle maintenance mode
```

### 9.6 Game Controls (Result Rigging / Override)

```
GET    /admin/games/:slug/controls
POST   /admin/games/:slug/controls
PATCH  /admin/games/:slug/controls/:controlId
DELETE /admin/games/:slug/controls/:controlId
```

**Create Control:**
```json
{
  "controlType": "FORCE_RESULT",
  "config": {
    "targetRound": "next",         // "next" or specific roundId
    "result": {
      "winner": "PLAYER_A"        // Game-specific
    }
  },
  "expiresAt": "2026-02-22T00:00:00Z"
}
```

**Win Rate Control:**
```json
{
  "controlType": "WIN_RATE_CONTROL",
  "config": {
    "targetOutcome": "PLAYER_A",
    "winRate": 40,                 // percentage
    "sampleSize": 100              // over last N rounds
  }
}
```

**Player Limit Control:**
```json
{
  "controlType": "PLAYER_LIMIT",
  "config": {
    "targetUserId": "uuid",
    "maxWinPerDay": 5000,
    "maxWinPerRound": 1000
  }
}
```

### 9.7 Game Analytics

```
GET /admin/games/:slug/analytics?period=24h
GET /admin/games/:slug/analytics?period=7d
GET /admin/games/:slug/analytics?period=30d
GET /admin/games/:slug/analytics?from=2026-02-01&to=2026-02-21
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "period": "24h",
    "totalRounds": 480,
    "totalBets": 5400,
    "totalBetVolume": 540000.00,
    "totalPayout": 497000.00,
    "housePnl": 43000.00,
    "houseEdgeActual": 7.96,
    "uniquePlayers": 234,
    "averageBetSize": 100.00,
    "largestBet": 10000.00,
    "largestWin": 25000.00,
    "betDistribution": {
      "PLAYER_A": 2800,
      "PLAYER_B": 2400,
      "TIE": 200
    },
    "hourlyBreakdown": [
      { "hour": "00:00", "bets": 120, "volume": 12000, "pnl": 1500 },
      { "hour": "01:00", "bets": 95, "volume": 9500, "pnl": -500 }
    ],
    "topWinners": [
      { "userId": "uuid", "displayName": "Player1", "totalWon": 15000 }
    ],
    "topLosers": [
      { "userId": "uuid", "displayName": "Player2", "totalLost": 12000 }
    ]
  }
}
```

### 9.8 Payment QR Management

```
GET    /admin/payment-qrs
POST   /admin/payment-qrs               // Create new QR
PATCH  /admin/payment-qrs/:id           // Update QR
DELETE /admin/payment-qrs/:id           // Delete QR
POST   /admin/payment-qrs/:id/toggle   // Enable/disable
```

### 9.9 System Settings

```
GET    /admin/settings
PATCH  /admin/settings/:key
```

**Available Settings:**
```json
{
  "min_deposit": 100,
  "max_deposit": 100000,
  "min_withdrawal": 500,
  "max_withdrawal_per_day": 50000,
  "withdrawal_processing_hours": 24,
  "referral_bonus": 100,
  "signup_bonus": 50,
  "maintenance_mode": false,
  "maintenance_message": "We'll be back soon!",
  "force_update_version": "1.0.5"
}
```

### 9.10 Audit Logs

```
GET /admin/audit-logs?page=1&limit=50&action=admin.game.override&userId=xxx
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Your wallet balance is insufficient for this bet.",
    "statusCode": 400,
    "details": {
      "required": 500,
      "available": 200
    }
  }
}
```

### Standard Error Codes

| Code                        | HTTP Status | Description                            |
| --------------------------- | ----------- | -------------------------------------- |
| VALIDATION_ERROR            | 400         | Invalid request body/params            |
| UNAUTHORIZED                | 401         | Invalid or missing auth token          |
| FORBIDDEN                   | 403         | Insufficient permissions               |
| NOT_FOUND                   | 404         | Resource not found                     |
| DUPLICATE_ENTRY             | 409         | Resource already exists                |
| INSUFFICIENT_BALANCE        | 400         | Not enough wallet balance              |
| BETTING_CLOSED              | 400         | Round not accepting bets               |
| BET_LIMIT_EXCEEDED          | 400         | Bet amount out of allowed range        |
| WITHDRAWAL_LIMIT_EXCEEDED   | 400         | Daily withdrawal limit reached         |
| ACCOUNT_SUSPENDED           | 403         | User account is suspended/banned       |
| GAME_MAINTENANCE            | 503         | Game is under maintenance              |
| TWO_FA_REQUIRED             | 403         | 2FA verification needed                |
| RATE_LIMIT_EXCEEDED         | 429         | Too many requests                      |

---

> **Next:** See `05-ADMIN-PANEL.md` for admin panel features and wireframes.
