import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentQrDto {
    @ApiProperty({ example: 'UPI - Primary' })
    @IsString()
    name: string;

    @ApiProperty({ example: 'UPI', description: 'UPI or BANK' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'URL of QR code image' })
    @IsString()
    qrCodeUrl: string;

    @ApiPropertyOptional({ example: 'username@upi' })
    @IsOptional()
    @IsString()
    upiId?: string;

    @ApiPropertyOptional({ description: 'Bank details JSON' })
    @IsOptional()
    bankDetails?: any;

    @ApiPropertyOptional({ example: 100000, description: 'Daily collection limit' })
    @IsOptional()
    @IsNumber()
    dailyLimit?: number;
}
