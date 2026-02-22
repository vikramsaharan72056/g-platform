import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('profile')
    @ApiOperation({ summary: 'Get current user profile' })
    async getProfile(@CurrentUser('userId') userId: string) {
        return this.usersService.getProfile(userId);
    }

    @Patch('profile')
    @ApiOperation({ summary: 'Update current user profile' })
    async updateProfile(
        @CurrentUser('userId') userId: string,
        @Body() dto: UpdateProfileDto,
    ) {
        return this.usersService.updateProfile(userId, dto);
    }

    // =============== ADMIN ENDPOINTS ===============

    @Get('admin/list')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] List all users with filters' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'status', required: false })
    @ApiQuery({ name: 'role', required: false })
    async listUsers(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
        @Query('status') status?: string,
        @Query('role') role?: string,
    ) {
        return this.usersService.listUsers(page, limit, search, status, role);
    }

    @Get('admin/:id')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Get user detail' })
    async getUserDetail(@Param('id') id: string) {
        return this.usersService.getUserDetail(id);
    }

    @Patch('admin/:id/status')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @ApiOperation({ summary: '[Admin] Update user status (ban, suspend, activate)' })
    async updateUserStatus(
        @Param('id') id: string,
        @Body('status') status: string,
        @CurrentUser('userId') adminId: string,
    ) {
        return this.usersService.updateUserStatus(id, status, adminId);
    }
}
