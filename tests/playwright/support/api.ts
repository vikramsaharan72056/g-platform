import { APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:3000';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@abcrummy.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin@123456';
const PLAYER_EMAIL = process.env.E2E_PLAYER_EMAIL || 'player@test.com';
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'Player@123456';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJsonSafe(response: any): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractToken(payload: any): string | null {
  return (
    payload?.access_token ||
    payload?.token ||
    payload?.data?.access_token ||
    payload?.data?.token ||
    null
  );
}

export async function loginAndGetToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/auth/login`, {
    data: { email, password },
  });
  const body = await parseJsonSafe(response);

  if (!response.ok()) {
    throw new Error(
      `Login failed for ${email}: HTTP ${response.status()} ${JSON.stringify(body)}`,
    );
  }

  const token = extractToken(body);
  if (!token) {
    throw new Error(`No token in login response for ${email}: ${JSON.stringify(body)}`);
  }

  return token;
}

export async function getAdminToken(request: APIRequestContext): Promise<string> {
  return loginAndGetToken(request, ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function getPlayerToken(request: APIRequestContext): Promise<string> {
  return loginAndGetToken(request, PLAYER_EMAIL, PLAYER_PASSWORD);
}

export async function getFirstPlayerUserId(
  request: APIRequestContext,
  adminToken: string,
): Promise<string> {
  const response = await request.get(`${API_BASE_URL}/api/users/admin/list?page=1&limit=50`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  const body = await parseJsonSafe(response);

  if (!response.ok()) {
    throw new Error(`Failed to list users: HTTP ${response.status()} ${JSON.stringify(body)}`);
  }

  const users = body?.data || [];
  const player = users.find((u: any) => u.role === 'PLAYER') || users[0];
  if (!player?.id) {
    throw new Error(`No users available for detail view test: ${JSON.stringify(body)}`);
  }

  return player.id;
}

export async function placeBetOnActiveBettingRound(
  request: APIRequestContext,
  opts?: {
    slug?: string;
    betType?: string;
    amount?: number;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
) {
  const slug = opts?.slug || 'seven-up-down';
  const betType = opts?.betType || 'up';
  const amount = opts?.amount || 10;
  const timeoutMs = opts?.timeoutMs || 120_000;
  const pollIntervalMs = opts?.pollIntervalMs || 2_000;

  const playerToken = await getPlayerToken(request);
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'No betting round found yet';

  while (Date.now() < deadline) {
    const currentRoundRes = await request.get(
      `${API_BASE_URL}/api/games/${slug}/current-round`,
      {
        headers: {
          Authorization: `Bearer ${playerToken}`,
        },
      },
    );
    const currentRoundBody = await parseJsonSafe(currentRoundRes);
    const round = currentRoundBody?.data || currentRoundBody;

    if (currentRoundRes.ok() && round?.id && round?.status === 'BETTING') {
      const placeBetRes = await request.post(`${API_BASE_URL}/api/games/bet`, {
        headers: {
          Authorization: `Bearer ${playerToken}`,
        },
        data: {
          roundId: round.id,
          betType,
          amount,
        },
      });
      const placeBetBody = await parseJsonSafe(placeBetRes);

      if (placeBetRes.ok()) {
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          amount,
          betType,
          response: placeBetBody,
        };
      }

      const message = JSON.stringify(placeBetBody);
      lastFailure = `Bet placement failed: HTTP ${placeBetRes.status()} ${message}`;

      // Common transient case when betting window closes during request.
      if (
        message.toLowerCase().includes('betting is closed') ||
        message.toLowerCase().includes('betting')
      ) {
        await sleep(pollIntervalMs);
        continue;
      }

      throw new Error(lastFailure);
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for BETTING round and successful bet placement (${slug}): ${lastFailure}`,
  );
}

