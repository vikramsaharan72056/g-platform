# Aviator Live E2E

## Run
```bash
cd apps/aviator-live/e2e
cmd /c npm install
set AVIATOR_API_URL=http://localhost:3501
set AVIATOR_WEB_URL=http://localhost:8082
set AVIATOR_ADMIN_EMAIL=admin@aviator.live
set AVIATOR_ADMIN_PASSWORD=change-me-now
cmd /c npm test
```

## Test Coverage
- `tests/aviator-flow.spec.ts`
  - Login
  - Manual bet placement
  - Cashout
  - Settlement and wallet transaction verification
