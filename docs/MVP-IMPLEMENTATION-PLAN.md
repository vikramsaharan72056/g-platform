# 🎯 ABCRummy — MVP Implementation Plan (Single-Day Sprint)

## 🏁 MVP Goal
Get a **working backend** with:
1. ✅ Project scaffolded (NestJS backend + Admin panel)
2. ✅ Database schema deployed with Prisma
3. ✅ Authentication (Register + Login + JWT)
4. ✅ Wallet system (create, balance inquiry)
5. ✅ One working game engine (7 Up Down — simplest game)
6. ✅ Admin panel scaffolded with login

---

## Step-by-Step Execution Checklist

### 🔹 STEP 1: Project Scaffolding & Monorepo Setup
**Status:** ⬜ Not Started

- [ ] 1.1 Create root `package.json` with npm workspaces
- [ ] 1.2 Initialize NestJS backend in `packages/api/`
- [ ] 1.3 Initialize React (Vite) admin panel in `packages/admin/`
- [ ] 1.4 Create Docker Compose for PostgreSQL + Redis
- [ ] 1.5 Create environment config files
- [ ] 1.6 Verify all projects start without errors

---

### 🔹 STEP 2: Database Schema with Prisma
**Status:** ⬜ Not Started

- [ ] 2.1 Install Prisma in backend
- [ ] 2.2 Create complete Prisma schema (all models from docs)
- [ ] 2.3 Configure PostgreSQL connection
- [ ] 2.4 Run initial migration
- [ ] 2.5 Create seed script with initial data (admin user, games)

---

### 🔹 STEP 3: Authentication Module
**Status:** ⬜ Not Started

- [ ] 3.1 Install auth dependencies (bcrypt, passport, jwt)
- [ ] 3.2 Create Auth module, controller, service
- [ ] 3.3 Implement POST `/auth/register` — create user + wallet
- [ ] 3.4 Implement POST `/auth/login` — validate credentials, return JWT
- [ ] 3.5 Create JWT strategy and AuthGuard
- [ ] 3.6 Create Role guard (PLAYER, ADMIN, SUPER_ADMIN)
- [ ] 3.7 Implement GET `/auth/profile` — return current user
- [ ] 3.8 Setup Swagger API docs

---

### 🔹 STEP 4: User Module
**Status:** ⬜ Not Started

- [ ] 4.1 Create Users module, controller, service
- [ ] 4.2 Implement GET `/users/profile` — get full profile
- [ ] 4.3 Implement PATCH `/users/profile` — update display name, phone
- [ ] 4.4 Implement admin GET `/admin/users` — list users with pagination

---

### 🔹 STEP 5: Wallet Module
**Status:** ⬜ Not Started

- [ ] 5.1 Create Wallet module, controller, service
- [ ] 5.2 Implement GET `/wallet/balance` — get user wallet balance
- [ ] 5.3 Implement GET `/wallet/transactions` — transaction history with pagination
- [ ] 5.4 Implement internal wallet credit/debit methods with optimistic locking
- [ ] 5.5 Implement admin POST `/admin/wallet/credit` — manual credit
- [ ] 5.6 Implement admin POST `/admin/wallet/debit` — manual debit

---

### 🔹 STEP 6: Deposit System (QR-based)
**Status:** ⬜ Not Started

- [ ] 6.1 Create Deposit module
- [ ] 6.2 Implement GET `/deposit/qr-codes` — get active payment QR codes
- [ ] 6.3 Implement POST `/deposit/request` — submit deposit request (amount, UTR, screenshot)
- [ ] 6.4 Implement GET `/deposit/history` — user's deposit history
- [ ] 6.5 Implement admin GET `/admin/deposits` — pending deposits queue
- [ ] 6.6 Implement admin POST `/admin/deposits/:id/approve` — approve + credit wallet
- [ ] 6.7 Implement admin POST `/admin/deposits/:id/reject` — reject with reason

---

