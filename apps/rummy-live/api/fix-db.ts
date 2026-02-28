import { PrismaClient } from '@prisma/client';

async function main() {
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: 'postgresql://postgres:postgres@localhost:5432/postgres?schema=public'
            }
        }
    });

    try {
        console.log('Attempting to fix permissions...');

        // 1. Create database if it doesn't exist (Prisma can't do this easily via raw SQL sometimes due to transactions, but we can try)
        try {
            await prisma.$executeRawUnsafe('CREATE DATABASE rummy_live;');
            console.log('Database rummy_live created.');
        } catch (e: any) {
            console.log('Database rummy_live might already exist or creation failed:', e.message);
        }

        // 2. Grant permissions
        await prisma.$executeRawUnsafe('GRANT ALL PRIVILEGES ON DATABASE rummy_live TO gplatform_user;');

        // 3. Connect to rummy_live to grant schema permissions
        const prismaRL = new PrismaClient({
            datasources: {
                db: {
                    url: 'postgresql://postgres:postgres@localhost:5432/rummy_live?schema=public'
                }
            }
        });

        await prismaRL.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO gplatform_user;');
        await prismaRL.$executeRawUnsafe('ALTER USER gplatform_user WITH SUPERUSER;'); // overkill but effective for dev

        console.log('Permissions granted successfully!');
    } catch (err: any) {
        console.error('Failed to fix permissions:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
