---
description: End-to-end testing workflow for the Rummy Live app (API + Admin + Mobile)
---

# Rummy Live — Full App Testing Workflow

This workflow validates the entire Rummy Live stack: **API Server**, **Admin Panel**, and **Mobile App (Web mode)**.

---

## Prerequisites

- PostgreSQL running locally on port **5432** (via Docker or native install)
- Node.js 18+ installed
- npm installed
- All three projects have `node_modules` installed

---

## Phase 0: Environment Setup

### 0.1 Start PostgreSQL (if not running)

```bash
# From apps/rummy-live/api
docker compose up -d rummy-postgres
```

Wait ~5 seconds for PostgreSQL to be healthy.

### 0.2 Reset Database (Clean Slate)

```bash
# From apps/rummy-live/api
npx prisma db push --force-reset
```

This will drop all tables and recreate them from the Prisma schema. Confirm when prompted.

### 0.3 Delete Local SQLite Data (if present)

```bash
# From apps/rummy-live/api/data
# Windows:
del /Q rummy-live.db rummy-live.db-shm rummy-live.db-wal 2>NUL
# macOS/Linux:
# rm -f rummy-live.db rummy-live.db-shm rummy-live.db-wal
```

---

## Phase 1: Start All Services

### 1.1 Start API Server (Port 3401)

// turbo
```bash
# From apps/rummy-live/api
npm run dev
```

**Expected Output:**
```
Rummy Live API listening on http://localhost:3401
```

**Verify:** `curl http://localhost:3401/health` should return `{"data":{"ok":true,"service":"rummy-live-api",...}}`

### 1.2 Start Admin Panel (Port 5400)

// turbo
```bash
# From apps/rummy-live/admin
npm run dev
```

**Expected Output:**
```
VITE v6.x.x ready in XXX ms
Local: http://localhost:5400/
```

### 1.3 Start Mobile App — Web Mode (Port 8081)

// turbo
```bash
# From apps/rummy-live/mobile
npx expo start --web --port 8081
```

**Expected Output:**
```
Web is waiting on http://localhost:8081
```

> **Important:** Make sure `mobile/src/constants/Config.ts` has `API_URL` pointing to `http://localhost:3401` (or the correct API URL). If it points to a dev tunnel, update it for local testing.

---

## Phase 2: API Health & Auth Testing

### 2.1 Health Check

```bash
curl http://localhost:3401/health
```

**Expected:** `{"data":{"ok":true,"service":"rummy-live-api",...}}`

### 2.2 Guest Login

```bash
curl -X POST http://localhost:3401/auth/guest-login -H "Content-Type: application/json" -d "{\"name\":\"TestAdmin\"}"
```

**Expected:** Response with `{"data":{"token":"<JWT>","user":{"userId":"<UUID>","name":"TestAdmin"}}}`

**Save the token** for subsequent API calls:
```bash
set TOKEN=<paste_token_here>
```

### 2.3 Get Tables (Empty)

```bash
curl http://localhost:3401/tables
```

**Expected:** `{"data":[]}` (empty since DB was just reset)

### 2.4 Get Wallet

```bash
curl http://localhost:3401/wallet/me -H "Authorization: Bearer %TOKEN%"
```

**Expected:** Wallet data with initial balance (default ₹10,000)

---

## Phase 3: Admin Panel Testing

Open **http://localhost:5400** in a browser.

### 3.1 Login Page