### 🔹 STEP 7: Withdrawal System
**Status:** ⬜ Not Started

- [ ] 7.1 Create Withdrawal module
- [ ] 7.2 Implement POST `/withdrawal/request` — submit request (amount, UPI/bank)
- [ ] 7.3 Implement GET `/withdrawal/history` — user's withdrawal history
- [ ] 7.4 Implement admin GET `/admin/withdrawals` — pending queue
- [ ] 7.5 Implement admin POST `/admin/withdrawals/:id/approve`
- [ ] 7.6 Implement admin POST `/admin/withdrawals/:id/reject`

---

### 🔹 STEP 8: Game Engine Foundation
**Status:** ⬜ Not Started

- [ ] 8.1 Create base game engine service (abstract class)
- [ ] 8.2 Implement round lifecycle state machine (WAITING → BETTING → LOCKED → PLAYING → RESULT → SETTLED)
- [ ] 8.3 Create WebSocket gateway for real-time game events
- [ ] 8.4 Implement bet placement service (validate balance, deduct, create bet record)
- [ ] 8.5 Implement bet settlement service (calculate payouts, credit winners)

---

### 🔹 STEP 9: First Game — 7 Up Down (Simplest)
**Status:** ⬜ Not Started

- [ ] 9.1 Implement 7 Up Down game engine (extends base engine)
- [ ] 9.2 Implement dice roll logic (two dice, outcomes: Down/Lucky7/Up)
- [ ] 9.3 Implement payout calculation (Down: 2x, Lucky 7: 5x, Up: 2x)
- [ ] 9.4 WebSocket events: round_start, betting_open, betting_closed, result, settled
- [ ] 9.5 Connect to scheduled round system (auto-start rounds)

---

### 🔹 STEP 10: Admin Panel MVP
**Status:** ⬜ Not Started

- [ ] 10.1 Setup Vite + React + React Router
- [ ] 10.2 Create login page (connects to backend auth)
- [ ] 10.3 Create dashboard layout with sidebar navigation
- [ ] 10.4 Create user list page
- [ ] 10.5 Create deposit queue page
- [ ] 10.6 Create withdrawal queue page

---

## Priority Order (What we build first → last)

```
STEP 1 (Scaffolding) → STEP 2 (Database) → STEP 3 (Auth) → STEP 4 (Users) 
→ STEP 5 (Wallet) → STEP 6 (Deposits) → STEP 7 (Withdrawals) 
→ STEP 8 (Game Engine) → STEP 9 (7 Up Down) → STEP 10 (Admin Panel)
```

---

## Technology Choices for MVP

| Component         | Choice              | Why                                    |
|-------------------|---------------------|----------------------------------------|
| Backend           | NestJS              | As per requirements                    |
| Database          | PostgreSQL (Docker) | As per requirements                    |
| ORM               | Prisma              | As per requirements                    |
| Cache             | Redis (Docker)      | For game state, sessions               |
| Auth              | Passport + JWT      | Industry standard for NestJS           |
| Real-time         | Socket.IO           | Built-in NestJS support                |
| Admin Panel       | React + Vite        | Fast dev, Ant Design for UI            |
| API Docs          | Swagger / OpenAPI   | Built-in NestJS support                |

---

## Current Progress Tracker

| Step | Description           | Status         | Notes |
|------|-----------------------|----------------|-------|
| 1    | Project Scaffolding   | ⬜ Not Started |       |
| 2    | Database Schema       | ⬜ Not Started |       |
| 3    | Authentication        | ⬜ Not Started |       |
| 4    | User Module           | ⬜ Not Started |       |
| 5    | Wallet Module         | ⬜ Not Started |       |
| 6    | Deposit System        | ⬜ Not Started |       |
| 7    | Withdrawal System     | ⬜ Not Started |       |
| 8    | Game Engine           | ⬜ Not Started |       |
| 9    | 7 Up Down Game        | ⬜ Not Started |       |
| 10   | Admin Panel MVP       | ⬜ Not Started |       |
