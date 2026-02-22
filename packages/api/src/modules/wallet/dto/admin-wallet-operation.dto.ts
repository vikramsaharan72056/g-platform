import { IsNotEmpty, IsString, IsNumber, IsPositive, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminWalletOperationDto {
    @ApiProperty({ description: 'User ID to credit/debit' })
    @IsNotEmpty()
    @IsUUID()
    userId: string;

    @ApiProperty({ description: 'Amount to credit/debit', minimum: 1 })
    @IsNotEmpty()
    @IsNumber()
    @IsPositive()
    amount: number;

    @ApiProperty({ description: 'Reason for the operation' })
    @IsNotEmpty()
    @IsString()
    reason: string;
}
