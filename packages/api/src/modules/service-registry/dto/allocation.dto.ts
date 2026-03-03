import { IsString, IsEnum, IsOptional } from 'class-validator';
import { UserRole, AllocationStatus } from '@prisma/client';

export class RequestAllocationDto {
    @IsString()
    gameServiceId: string;
}

export class ManageAllocationDto {
    @IsOptional()
    @IsEnum(AllocationStatus)
    status?: AllocationStatus;

    @IsOptional()
    @IsString()
    revokeReason?: string;
}

export class CreateAllocationDto {
    @IsString()
    gameServiceId: string;

    @IsString()
    userId: string;

    @IsEnum(UserRole)
    allocatedRole: UserRole;
}
