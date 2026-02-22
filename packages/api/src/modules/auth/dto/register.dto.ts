import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({ example: 'player@example.com', description: 'User email address' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'Password123!', description: 'Password (min 6 characters)' })
    @IsString()
    @MinLength(6)
    @MaxLength(50)
    password: string;

    @ApiPropertyOptional({ example: 'John Doe', description: 'Display name' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    displayName?: string;

    @ApiPropertyOptional({ example: 'ABCXY123', description: 'Referral code from another user' })
    @IsOptional()
    @IsString()
    referralCode?: string;
}
