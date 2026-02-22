import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ example: 'player@example.com', description: 'User email address' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'Password123!', description: 'User password' })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiPropertyOptional({ example: '123456', description: '2FA code (if enabled)' })
    @IsOptional()
    @IsString()
    twoFactorCode?: string;
}
