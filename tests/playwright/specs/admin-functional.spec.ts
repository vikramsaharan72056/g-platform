import { expect, test } from '@playwright/test';
import {
  getAdminToken,
  getFirstPlayerUserId,
  placeBetOnActiveBettingRound,
} from '../support/api';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@abcrummy.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin@123456';

async function loginAsAdmin(page: any) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe('Admin Frontend Functional Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Dashboard is functional', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('System Status')).toBeVisible();
  });

  test('Users page is functional', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible();
    await expect(
      page.getByPlaceholder('Search by email, name, or phone...'),
    ).toBeVisible();
    await page.getByPlaceholder('Search by email, name, or phone...').fill('player@test.com');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('player@test.com')).toBeVisible();
  });

  test('User detail page is functional', async ({ page, request }) => {
    const adminToken = await getAdminToken(request);
    const userId = await getFirstPlayerUserId(request, adminToken);

    await page.goto(`/users/${userId}`);
    await expect(page.getByRole('heading', { name: 'User Detail' })).toBeVisible();
    await expect(page.getByText('Balance')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transactions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bets' })).toBeVisible();
  });

  test('Deposits page is functional', async ({ page }) => {
    await page.goto('/deposits');
    await expect(page.getByRole('heading', { name: 'Deposit Queue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PENDING' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'APPROVED' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'REJECTED' })).toBeVisible();
  });

  test('Withdrawals page is functional', async ({ page }) => {
    await page.goto('/withdrawals');
    await expect(page.getByRole('heading', { name: 'Withdrawal Queue' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PENDING' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'COMPLETED' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'REJECTED' })).toBeVisible();
  });

  test('Games page is functional', async ({ page }) => {
    await page.goto('/games');
    await expect(page.getByRole('heading', { name: 'Game Management' })).toBeVisible();

    const firstGameCard = page.locator('.game-card-admin').first();
    await expect(firstGameCard).toBeVisible();
    await firstGameCard.click();

    await expect(page.getByRole('heading', { name: 'Game Statistics' })).toBeVisible();
  });

  test('Game controls page is functional', async ({ page }) => {
    await page.goto('/game-controls');
    await expect(page.getByRole('heading', { name: /Game Controls/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Force Result' })).toBeVisible();

    await page.getByRole('button', { name: 'Force Result' }).click();
    await expect(page.getByRole('heading', { name: 'Force Next Round Result' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Analytics page is functional', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: /Analytics/i })).toBeVisible();
    await expect(page.getByText(/Revenue Trend/i)).toBeVisible();
    await expect(page.getByText(/Bet Volume/i)).toBeVisible();
  });

  test('Audit logs page is functional', async ({ page }) => {
    await page.goto('/audit-logs');
    await expect(page.getByRole('heading', { name: /Audit Logs/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible();
  });

  test('Settings page is functional', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /System Settings/i })).toBeVisible();
    await page.getByRole('button', { name: /Save Changes/i }).click();
    await expect(page.getByRole('button', { name: /Saved/i })).toBeVisible();
  });

  test('Live monitor page is functional', async ({ page }) => {
    await page.goto('/live-monitor');
    await expect(page.getByRole('heading', { name: /Live Game Monitor/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Live Bets/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Round Results/i })).toBeVisible();
    await expect(page.getByText(/Connected/i)).toBeVisible({ timeout: 20_000 });
  });

  test('Live bets feed receives bet:placed events', async ({ page, request }) => {
    await page.goto('/live-monitor');
    await expect(page.getByRole('heading', { name: /Live Game Monitor/i })).toBeVisible();
    await expect(page.getByText(/Connected/i)).toBeVisible({ timeout: 20_000 });

    const liveBetsPanel = page.locator('.live-feed-panel').filter({
      has: page.getByRole('heading', { name: /Live Bets/i }),
    });
    await expect(liveBetsPanel.getByText(/Waiting for bets/i)).toBeVisible();

    const placedBet = await placeBetOnActiveBettingRound(request, {
      slug: 'seven-up-down',
      betType: 'up',
      amount: 10,
      timeoutMs: 150_000,
    });

    await expect(liveBetsPanel.getByText(new RegExp(placedBet.betType, 'i'))).toBeVisible({
      timeout: 20_000,
    });
    await expect(liveBetsPanel.getByText(/₹|10/)).toBeVisible({ timeout: 20_000 });
  });
});

