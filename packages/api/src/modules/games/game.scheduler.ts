import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SevenUpDownEngine } from './engines/seven-up-down.engine';
import { DragonTigerEngine } from './engines/dragon-tiger.engine';
import { TeenPattiEngine } from './engines/teen-patti.engine';
import { AviatorEngine } from './engines/aviator.engine';
import { PokerEngine } from './engines/poker.engine';
import { RummyEngine } from './engines/rummy.engine';

@Injectable()
export class GameScheduler implements OnModuleInit {
    private readonly logger = new Logger(GameScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly sevenUpDown: SevenUpDownEngine,
        private readonly dragonTiger: DragonTigerEngine,
        private readonly teenPatti: TeenPattiEngine,
        private readonly aviator: AviatorEngine,
        private readonly poker: PokerEngine,
        private readonly rummy: RummyEngine,
    ) { }

    async onModuleInit() {
        // Start game rounds after a short delay (let the server boot up)
        setTimeout(() => this.startGameLoops(), 5000);
    }

    private async startGameLoops() {
        this.logger.log('Starting game loops...');

        // Find all active games and start their loops
        const games = await this.prisma.game.findMany({
            where: { isActive: true, isMaintenanceMode: false },
        });

        for (const game of games) {
            try {
                switch (game.slug) {
                    case 'seven-up-down':
                        this.logger.log(`Starting 7 Up Down game loop for ${game.name}`);
                        await this.sevenUpDown.executeRound(game.id);
                        break;

                    case 'dragon-tiger':
                        this.logger.log(`Starting Dragon Tiger game loop for ${game.name}`);
                        await this.dragonTiger.executeRound(game.id);
                        break;

                    case 'teen-patti':
                        this.logger.log(`Starting Teen Patti game loop for ${game.name}`);
                        await this.teenPatti.executeRound(game.id);
                        break;

                    case 'aviator':
                        this.logger.log(`Starting Aviator game loop for ${game.name}`);
                        await this.aviator.executeRound(game.id);
                        break;

                    case 'poker':
                        this.logger.log(`Starting Poker game loop for ${game.name}`);
                        await this.poker.executeRound(game.id);
                        break;

                    case 'rummy':
                        this.logger.log(`Starting Rummy game loop for ${game.name}`);
                        await this.rummy.executeRound(game.id);
                        break;

                    default:
                        this.logger.warn(
                            `No engine found for game: ${game.slug}`,
                        );
                }
            } catch (error) {
                this.logger.error(
                    `Failed to start ${game.slug}: ${error.message}`,
                );
            }
        }
    }
}

