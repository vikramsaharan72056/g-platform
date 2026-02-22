# 🛡️ ABCRummy — Admin Panel Specification

## Overview

The Admin Panel is a web-based dashboard that provides complete control over the platform, users, games, and financial operations. Only users with `ADMIN` or `SUPER_ADMIN` roles can access it.

---

## Access Control (RBAC)

| Role          | Dashboard | Users | Deposits | Withdrawals | Games | Game Controls | Analytics | Settings | Audit Logs |
| ------------- | --------- | ----- | -------- | ----------- | ----- | ------------- | --------- | -------- | ---------- |
| SUPER_ADMIN   | ✅        | ✅    | ✅       | ✅          | ✅    | ✅            | ✅        | ✅       | ✅         |
| ADMIN         | ✅        | ✅    | ✅       | ✅          | ✅    | ❌            | ✅        | ❌       | View Only  |

---

## Module Breakdown

### 1. 📊 Dashboard (Home)

**Purpose:** At-a-glance overview of the entire platform's health and activity.

#### Key Metrics Cards
- **Total Users** (with growth % vs last period)
- **Active Users (24h)** (currently online users)
- **Total Revenue (Today/Week/Month)** (Deposits - Withdrawals)
- **Pending Deposits** (count + total amount)
- **Pending Withdrawals** (count + total amount)
- **Total Bet Volume (Today)**
- **House P&L (Today)** (across all games)

#### Charts
1. **Revenue Trend** — Line chart (7d / 30d / 90d)
2. **User Growth** — Area chart (daily new registrations)
3. **Game-wise Revenue Split** — Pie/Donut chart
4. **Bet Volume by Hour** — Bar chart (24h view)
5. **Deposit vs Withdrawal** — Stacked area chart

#### Real-Time Feed
- Live activity ticker showing:
  - New registrations
  - Large bets (> configurable threshold)
  - Big wins
  - Deposit/withdrawal requests
  - Admin actions

#### Quick Actions
- View pending deposits
- View pending withdrawals
- Toggle maintenance mode
- Jump to any game's live view

---

### 2. 👥 User Management

**Purpose:** Full control over platform users.

#### User List View
| Column       | Features                                    |
| ------------ | ------------------------------------------- |
| User ID      | Clickable → User detail page                |
| Display Name | Searchable                                  |
| Email        | Searchable                                  |
| Phone        | Searchable                                  |
| Balance      | Current wallet balance                      |
| Status       | ACTIVE / SUSPENDED / BANNED (filterable)    |
| KYC Status   | NONE / PENDING / VERIFIED / REJECTED        |
| 2FA          | Enabled/Disabled icon                       |
| Joined       | Registration date (sortable)                |
| Last Login   | Last login timestamp (sortable)             |
| Actions      | View / Suspend / Ban / Credit / Debit       |

#### Search & Filters
- Text search: email, display name, phone, user ID
- Filter by: status, KYC status, 2FA enabled, registration date range
- Sort by: balance, joined date, last login, total bet volume

#### User Detail Page
```
┌─────────────────────────────────────────────────────────────────┐
│  User Profile                                    [Ban] [Suspend]│
│  ┌────────┐                                                     │
│  │ Avatar │  JohnDoe                                            │
│  │        │  john@example.com | +91 98765 43210                 │
│  └────────┘  Status: ACTIVE | KYC: VERIFIED | 2FA: ON          │
│              Member since: Jan 15, 2026                         │
├─────────────────────────────────────────────────────────────────┤
│  Quick Stats                                                    │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Balance  │ │ Deposited │ │ Withdrawn│ │ Total Bets       │  │
│  │ ₹5,000   │ │ ₹20,000   │ │ ₹10,000  │ │ ₹50,000          │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Tabs: [Transactions] [Bets] [Deposits] [Withdrawals] [Login]  │
│                                                                  │
│  > Transaction History Table                                     │
│  > Bet History with Game Filter                                  │
│  > Deposit Requests with Status                                  │
│  > Withdrawal Requests with Status                               │
│  > Login History (IP, Device, Location, Time)                    │
├─────────────────────────────────────────────────────────────────┤
│  Admin Actions                                                   │
│  [Credit Balance] [Debit Balance] [Reset Password]              │
│  [Force Logout] [Reset 2FA] [Export Data]                       │
└─────────────────────────────────────────────────────────────────┘
```

