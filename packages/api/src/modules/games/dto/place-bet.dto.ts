import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlaceBetDto {
    @ApiProperty({ description: 'Game round ID' })
    @IsString()
    roundId: string;

    @ApiProperty({ example: 100, description: 'Bet amount in INR' })
    @IsNumber()
    @Min(10)
    amount: number;

    @ApiProperty({
        example: 'up',
        description: 'Bet type (varies by game: up, down, seven, player_a, dragon, etc.)',
    })
    @IsString()
    betType: string;

    @ApiPropertyOptional({ description: 'Additional bet data (game-specific)' })
    @IsOptional()
    betData?: any;
}
