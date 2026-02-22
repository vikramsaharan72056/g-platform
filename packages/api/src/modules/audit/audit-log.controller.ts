import {
    Controller,
    Get,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('admin')
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@ApiBearerAuth()
export class AuditLogController {
    constructor(private readonly auditLogService: AuditLogService) { }

    @Get()
    @ApiOperation({ summary: '[Admin] Get audit logs' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'action', required: false })
    @ApiQuery({ name: 'userId', required: false })
    @ApiQuery({ name: 'resource', required: false })
    async getLogs(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('action') action?: string,
        @Query('userId') userId?: string,
        @Query('resource') resource?: string,
    ) {
        return this.auditLogService.query(
            { userId, action, resource },
            page || 1,
            limit || 20,
        );
    }
}
