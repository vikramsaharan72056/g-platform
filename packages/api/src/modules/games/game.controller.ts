import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlaceBetDto } from './dto/place-bet.dto';

@ApiTags('games')
@Controller('games')
export class GameController {
    constructor(private readonly gameService: GameService) { }

    @Get()
    @ApiOperation({ summary: 'Get all active games' })
    async getGames() {
        return this.gameService.getGames();
    }

    @Get(':slug')
    @ApiOperation({ summary: 'Get game by slug' })
    async getGame(@Param('slug') slug: string) {
        return this.gameService.getGameBySlug(slug);
    }

    @Get(':slug/current-round')
    @ApiOperation({ summary: 'Get current active round for a game' })
    async getCurrentRound(@Param('slug') slug: string) {
        const game = await this.gameService.getGameBySlug(slug);
        return this.gameService.getCurrentRound(game.id);
    }

    @Get(':slug/history')
    @ApiOperation({ summary: 'Get recent round results' })
    @ApiQuery({ name: 'limit', required: false })
    async getRoundHistory(
        @Param('slug') slug: string,
        @Query('limit') limit?: number,
    ) {
        const game = await this.gameService.getGameBySlug(slug);
        return this.gameService.getRecentRounds(game.id, limit || 20);
    }

    @Post('bet')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Place a bet on an active round' })
    async placeBet(
        @CurrentUser('userId') userId: string,
        @Body() dto: PlaceBetDto,
    ) {
        return this.gameService.placeBet(userId, dto);
    }

    // =============== ADMIN ENDPOINTS ===============

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiBearerAuth()
    @ApiOperation({ summary: '[Admin] Get all games with stats' })
    async getAllGamesAdmin() {
        return this.gameService.getAllGamesAdmin();
    }

    @Get('admin/:id/stats')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiBearerAuth()
    @ApiOperation({ summary: '[Admin] Get game statistics' })
    async getGameStats(@Param('id') id: string) {
        return this.gameService.getGameStats(id);
    }
}