#### Admin Actions on User
| Action          | Description                                  | Requires Reason |
| --------------- | -------------------------------------------- | --------------- |
| Suspend         | Temporary lock (can be reversed)             | ✅              |
| Ban             | Permanent lock (funds can be settled)        | ✅              |
| Activate        | Restore suspended/banned account             | ✅              |
| Credit Balance  | Add money to user's wallet                   | ✅              |
| Debit Balance   | Remove money from user's wallet              | ✅              |
| Reset Password  | Send password reset email                    | ❌              |
| Reset 2FA       | Disable 2FA for the user                     | ✅              |
| Force Logout    | Invalidate all sessions                      | ❌              |

---

### 3. 💰 Deposit Management

**Purpose:** Review, approve, or reject deposit requests submitted by users via QR scanner.

#### Deposit Queue View
```
┌─────────────────────────────────────────────────────────────────┐
│  Deposit Queue                        [Pending: 45 | ₹2,35,000]│
│                                                                  │
│  Filters: [Status ▼] [Payment Method ▼] [Date Range] [Search]  │
│                                                                  │
│  ┌────┬───────────┬────────┬───────────┬──────────┬─────────┐   │
│  │ #  │ User      │ Amount │ UTR       │ Method   │ Status  │   │
│  ├────┼───────────┼────────┼───────────┼──────────┼─────────┤   │
│  │ 1  │ JohnDoe   │ ₹1,000 │ UTR12345 │ UPI      │ PENDING │   │
│  │ 2  │ Player123 │ ₹5,000 │ UTR67890 │ Bank     │ PENDING │   │
│  └────┴───────────┴────────┴───────────┴──────────┴─────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### Deposit Review Page
```
┌─────────────────────────────────────────────────────────────────┐
│  Deposit Request #DEP-2026-0045                                 │
│                                                                  │
│  User: JohnDoe (john@example.com)                               │
│  Amount: ₹1,000.00                                              │
│  Payment Method: UPI                                            │
│  UTR Number: UTR1234567890                                      │
│  QR Used: "UPI - Primary" (abcrummy@upi)                       │
│  Submitted: Feb 21, 2026 at 5:15 PM                            │
│                                                                  │
│  ┌─────────────────────────────────────┐                        │
│  │                                     │                        │
│  │   Payment Screenshot                │                        │
│  │   (Zoomable/Downloadable)           │                        │
│  │                                     │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
│  Admin Remarks: [________________________________]              │
│                                                                  │
│  [✅ APPROVE]                    [❌ REJECT]                     │
└─────────────────────────────────────────────────────────────────┘
```

#### Workflow
1. User scans admin's QR → makes payment → enters UTR → uploads screenshot
2. Request appears in admin deposit queue (real-time via WebSocket)
3. Admin reviews screenshot, verifies UTR in bank app
4. Admin approves → User's wallet credited instantly (notification sent)
5. Admin rejects → User notified with reason

---

### 4. 💸 Withdrawal Management

**Purpose:** Verify and process withdrawal requests.

#### Withdrawal Queue View
Similar layout to Deposit Queue with additional columns:
- Payout Method (UPI / Bank)
- Payout Details (UPI ID or Account No.)
- User's total bet volume (for fraud check)
- User's deposit-to-withdrawal ratio

#### Withdrawal Review Page
```
┌─────────────────────────────────────────────────────────────────┐
│  Withdrawal Request #WD-2026-0023                               │
│                                                                  │
│  User: JohnDoe (john@example.com)                               │
│  Amount: ₹5,000.00                                              │
│  Payout Method: UPI                                             │
│  UPI ID: john@upi                                               │
│  Submitted: Feb 21, 2026 at 4:30 PM                            │
│                                                                  │
│  ── User Verification Summary ──                                │
│  Total Deposited: ₹20,000    Total Withdrawn: ₹10,000          │
│  Total Bet Volume: ₹50,000   Win/Loss Ratio: 48%               │
│  Account Age: 37 days        KYC: VERIFIED                     │
│  Last 7d Activity: 45 rounds played                             │
│  ⚠️  Flags: None                                                │
│                                                                  │
│  Admin Remarks: [________________________________]              │
│  Payment Reference: [________________________________]          │
│  Payment Proof: [Upload Screenshot]                              │
│                                                                  │
│  [✅ APPROVE] [⏸️ PUT ON HOLD] [❌ REJECT]                      │
└─────────────────────────────────────────────────────────────────┘
```

#### Fraud Detection Flags
| Flag                          | Trigger                                          |
| ----------------------------- | ------------------------------------------------ |
| 🔴 High Risk                 | Withdrawal > 80% of total deposits               |
| 🟡 Medium Risk               | First withdrawal within 24h of signup            |
| 🟡 Low Bet Volume            | Withdrawal amount > total bet volume              |
| 🔴 Rapid Deposit-Withdraw    | Deposit and withdrawal within 1 hour             |
| 🟡 Multiple UPIs             | Different UPI IDs used for withdrawals           |
| 🔴 Suspicious Win Rate       | Win rate > 90% over 50+ rounds                  |

---

### 5. 🎮 Game Management

**Purpose:** Configure, monitor, and control all games.

#### Game List View
```
┌─────────────────────────────────────────────────────────────────┐
│  Games                                                          │
│                                                                  │
│  ┌─────────────┬────────┬──────────┬─────────┬────────────────┐ │
│  │ Game        │ Status │ Players  │ PnL 24h │ Actions        │ │
│  ├─────────────┼────────┼──────────┼─────────┼────────────────┤ │
│  │ Teen Patti  │ 🟢 ON  │ 234      │ +₹20K   │ [Config] [Live]│ │
│  │ Aviator     │ 🟢 ON  │ 567      │ +₹45K   │ [Config] [Live]│ │
│  │ 7 Up Down   │ 🟢 ON  │ 189      │ +₹12K   │ [Config] [Live]│ │
│  │ Dragon Tiger│ 🔧 MAINT│ 0       │ ₹0      │ [Config] [Live]│ │
│  │ Poker       │ 🟢 ON  │ 123      │ +₹30K   │ [Config] [Live]│ │
│  └─────────────┴────────┴──────────┴─────────┴────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### Game Configuration Page
```
┌─────────────────────────────────────────────────────────────────┐
│  Teen Patti — Configuration                     [Save Changes]  │
│                                                                  │
│  ── Basic Settings ──                                           │
│  Min Bet:          [₹ 10    ]                                   │
│  Max Bet:          [₹ 10,000]                                   │
│  Round Duration:   [60  ] seconds                               │
│  Betting Window:   [30  ] seconds                               │
│  House Edge:       [5.0 ] %                                     │
│                                                                  │
│  ── Status ──                                                   │
│  Active:           [🔘 ON / ○ OFF]                              │
│  Maintenance Mode: [○ ON / 🔘 OFF]                              │
│  Maintenance Msg:  [________________________________]           │
│                                                                  │
│  ── Game-Specific Config ──                                     │
│  (Varies by game — e.g., deck count, number of positions, etc.) │
└─────────────────────────────────────────────────────────────────┘
```

