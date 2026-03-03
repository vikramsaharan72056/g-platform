import { IsString, IsUrl, IsOptional, IsBoolean } from 'class-validator';

export class RegisterServiceDto {
    @IsString()
    gameId: string;

    @IsUrl({ require_tld: false })
    serviceUrl: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    wsUrl?: string;

    @IsOptional()
    @IsString()
    internalKey?: string;

    @IsOptional()
    @IsBoolean()
    isGlobal?: boolean;
}

export class UpdateServiceDto {
    @IsOptional()
    @IsUrl({ require_tld: false })
    serviceUrl?: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    wsUrl?: string;

    @IsOptional()
    @IsString()
    internalKey?: string;

    @IsOptional()
    @IsBoolean()
    isGlobal?: boolean;
}
