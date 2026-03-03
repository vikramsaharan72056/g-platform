import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = process.env.AVIATOR_API_URL || 'http://localhost:3501';
const ADMIN_EMAIL = process.env.AVIATOR_ADMIN_EMAIL || 'admin@aviator.live';
const ADMIN_PASSWORD = process.env.AVIATOR_ADMIN_PASSWORD || 'change-me-now';

type RuntimeConfig = {
  minBet: number;
  maxBet: number;
  bettingWindowSeconds: number;
  lockSeconds: number;
  waitingSeconds: number;
  multiplierTickMs: number;
  multiplierGrowthMs: number;
  maxCrashPoint: number;
  maintenanceMode: boolean;
};

type AuthPayload = {
  token: string;
  user: {
    userId: string;
    name: string;
    role: 'PLAYER' | 'ADMIN';
  };
};

type RoundSnapshot = {
  round: null | {
    id: string;
    roundNumber: number;
    status: string;
    bettingEndAt: string;
  };
  userBets: Array<{
    id: string;
    roundId: string;
    amount: number;
    betType: 'manual' | 'auto_cashout';
    status: 'PLACED' | 'WON' | 'LOST' | 'CANCELLED';
    payout: number;
    cashoutMultiplier: number | null;
  }>;
};

type WalletPayload = {
  userId: string;
  balance: number;
};

let adminToken = '';
let originalConfig: RuntimeConfig | null = null;

async function adminRequest(
  request: APIRequestContext,
  method: 'GET' | 'PATCH',
  path: string,
  body?: unknown,
) {
  const response =
    method === 'GET'
      ? await request.get(`${API_URL}${path}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      : await request.patch(`${API_URL}${path}`, {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
          data: body,
        });
  const json = await response.json();
  expect(response.ok(), json.message || `Admin request failed: ${path}`).toBeTruthy();
  return json.data as any;
}

async function userRequest<T>(
  request: APIRequestContext,
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const response =
    method === 'GET'
      ? await request.get(`${API_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      : await request.post(`${API_URL}${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          data: body,
        });
  const json = await response.json();
  expect(response.ok(), json.message || `User request failed: ${path}`).toBeTruthy();
  return json.data as T;
}

async function loginPlayer(page: Page, name: string) {
  await page.goto('/');
  const nameInput = page.getByPlaceholder('Enter your name');
  await expect(nameInput).toBeVisible({ timeout: 60000 });
  await nameInput.fill(name);
  await page.getByRole('button', { name: 'Enter Aviator' }).click();
  await expect(page.getByText('Aviator Live')).toBeVisible({ timeout: 60000 });
}

async function waitForStatus(page: Page, status: string, timeoutMs = 30000) {
  await expect(page.getByText(status, { exact: true }).first()).toBeVisible({ timeout: timeoutMs });
}

test.describe('Aviator E2E Flow', () => {
  test.beforeAll(async ({ request }) => {
    const loginResponse = await request.post(`${API_URL}/auth/admin-login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const loginJson = await loginResponse.json();
    expect(loginResponse.ok(), loginJson.message || 'Admin login failed').toBeTruthy();
    const auth = loginJson.data as AuthPayload;
    adminToken = auth.token;

    originalConfig = await adminRequest(request, 'GET', '/aviator/admin/config');

    await adminRequest(request, 'PATCH', '/aviator/admin/config', {
      maintenanceMode: false,
      minBet: 10,
      maxBet: 50000,
      bettingWindowSeconds: 9,
      lockSeconds: 1,
      waitingSeconds: 2,
      multiplierTickMs: 100,
      multiplierGrowthMs: 12000,
      maxCrashPoint: 300,
    });
  });

  test.afterAll(async ({ request }) => {
    if (!originalConfig || !adminToken) return;
    await adminRequest(request, 'PATCH', '/aviator/admin/config', originalConfig);
  });

  test('Login -> place bet -> cashout -> settlement', async ({ page, request }) => {
    const playerName = `E2E_Player_${Date.now()}`;
    await loginPlayer(page, playerName);

    const rawUser = await page.evaluate(() => localStorage.getItem('aviator_user'));
    expect(rawUser, 'Missing persisted aviator_user in localStorage').toBeTruthy();
    const parsedUser = JSON.parse(rawUser!) as {
      token: string;
      userId: string;
      name: string;
      balance: number;
    };
    const userToken = parsedUser.token;
    expect(userToken).toBeTruthy();

    const initialWallet = await userRequest<WalletPayload>(request, userToken, 'GET', '/wallet/me');

    let wonRoundId: string | null = null;
    let wonPayout = 0;
    let wonMultiplier = 0;

    for (let attempt = 1; attempt <= 6; attempt++) {
      await waitForStatus(page, 'BETTING', 45000);

      const current = await userRequest<RoundSnapshot>(request, userToken, 'GET', '/aviator/round/current');
      expect(current.round).toBeTruthy();
      const roundId = current.round!.id;

      const amountInput = page.getByPlaceholder('Amount').first();
      await amountInput.fill('20');
      await page.getByRole('button', { name: 'Place Manual' }).click();
      await expect(page.getByText('Status: PLACED').first()).toBeVisible({ timeout: 10000 });

      await waitForStatus(page, 'PLAYING', 35000);

      const cashoutBtn = page.getByRole('button', { name: 'Cashout' }).first();
      if (await cashoutBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
        await cashoutBtn.click();
      }

      let settledBet:
        | {
            id: string;
            status: 'PLACED' | 'WON' | 'LOST' | 'CANCELLED';
            payout: number;
            cashoutMultiplier: number | null;
          }
        | undefined;

      for (let poll = 0; poll < 50; poll++) {
        const bets = await userRequest<
          Array<{
            id: string;
            roundId: string;
            status: 'PLACED' | 'WON' | 'LOST' | 'CANCELLED';
            payout: number;
            cashoutMultiplier: number | null;
          }>
        >(request, userToken, 'GET', `/aviator/bets/me?limit=20&roundId=${roundId}`);

        settledBet = bets.find((b) => b.roundId === roundId && b.status !== 'PLACED');
        if (settledBet) break;
        await page.waitForTimeout(500);
      }

      expect(settledBet, `Round ${roundId} did not settle in time`).toBeTruthy();
      if (settledBet!.status === 'WON' && settledBet!.payout > 0) {
        wonRoundId = roundId;
        wonPayout = settledBet!.payout;
        wonMultiplier = settledBet!.cashoutMultiplier || 0;
        break;
      }

      await waitForStatus(page, 'BETTING', 45000);
    }

    expect(wonRoundId, 'No successful cashout round after retries').toBeTruthy();
    expect(wonPayout).toBeGreaterThan(0);
    expect(wonMultiplier).toBeGreaterThan(1);

    const finalWallet = await userRequest<WalletPayload>(request, userToken, 'GET', '/wallet/me');
    expect(finalWallet.balance).toBeGreaterThan(initialWallet.balance - 120);

    const transactions = await userRequest<
      Array<{
        type: string;
        payload: any;
      }>
    >(request, userToken, 'GET', '/wallet/me/transactions?limit=20');

    const cashoutTxn = transactions.find(
      (txn) => txn.type === 'BET_CASHOUT' && txn.payload?.roundId === wonRoundId,
    );
    expect(cashoutTxn, 'Missing BET_CASHOUT transaction for winning round').toBeTruthy();
  });
});
