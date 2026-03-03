import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    Query,
} from '@nestjs/common';
import { ServiceRegistryService } from './service-registry.service';
import { RegisterServiceDto, UpdateServiceDto } from './dto/register-service.dto';
import { RequestAllocationDto, ManageAllocationDto, CreateAllocationDto } from './dto/allocation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, AllocationStatus } from '@prisma/client';

@Controller('service-registry')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceRegistryController {
    constructor(private readonly serviceRegistry: ServiceRegistryService) { }

    // ============================
    // SERVICE MANAGEMENT (SUPER_ADMIN)
    // ============================

    @Post('services')
    @Roles(UserRole.SUPER_ADMIN)
    registerService(@Body() dto: RegisterServiceDto) {
        return this.serviceRegistry.registerService(dto);
    }

    @Get('services')
    @Roles(UserRole.SUPER_ADMIN)
    listServices() {
        return this.serviceRegistry.listAllServices();
    }

    @Get('services/:id')
    @Roles(UserRole.SUPER_ADMIN)
    getService(@Param('id') id: string) {
        return this.serviceRegistry.getServiceById(id);
    }

    @Patch('services/:id')
    @Roles(UserRole.SUPER_ADMIN)
    updateService(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
        return this.serviceRegistry.updateService(id, dto);
    }

    @Delete('services/:id')
    @Roles(UserRole.SUPER_ADMIN)
    removeService(@Param('id') id: string) {
        return this.serviceRegistry.removeService(id);
    }

    // ============================
    // ALLOCATION MANAGEMENT (SUPER_ADMIN)
    // ============================

    @Post('allocations')
    @Roles(UserRole.SUPER_ADMIN)
    createAllocation(@Body() dto: CreateAllocationDto, @Req() req: any) {
        return this.serviceRegistry.createAllocation(dto, req.user.id);
    }

    @Get('allocations')
    @Roles(UserRole.SUPER_ADMIN)
    listAllAllocations(
        @Query('userId') userId?: string,
        @Query('status') status?: AllocationStatus,
        @Query('gameServiceId') gameServiceId?: string,
    ) {
        return this.serviceRegistry.listAllocations({ userId, status, gameServiceId });
    }

    @Patch('allocations/:id/approve')
    @Roles(UserRole.SUPER_ADMIN)
    approveAllocation(@Param('id') id: string, @Req() req: any) {
        return this.serviceRegistry.approveAllocation(id, req.user.id);
    }

    @Patch('allocations/:id/revoke')
    @Roles(UserRole.SUPER_ADMIN)
    revokeAllocation(@Param('id') id: string, @Body('reason') reason?: string) {
        return this.serviceRegistry.revokeAllocation(id, reason);
    }

    // ============================
    // ADMIN / PLAYER REQUESTS
    // ============================

    @Post('my-services/request')
    @Roles(UserRole.ADMIN, UserRole.PLAYER)
    requestAccess(@Body() dto: RequestAllocationDto, @Req() req: any) {
        return this.serviceRegistry.requestAllocation(dto.gameServiceId, req.user.id);
    }

    @Get('my-services')
    @Roles(UserRole.ADMIN, UserRole.PLAYER, UserRole.SUPER_ADMIN)
    getMyServices(@Req() req: any) {
        return this.serviceRegistry.getAvailableServices(req.user.id, req.user.role);
    }
}
