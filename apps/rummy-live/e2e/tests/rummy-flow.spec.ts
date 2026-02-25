import { test, expect, type Page } from '@playwright/test';

test.describe('Rummy End-to-End Game Flow', () => {
    let playerAPage: Page;
    let playerBPage: Page;

    test.beforeAll(async ({ browser }) => {
        const contextA = await browser.newContext();
        const contextB = await browser.newContext();
        playerAPage = await contextA.newPage();
        playerBPage = await contextB.newPage();
    });

    const performLogin = async (page: Page, name: string) => {
        await page.goto('/');
        // Check if we are on Login Screen
        const loginInput = page.getByPlaceholder('Enter your name');
        await expect(loginInput).toBeVisible({ timeout: 60000 });
        await loginInput.fill(name);

        // Use getByText for buttons as it's more stable in RN Web
        const loginBtn = page.getByText('Enter Lobby');
        await expect(loginBtn).toBeVisible({ timeout: 60000 });
        await loginBtn.click();

        // Verify it reached Lobby
        await expect(page.getByText('Active Tables', { exact: true })).toBeVisible({ timeout: 60000 });

        // Top up to ensure we have money for betting
        const topUpBtn = page.getByText('+ FREE ₹500');
        if (await topUpBtn.isVisible()) {
            await topUpBtn.click();
            await page.waitForTimeout(1000);
        }
    };

    test('Complete Game: Login -> Multi-player Play -> Payout', async () => {
        // --- PLAYER A LOGS IN AND CREATES TABLE ---
        console.log('--- Player A Logging in ---');
        await performLogin(playerAPage, 'Player_A');

        await playerAPage.getByText('+ New Table').click();
        console.log('Table created by Player A. Waiting for automatic entry...');

        // Player A should now see "Waiting for players" (since they are alone)
        await expect(playerAPage.getByText('Waiting for players')).toBeVisible({ timeout: 60000 });
        console.log('Player A entered game successfully.');

        // --- PLAYER B LOGS IN AND JOINS ---
        console.log('--- Player B Logging in ---');
        await performLogin(playerBPage, 'Player_B');

        // Join the table
        const joinBtn = playerBPage.getByText('Join Table').first();
        await expect(joinBtn).toBeVisible({ timeout: 60000 });
        await joinBtn.click();
        console.log('Player B clicked Join Table');

        // Player B should also enter the game
        // We check for the specific 'Waiting for players...' text which only appears in the room
        await expect(playerBPage.getByText('Waiting for players...')).toBeVisible({ timeout: 60000 });
        console.log('Player B entered game room successfully.');

        // Verify Player A sees the join and "Start Game" button
        console.log('Waiting for Start Game button for Player A...');
        await expect(playerAPage.getByText('Start Game')).toBeVisible({ timeout: 120000 });
        console.log('Start Game button detected!');

        // --- START GAME ---
        await playerAPage.getByText('Start Game').click();
        console.log('Game Started');

        // Verify both see the game board
        await expect(playerAPage.getByText('Your Hand')).toBeVisible({ timeout: 60000 });
        await expect(playerBPage.getByText('Your Hand')).toBeVisible({ timeout: 60000 });

        // --- REPEATABLE TURN LOGIC ---
        const takeTurn = async (page: Page, name: string) => {
            // Wait for it to be this player's turn 
            // We'll check for "Your Turn" indicator
            const turnIndicator = page.getByText('Your Turn');
            if (await turnIndicator.isVisible()) {
                console.log(`${name}'s turn detected. Proceeding to draw...`);

                // Draw from Closed Pile (clicking the 'BACK' element)
                const closedPile = page.getByText('BACK');
                await expect(closedPile).toBeVisible({ timeout: 10000 });
                await closedPile.click();
                console.log(`${name} drew a card.`);
                await page.waitForTimeout(1000);

                // Select a card from hand to discard
                // In React Native Web, cards should have data-testid or we use accessibilityRole
                const cards = page.locator('div[data-testid^="card-"]');
                const count = await cards.count();
                if (count > 0) {
                    // Click the last card (usually the one just drawn)
                    await cards.nth(count - 1).click();

                    // Click Discard Button
                    const discardBtn = page.getByText('Discard');
                    await expect(discardBtn).toBeVisible();
                    await discardBtn.click();
                    console.log(`${name} discarded. Turn complete.`);
                }
            }
        };

        // Simulate turns
        for (let i = 0; i < 4; i++) {
            await takeTurn(playerAPage, 'Player_A');
            await playerAPage.waitForTimeout(1000);
            await takeTurn(playerBPage, 'Player_B');
            await playerBPage.waitForTimeout(1000);
        }

        // --- FINAL TURN: PLAYER A DRAWS AND DECLARES ---
        console.log('Player A: Attempting final Winning/Invalid Declaration...');

        // 1. Wait for Player A's turn
        await expect(playerAPage.getByText('Your Turn')).toBeVisible({ timeout: 60000 });

        // 2. Draw card (Must draw before declaring)
        const closedPile = playerAPage.getByText('BACK');
        await closedPile.click();
        console.log('Player A drew 14th card.');
        await playerAPage.waitForTimeout(1000);

        // 3. Declare immediately (without discarding)
        const declareBtn = playerAPage.getByText('Declare');
        await expect(declareBtn).toBeEnabled({ timeout: 10000 });
        await declareBtn.click();
        console.log('Player A clicked Declare.');
        await expect(playerAPage.getByText(/invalid|won|winner/i)).toBeVisible({ timeout: 10000 });

        console.log('--- Test Successfully Completed ---');
    });
});
