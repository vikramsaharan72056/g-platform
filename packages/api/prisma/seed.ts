import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding database...');

    // ==================== CREATE ADMIN USER ====================
    const adminPassword = await bcrypt.hash('Admin@123456', 12);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@abcrummy.com' },
        update: {},
        create: {
            email: 'admin@abcrummy.com',
            password: adminPassword,
            displayName: 'Super Admin',
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            referralCode: 'ABCADMIN',
        },
    });

    // Create admin wallet
    await prisma.wallet.upsert({
        where: { userId: admin.id },
        update: {},
        create: {
            userId: admin.id,
            balance: 0,
        },
    });

    console.log('✅ Admin user created: admin@abcrummy.com / Admin@123456');

    // ==================== CREATE TEST PLAYER ====================
    const playerPassword = await bcrypt.hash('Player@123456', 12);

    const player = await prisma.user.upsert({
        where: { email: 'player@test.com' },
        update: {},
        create: {
            email: 'player@test.com',
            password: playerPassword,
            displayName: 'Test Player',
            role: 'PLAYER',
            status: 'ACTIVE',
            referralCode: 'ABCTEST1',
        },
    });

    // Create player wallet with test balance
    await prisma.wallet.upsert({
        where: { userId: player.id },
        update: {},
        create: {
            userId: player.id,
            balance: 10000, // ₹10,000 test balance
            bonusBalance: 500,
        },
    });

    console.log('✅ Test player created: player@test.com / Player@123456 (Balance: ₹10,000)');

    // ==================== CREATE GAMES ====================
    const games = [
        {
            name: 'Teen Patti',
            slug: 'teen-patti',
            type: 'CARD_GAME' as const,
            minBet: 10,
            maxBet: 10000,
            roundDuration: 90,
            bettingWindow: 30,
            houseEdge: 5,
            isActive: true,
        },
        {
            name: 'Aviator',
            slug: 'aviator',
            type: 'CRASH_GAME' as const,
            minBet: 10,
            maxBet: 50000,
            roundDuration: 60,
            bettingWindow: 15,
            houseEdge: 3,
            isActive: false, // Not implemented yet
        },
        {
            name: '7 Up Down',
            slug: 'seven-up-down',
            type: 'DICE_GAME' as const,
            minBet: 10,
            maxBet: 5000,
            roundDuration: 45,
            bettingWindow: 25,
            houseEdge: 4,
            isActive: true,
        },
        {
            name: 'Dragon & Tiger',
            slug: 'dragon-tiger',
            type: 'CARD_GAME' as const,
            minBet: 10,
            maxBet: 10000,
            roundDuration: 30,
            bettingWindow: 20,
            houseEdge: 5,
            isActive: false, // Not implemented yet
        },
        {
            name: 'Poker (Texas Hold\'em)',
            slug: 'poker',
            type: 'CARD_GAME' as const,
            minBet: 50,
            maxBet: 50000,
            roundDuration: 120,
            bettingWindow: 30,
            houseEdge: 5,
            isActive: false, // Not implemented yet
        },
    ];

    for (const game of games) {
        await prisma.game.upsert({
            where: { slug: game.slug },
            update: {},
            create: game,
        });
        console.log(`✅ Game created: ${game.name} (${game.isActive ? 'ACTIVE' : 'INACTIVE'})`);
    }

    // ==================== CREATE SAMPLE PAYMENT QR ====================
    await prisma.paymentQR.upsert({
        where: { id: 'sample-qr-1' },
        update: {},
        create: {
            id: 'sample-qr-1',
            name: 'UPI - Primary',
            type: 'UPI',
            qrCodeUrl: 'https://placeholder.com/qr-code.png',
            upiId: 'abcrummy@upi',
            isActive: true,
            dailyLimit: 500000,
            createdBy: admin.id,
        },
    });

    console.log('✅ Sample Payment QR created');

    // ==================== SYSTEM SETTINGS ====================
    const settings = [
        { key: 'min_deposit', value: 100, description: 'Minimum deposit amount (INR)' },
        { key: 'max_deposit', value: 100000, description: 'Maximum deposit amount (INR)' },
        { key: 'min_withdrawal', value: 100, description: 'Minimum withdrawal amount (INR)' },
        { key: 'max_withdrawal', value: 50000, description: 'Maximum withdrawal amount (INR)' },
        { key: 'turnover_factor', value: 1, description: 'Turnover factor for withdrawal eligibility' },
        { key: 'welcome_bonus', value: 50, description: 'Welcome bonus amount (INR)' },
        { key: 'maintenance_mode', value: false, description: 'Global maintenance mode' },
    ];

    for (const setting of settings) {
        await prisma.systemSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: {
                key: setting.key,
                value: setting.value,
                description: setting.description,
            },
        });
    }

    console.log('✅ System settings created');
    console.log('\n🎉 Seed completed successfully!');
    console.log('\n--- Login Credentials ---');
    console.log('Admin: admin@abcrummy.com / Admin@123456');
    console.log('Player: player@test.com / Player@123456');
}

main()
    .catch((e) => {
        console.error('Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
