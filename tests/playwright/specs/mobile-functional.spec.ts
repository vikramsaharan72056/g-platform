import { expect, Page, test } from '@playwright/test';

const PLAYER_EMAIL = process.env.E2E_PLAYER_EMAIL || 'player@test.com';
const PLAYER_PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'Player@123456';

async function loginAsPlayer(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('Enter your email').fill(PLAYER_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PLAYER_PASSWORD);
  await page.getByText('Sign In').click();
  await expect(page.getByText('Your Balance')).toBeVisible({ timeout: 30_000 });
}

test.describe('Mobile Web Frontend Functional Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPlayer(page);
  });

  test('Home (Games) tab is functional', async ({ page }) => {
    await expect(page.getByText('Your Balance')).toBeVisible();
    await expect(page.getByText('+ Add Money')).toBeVisible();
    await expect(page.getByText('LIVE')).toBeVisible();
  });

  test('Wallet tab is functional', async ({ page }) => {
    await page.getByText('Wallet', { exact: true }).first().click();
    await expect(page.getByText('Total Balance')).toBeVisible();
    await expect(page.getByText('Recent Transactions')).toBeVisible();
  });

  test('Profile tab is functional', async ({ page }) => {
    await page.getByText('Profile', { exact: true }).first().click();
    await expect(page.getByText('Account')).toBeVisible();
    await expect(page.getByText('Security')).toBeVisible();
    await expect(page.getByText('Support')).toBeVisible();
  });

  test('Deposit flow is functional', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await page.getByText('+ Add Money').click();
    await expect(page.getByText('Enter Amount')).toBeVisible();

    await page.getByText(/100/).first().click();

    const qrOption =
      (await page.getByText('UPI - Primary').count()) > 0
        ? page.getByText('UPI - Primary').first()
        : page.getByText(/UPI/i).first();
    await qrOption.click();

    await page.getByText(/^Next/).click();
    await expect(page.getByText('Payment Confirmation')).toBeVisible();

    await page
      .getByPlaceholder('Enter UTR or transaction reference')
      .fill(`UTR${Date.now()}`);
    await page.getByText('Submit Deposit Request').click();

    await expect
      .poll(() => dialogs.some((msg) => /success|submitted/i.test(msg)), {
        timeout: 20_000,
      })
      .toBeTruthy();
  });

  test('Withdraw flow is functional', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await page.getByText('Wallet', { exact: true }).first().click();
    await page.getByText('Withdraw', { exact: true }).first().click();

    await expect(page.getByText('Bank Details')).toBeVisible();
    await page.getByPlaceholder('₹ Enter amount').fill('100');
    await page.getByPlaceholder('e.g. HDFC Bank').fill('HDFC Bank');
    await page.getByPlaceholder('Enter account number').fill('123456789012');
    await page.getByPlaceholder('e.g. HDFC0001234').fill('HDFC0001234');
    await page.getByPlaceholder('Name as per bank records').fill('Test Player');
    await page.getByText('Request Withdrawal').click();

    await expect
      .poll(() => dialogs.some((msg) => /success|submitted|process/i.test(msg)), {
        timeout: 20_000,
      })
      .toBeTruthy();
  });

  test('Game screen and bet interaction are functional', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await page.getByText('Games', { exact: true }).first().click();
    await page.getByText(/7 Up Down/i).first().click();

    await expect(page.getByText(/7 Up Down/i)).toBeVisible();
    await expect(page.getByText('Round #')).toBeVisible();

    let placed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(page.getByText('Place Your Bet')).toBeVisible({ timeout: 90_000 });
      await page.getByText('Up (8-12)').first().click();
      await page.getByText(/^Place Bet/).first().click();
      await page.waitForTimeout(2_000);

      if (dialogs.some((msg) => /bet placed|success/i.test(msg))) {
        placed = true;
        break;
      }
    }

    expect(placed).toBeTruthy();
  });

  test('Notifications screen is functional', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByText('Notifications')).toBeVisible();
  });

  test('Two-factor screen is functional', async ({ page }) => {
    await page.goto('/two-factor');
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible();
    await expect(page.getByText('Enable 2FA')).toBeVisible();
  });
});

