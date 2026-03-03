import { IsString, IsNumber, IsPositive, IsOptional, IsObject } from 'class-validator';

export class InternalWalletOperationDto {
    @IsString()
    userId: string;

    @IsNumber()
    @IsPositive()
    amount: number;

    @IsString()
    @IsOptional()
    gameRoundId?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsObject()
    @IsOptional()
    metadata?: any;
}

export class InternalTokenVerifyDto {
    @IsString()
    token: string;
}