---

### 6. 🎛️ Game Controls (Result Override)

**Purpose:** Allows SUPER_ADMIN to control game outcomes. This is the most critical admin feature.

> ⚠️ **Access:** SUPER_ADMIN only. All actions are logged in audit trail.

#### Control Types

##### A. Force Next Round Result
```
┌─────────────────────────────────────────────────────────────────┐
│  Force Result — Teen Patti                                      │
│                                                                  │
│  Target: [● Next Round / ○ Specific Round ID: _________ ]      │
│                                                                  │
│  Winner: [● Player A / ○ Player B / ○ Tie]                     │
│                                                                  │
│  Force Specific Cards: [○ Yes / ● No]                           │
│  Player A Cards: [__] [__] [__]    (e.g., AH, KH, QH)         │
│  Player B Cards: [__] [__] [__]                                 │
│                                                                  │
│  Reason: [________________________________]                     │
│                                                                  │
│  [Apply Control]                                                │
│                                                                  │
│  ⚠️ This action will be logged in the audit trail.             │
└─────────────────────────────────────────────────────────────────┘
```

##### B. Win Rate Control
```
┌─────────────────────────────────────────────────────────────────┐
│  Win Rate Control — Aviator                                     │
│                                                                  │
│  Max Crash Point:        [10.00]x                               │
│  Target House Edge:      [5   ] %                               │
│  Low Crash Probability:  [60  ] %  (crash below 2x)            │
│  Medium Crash Probability: [30] %  (crash between 2x-5x)       │
│  High Crash Probability:   [10] %  (crash above 5x)            │
│                                                                  │
│  Status: [🔘 Active / ○ Inactive]                               │
│  Expires: [________ ] (optional date/time)                      │
│                                                                  │
│  [Save Control]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

##### C. Player-Specific Limits
```
┌─────────────────────────────────────────────────────────────────┐
│  Player Limit Control                                           │
│                                                                  │
│  Target User: [Search by email/name/ID ▼]                      │
│                                                                  │
│  Max Win Per Round:  [₹ 1,000 ]                                │
│  Max Win Per Day:    [₹ 5,000 ]                                │
│  Max Win Per Week:   [₹ 20,000]                                │
│  Apply To Games:     [☑ All / ☐ Teen Patti / ☐ Aviator / ...]  │
│                                                                  │
│  Status: [🔘 Active / ○ Inactive]                               │
│  Expires: [________] (optional)                                 │
│                                                                  │
│  [Save Control]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Active Controls Dashboard
```
┌─────────────────────────────────────────────────────────────────┐
│  Active Game Controls                                           │
│                                                                  │
│  ┌────┬─────────────┬────────────────┬──────────┬─────────────┐ │
│  │ #  │ Game        │ Control Type   │ Status   │ Actions     │ │
│  ├────┼─────────────┼────────────────┼──────────┼─────────────┤ │
│  │ 1  │ Teen Patti  │ Force Result   │ Pending  │ [Edit] [Del]│ │
│  │ 2  │ Aviator     │ Win Rate       │ Active   │ [Edit] [Del]│ │
│  │ 3  │ All Games   │ Player Limit   │ Active   │ [Edit] [Del]│ │
│  └────┴─────────────┴────────────────┴──────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. 📈 Analytics

**Purpose:** Deep insights into platform performance.

#### Analytics Sections

##### A. Revenue Analytics
- Total revenue by period (daily, weekly, monthly)
- Revenue by game
- Revenue by payment method
- Profit margin trends
- Revenue forecasting

##### B. Game Analytics (Per Game)
- Round count and frequency
- Bet volume and average bet size
- Win/loss distribution
- House edge (theoretical vs actual)
- Popular bet types
- Peak hours heatmap
- Player retention per game

##### C. User Analytics
- Registration trends
- Active user metrics (DAU, WAU, MAU)
- User lifetime value (LTV)
- Churn rate
- Geographic distribution
- Device/OS distribution
- Deposit-to-bet conversion funnel

##### D. Financial Analytics
- Deposit trends and method distribution
- Withdrawal trends
- Average deposit/withdrawal amounts
- Processing time metrics
- Failed transaction analysis
- Cash flow summary

##### E. Risk Analytics
- Unusual win patterns
- High-roller tracking
- Suspicious activity flags
- Deposit-withdrawal ratio anomalies

---

### 8. ⚙️ System Settings

**Purpose:** Platform-wide configuration.

#### Settings Categories

##### Financial Settings
| Setting                    | Type    | Default    | Description                              |
| -------------------------- | ------- | ---------- | ---------------------------------------- |
| min_deposit                | Number  | ₹100       | Minimum deposit amount                   |
| max_deposit                | Number  | ₹100,000   | Maximum deposit amount                   |
| min_withdrawal             | Number  | ₹500       | Minimum withdrawal amount                |
| max_withdrawal_per_day     | Number  | ₹50,000    | Maximum withdrawal per day per user      |
| withdrawal_cooldown_hours  | Number  | 24         | Hours between withdrawal requests        |

##### Bonus Settings
| Setting                    | Type    | Default    | Description                              |
| -------------------------- | ------- | ---------- | ---------------------------------------- |
| signup_bonus               | Number  | ₹50        | Bonus on new registration                |
| referral_bonus             | Number  | ₹100       | Bonus for referrer                       |
| referral_bonus_for_referee | Number  | ₹50        | Bonus for referred user                  |
| first_deposit_bonus_pct    | Number  | 100%       | Bonus percentage on first deposit        |
| first_deposit_bonus_max    | Number  | ₹500       | Maximum first deposit bonus              |

##### Platform Settings
| Setting                    | Type    | Default    | Description                              |
| -------------------------- | ------- | ---------- | ---------------------------------------- |
| maintenance_mode           | Boolean | false      | Global maintenance mode                  |
| maintenance_message        | String  | —          | Message shown during maintenance         |
| force_update_version       | String  | —          | Force users to update below this version |
| support_email              | String  | —          | Support email address                    |
| support_phone              | String  | —          | Support phone number                     |

##### Security Settings
| Setting                    | Type    | Default    | Description                              |
| -------------------------- | ------- | ---------- | ---------------------------------------- |
| max_login_attempts         | Number  | 5          | Before account lockout                   |
| lockout_duration_minutes   | Number  | 30         | Duration of lockout                      |
| session_timeout_minutes    | Number  | 60         | JWT token expiry                         |
| require_kyc_for_withdrawal | Boolean | false      | Whether KYC is needed for withdrawals    |

---

### 9. 📝 Audit Logs

**Purpose:** Complete trail of all admin actions.

```
┌─────────────────────────────────────────────────────────────────┐
│  Audit Logs                                                     │
│                                                                  │
│  Filters: [Admin ▼] [Action Type ▼] [Date Range] [Search]      │
│                                                                  │
│  ┌──────────────────┬────────────┬──────────────────┬──────────┐│
│  │ Timestamp        │ Admin      │ Action           │ Details  ││
│  ├──────────────────┼────────────┼──────────────────┼──────────┤│
│  │ Feb 21 5:25 PM   │ SuperAdmin │ deposit.approve  │ [View]   ││
│  │ Feb 21 5:20 PM   │ SuperAdmin │ game.force_result│ [View]   ││
│  │ Feb 21 5:15 PM   │ Admin1     │ user.suspend     │ [View]   ││
│  │ Feb 21 5:10 PM   │ SuperAdmin │ withdraw.approve │ [View]   ││
│  └──────────────────┴────────────┴──────────────────┴──────────┘│
│                                                                  │
│  [Export CSV]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### 10. 🖥️ Live Game Monitor

**Purpose:** Real-time monitoring of active game rounds.

```
┌─────────────────────────────────────────────────────────────────┐
│  Live Game Monitor — Teen Patti                                 │
│                                                                  │
│  Round #1523                    Status: 🟡 BETTING (15s left)   │
│  Players: 234                   Total Bets: ₹45,000             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Bet Distribution (Live)                                     │ │
│  │                                                             │ │
│  │ Player A:  ████████████████░░░░  65% (₹29,250)             │ │
│  │ Player B:  ████████░░░░░░░░░░░░  30% (₹13,500)             │ │
│  │ Tie:       █░░░░░░░░░░░░░░░░░░░   5% (₹2,250)             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Recent Bets (Live Stream):                                     │
│  • JohnDoe bet ₹500 on Player A (5s ago)                       │
│  • Player123 bet ₹1,000 on Player B (8s ago)                   │
│  • HighRoller bet ₹10,000 on Player A (12s ago)                │
│                                                                  │
│  [Force Result Next Round]  [Pause Game]  [Cancel Round]        │
└─────────────────────────────────────────────────────────────────┘
```

---

> **Next:** See `06-EXECUTION-PLAN.md` for the development timeline and sprint breakdown.
