import { IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWithdrawalDto {
    @ApiProperty({ example: 500, description: 'Withdrawal amount in INR' })
    @IsNumber()
    @Min(100)
    amount: number;

    @ApiProperty({ example: 'UPI', description: 'Payout method (UPI, BANK)' })
    @IsString()
    payoutMethod: string;

    @ApiProperty({
        example: { upiId: 'username@upi' },
        description: 'Payout details (UPI ID or bank details)',
    })
    payoutDetails: any;
}
