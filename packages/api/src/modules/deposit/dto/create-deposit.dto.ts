import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepositDto {
    @ApiProperty({ example: 500, description: 'Deposit amount in INR' })
    @IsNumber()
    @Min(100)
    amount: number;

    @ApiProperty({ description: 'Payment QR code ID' })
    @IsString()
    paymentQrId: string;

    @ApiPropertyOptional({ example: '123456789012', description: 'UTR number' })
    @IsOptional()
    @IsString()
    utrNumber?: string;

    @ApiPropertyOptional({ example: 'UPI', description: 'Payment method (UPI, Bank)' })
    @IsOptional()
    @IsString()
    paymentMethod?: string;

    @ApiPropertyOptional({ description: 'S3 URL of payment screenshot' })
    @IsOptional()
    @IsString()
    screenshotUrl?: string;
}
