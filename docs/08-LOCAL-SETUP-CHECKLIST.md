# 08 - Local Setup Checklist (Known-Good)

Last updated: 2026-02-23

## Scope
This checklist is for running the current monorepo locally:
- API (`packages/api`)
- Admin panel (`packages/admin`)
- Mobile app (`packages/mobile`)
- Local Postgres + Redis via Docker

## Prerequisites
- Node.js 20+ (required by root `package.json`)
- npm
- Docker Desktop (or Docker Engine + Compose)
- Expo Go / Android emulator / iOS simulator (for mobile)

## Ports
- API: `3000`
- Admin (Vite): `5173`
- Postgres: `5432`
- Redis: `6379`
- Expo dev server: default Expo port (usually `8081`)

## 1. Install Dependencies
From repo root:

```powershell
npm install
```

Mobile is not part of root workspaces, so install separately:

```powershell
cd packages/mobile
npm install
cd ../..
```

## 2. Start Infrastructure
From repo root:

```powershell
npm run docker:up
```

This starts:
- `abcrummy-postgres` on `localhost:5432`
- `abcrummy-redis` on `localhost:6379`

## 3. Create API Env File
Create `packages/api/.env` with the exact values below:

```env
# Database
DATABASE_URL="postgresql://abcrummy:abcrummy_secret_2026@localhost:5432/abcrummy?schema=public"
DIRECT_URL="postgresql://abcrummy:abcrummy_secret_2026@localhost:5432/abcrummy?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="dev-change-this-to-a-long-random-secret"
JWT_EXPIRATION="7d"

# App
PORT=3000
NODE_ENV="development"

# Optional (currently not enforced in `main.ts`, which uses `origin: true`)
CORS_ORIGIN="http://localhost:5173"
```

Notes:
- `DIRECT_URL` is required by Prisma schema.
- Current runtime reads `REDIS_URL` (not `REDIS_HOST`/`REDIS_PORT`).

## 4. Run Prisma Migrations and Seed
From repo root:

```powershell
npm run db:migrate
npm run db:seed
```

Seeded login accounts:
- Admin: `admin@abcrummy.com` / `Admin@123456`
- Player: `player@test.com` / `Player@123456`

## 5. Start Applications
Use separate terminals.

API:

```powershell
npm run api:dev
```

Admin:

```powershell
npm run admin:dev
```

Mobile:

```powershell
cd packages/mobile
npm run start
```

## 6. Smoke Checks
- API health: `http://localhost:3000/api`
- Swagger docs: `http://localhost:3000/api/docs`
- Admin app: `http://localhost:5173`
- Admin login with seeded admin account
- Mobile login with seeded player account

## 7. Mobile Networking Setup
`packages/mobile` resolves API base URL as:
- Web: `http://localhost:3000`
- Android emulator: `http://10.0.2.2:3000`
- Physical device: set `EXPO_PUBLIC_API_URL`

Example for physical device (same LAN as dev machine):

```powershell
cd packages/mobile
$env:EXPO_PUBLIC_API_URL="http://192.168.1.50:3000"
npm run start
```

## 8. Known API/Client Mismatches (Current Code)
These do not stop API/Admin boot, but affect mobile flows unless patched.

1. Auth token response key mismatch
- Backend returns `access_token`
- Mobile auth store expects `token`
- Impact: mobile login/register token persistence may fail.

2. Deposit/withdraw route path mismatch
- Backend controllers: `/api/deposits/*` and `/api/withdrawals/*`
- Mobile client calls: `/api/deposit/*` and `/api/withdrawal/*`
- Impact: mobile deposit/withdraw endpoints return 404.

3. Withdrawal payload shape mismatch
- Backend expects `{ amount, payoutMethod, payoutDetails }`
- Mobile sends `{ amount, bankName, accountNumber, ifscCode, holderName }`
- Impact: withdrawal request validation fails.

4. Live monitor socket event mismatch (admin)
- Admin listens for `round:start` and `aviator:tick`
- Backend emits `round:created` and `aviator:multiplier`
- Impact: Live Monitor page does not reflect round/tick updates correctly.

## 9. Optional: Quick Compatibility Patch Plan
If you want all three clients aligned in one pass, patch in this order:
1. Mobile auth store token parsing (`access_token` fallback).
2. Mobile API route names (`deposits`/`withdrawals`).
3. Mobile withdrawal payload -> backend DTO shape.
4. Admin Live Monitor socket event names/payload mapping.

After patching, re-run:

```powershell
npm run api:dev
npm run admin:dev
cd packages/mobile
npm run start
```
