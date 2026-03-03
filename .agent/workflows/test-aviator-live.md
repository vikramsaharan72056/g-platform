# Aviator Live Test Workflow

This flow validates end-to-end Aviator behavior:

1. login
2. place bet
3. cashout
4. settlement + wallet transaction

## 1) Start API

From `apps/aviator-live/api`:

```bash
copy .env.example .env
cmd /c npm install
cmd /c npm run db:generate
cmd /c npm run db:push
cmd /c npm run dev
```

Verify:

```bash
curl http://localhost:3501/health
```

Expected: `{"data":{"ok":true,"service":"aviator-live-api",...}}`

## 2) Start Mobile Web Client

From `apps/aviator-live/mobile`:

```bash
copy .env.example .env
cmd /c npm install
cmd /c npm run web -- --port 8082
```

Open `http://localhost:8082`.

## 3) Optional Manual Smoke

1. Login with any player name.
2. Wait for `BETTING`.
3. Place manual bet.
4. On `PLAYING`, click `Cashout`.
5. Confirm round settles and wallet updates.

## 4) Run Automated Playwright E2E

From `apps/aviator-live/e2e`:

```bash
cmd /c npm install
set AVIATOR_API_URL=http://localhost:3501
set AVIATOR_WEB_URL=http://localhost:8082
set AVIATOR_ADMIN_EMAIL=admin@aviator.live
set AVIATOR_ADMIN_PASSWORD=change-me-now
cmd /c npm test
```

What the test does:

1. Admin logs in via API and applies e2e-friendly runtime config.
2. Player logs in through UI.
3. Player places manual bet(s), attempts cashout, retries rounds until one successful cashout is achieved.
4. Verifies settlement and `BET_CASHOUT` transaction via API.
5. Restores previous runtime config.

## 5) Reports

After run:

- HTML report: `apps/aviator-live/e2e/playwright-report/index.html`

Open report:

```bash
cmd /c npm run report
```
