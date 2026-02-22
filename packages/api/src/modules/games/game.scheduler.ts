import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SevenUpDownEngine } from './engines/seven-up-down.engine';

@Injectable()
export class GameScheduler implements OnModuleInit {
    private readonly logger = new Logger(GameScheduler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly sevenUpDown: SevenUpDownEngine,
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
            switch (game.slug) {
                case 'seven-up-down':
                    this.logger.log(`Starting 7 Up Down game loop for ${game.name}`);
                    try {
                        await this.sevenUpDown.executeRound(game.id);
                    } catch (error) {
                        this.logger.error(
                            `Failed to start 7 Up Down: ${error.message}`,
                        );
                    }
                    break;

                // Future: Add other game engines here
                // case 'teen-patti':
                // case 'aviator':
                // case 'dragon-tiger':
                // case 'poker':

                default:
                    this.logger.warn(
                        `No engine found for game: ${game.slug}`,
                    );
            }
        }
    }
}