- [ ] Page loads with "Rummy Live" branding and "Admin Control Panel" subtitle
- [ ] Inter font is rendering (smooth, modern typography)
- [ ] Dark theme with purple accent color (#6c5ce7)
- [ ] Email field and Password field are present
- [ ] Enter a name (e.g., "AdminUser") in the email field and any password
- [ ] Click "Sign In"
- [ ] Should redirect to the Dashboard

### 3.2 Dashboard

- [ ] Dashboard loads showing stat cards (Total Users, Active Users, etc.)
- [ ] Quick action buttons are visible
- [ ] Navigation sidebar is visible with all menu items:
  - Dashboard, Users, Deposits, Withdrawals, Games, Game Controls, Analytics, Audit Logs, Settings, Live Monitor

### 3.3 Navigation Check — Visit Each Page

- [ ] **Users** (`/users`) — Shows tables list (mapped as "users" from API)
- [ ] **Deposits** (`/deposits`) — Shows wallet transactions mapped as deposits
- [ ] **Withdrawals** (`/withdrawals`) — Shows empty state (not implemented for rummy-live)
- [ ] **Games** (`/games`) — Shows tables as games
- [ ] **Game Controls** (`/game-controls`) — Game configuration page
- [ ] **Analytics** (`/analytics`) — Analytics charts/stats
- [ ] **Audit Logs** (`/audit-logs`) — Audit log table
- [ ] **Settings** (`/settings`) — Settings page
- [ ] **Live Monitor** (`/live-monitor`) — Live game monitoring (may show "Loading games...")

### 3.4 Logout

- [ ] Click "Logout" in the sidebar footer
- [ ] Redirects to login page
- [ ] Cannot access dashboard without logging in again

---

## Phase 4: Mobile App Testing (Web Mode)

Open **http://localhost:8081** in a browser (or a second browser window).

### 4.1 Login Screen

- [ ] "Rummy Live" title with ♠ spade icon
- [ ] "Premium 13-Card Rummy Experience" subtitle
- [ ] "Display Name" input field
- [ ] "Enter Lobby" button
- [ ] Enter name "Player_A" and click "Enter Lobby"
- [ ] Should navigate to the Lobby screen
- [ ] Console should show "Connected to socket"

### 4.2 Lobby Screen

- [ ] "Active Tables" heading is visible
- [ ] Wallet balance is displayed (should be ₹10,000 or initial balance)
- [ ] "+ FREE ₹500" top-up button is visible
- [ ] "+ New Table" button is visible
- [ ] Table list is empty (fresh database)

### 4.3 Create a Table

- [ ] Click "+ New Table"
- [ ] A new table should be created
- [ ] Player A should automatically enter the game room
- [ ] "Waiting for players" message should appear
- [ ] Player A should see their seat info

### 4.4 Second Player Joins

Open a **second browser window/incognito** at `http://localhost:8081`:

- [ ] Login as "Player_B"
- [ ] The lobby should show the table created by Player_A
- [ ] Click "Join Table" on the table
- [ ] Player_B enters the game room
- [ ] Both players should see each other in the seats

### 4.5 Start Game (Host Only)

Back in Player_A's window:

- [ ] "Start Game" button should now be visible (since 2 players are in)
- [ ] Click "Start Game"
- [ ] Both players see the game board
- [ ] "Your Hand" section shows 13 cards for the current turn player
- [ ] Joker card is visible
- [ ] Open pile and closed pile are visible

### 4.6 Game Play — Draw & Discard

For the player whose turn it is:

1. **Draw:**
   - [ ] Click "BACK" (closed pile) to draw from the closed deck
   - [ ] OR click the top card of the open pile to draw from open
   - [ ] Hand should now show 14 cards

2. **Discard:**
   - [ ] Select a card from hand by clicking it
   - [ ] Click "Discard" button
   - [ ] The card moves to the open pile
   - [ ] Turn passes to the other player

3. **Repeat** for a few turns to verify the turn-based flow works.

### 4.7 Game Actions — Drop

- [ ] During your turn (before drawing), you can click "Drop"
- [ ] Select drop type (First Drop / Middle Drop)
- [ ] Points are deducted according to drop type
- [ ] Game continues with remaining players (or ends if only 1 left)

### 4.8 Game Actions — Declare

- [ ] During your turn, after drawing (14 cards in hand), click "Declare"
- [ ] The system validates the hand
- [ ] If valid: Player wins, scores update, game ends
- [ ] If invalid: Player gets penalty points, game ends
- [ ] Both players should see the result

### 4.9 Post-Game

- [ ] Results screen shows winner/loser and points
- [ ] Players return to lobby or can play again
- [ ] Wallet balances updated based on win/loss

---

## Phase 5: Cross-System Verification

### 5.1 Admin Sees Game Activity

After playing a game in the mobile app:

- [ ] Go to Admin Panel → **Dashboard** — Stats should update (users count, etc.)
- [ ] Go to Admin Panel → **Games** — The table should be listed
- [ ] Go to Admin Panel → **Audit Logs** — Game actions should appear (TABLE_CREATE, GAME_START, etc.)
- [ ] Go to Admin Panel → **Deposits** — Wallet transactions from the game should appear

### 5.2 Wallet Consistency

- [ ] Mobile shows updated wallet balance after game
- [ ] Admin panel shows same wallet transactions
- [ ] API returns correct balance: `curl http://localhost:3401/wallet/me -H "Authorization: Bearer %TOKEN%"`

### 5.3 Real-Time Updates

- [ ] When Player_B joins a table, Player_A sees the update immediately (via WebSocket)
- [ ] When a turn is taken, the other player's board updates in real-time
- [ ] Admin Live Monitor shows connection status

---

## Phase 6: Edge Cases & Error Handling

### 6.1 Auth Errors

- [ ] Try accessing API without token: `curl http://localhost:3401/wallet/me` → Should return 401
- [ ] Try invalid token: Should return 401
- [ ] Admin panel redirects to login on 401

### 6.2 Game Rules Enforcement

- [ ] Cannot draw twice in a turn
- [ ] Cannot discard without drawing first
- [ ] Cannot declare without drawing (must have 14 cards)
- [ ] Cannot join a full table (max players reached)
- [ ] Turn timeout triggers auto-drop after 30 seconds

### 6.3 Disconnection Recovery

- [ ] Close a player's browser tab during a game
- [ ] The other player should see the disconnected status
- [ ] Reopening and logging in again + reclaim seat should restore the game state

---

## Phase 7: Automated E2E Test (Optional)

If you want to run the Playwright-based automated tests:

```bash
# From apps/rummy-live/e2e
# Make sure both API (port 3401) and Mobile Web (port 8081) are running
npx playwright test
```

This runs the `rummy-flow.spec.ts` which automates:
- Two-player login
- Table creation and joining
- Game start
- Multiple draw/discard turns
- Final declaration

**View test report:**
```bash
npx playwright show-report
```

---

## Ports Summary

| Service       | Port  | URL                          |
|--------------|-------|------------------------------|
| PostgreSQL   | 5432  | `localhost:5432`             |
| API Server   | 3401  | `http://localhost:3401`      |
| Admin Panel  | 5400  | `http://localhost:5400`      |
| Mobile (Web) | 8081  | `http://localhost:8081`      |
| Redis        | 6379  | `localhost:6379` (optional)  |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API won't start | Check PostgreSQL is running: `docker compose up -d rummy-postgres` |
| Admin proxy errors | Verify `vite.config.ts` proxy target matches API URL |
| Mobile can't connect | Check `Config.ts` → `API_URL` points to `http://localhost:3401` |
| Socket not connecting | Ensure CORS is enabled on API (`cors()` middleware) |
| Database errors | Run `npx prisma db push` from `apps/rummy-live/api` |
| Port already in use | Kill existing process or use a different port |
| Wallet shows 0 | Use "+ FREE ₹500" button in mobile to top up |
