import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiPropertyOptional({ example: 'John Doe' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    displayName?: string;

    @ApiPropertyOptional({ example: '+919876543210' })
    @IsOptional()
    @IsString()
    @MaxLength(15)
    phone?: string;
}
