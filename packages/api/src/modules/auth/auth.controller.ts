import {
    Controller,
    Post,
    Get,
    Body,
    UseGuards,
    Request,
    Ip,
    Headers,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @ApiOperation({ summary: 'Register a new user account' })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    @ApiResponse({ status: 409, description: 'Email already exists' })
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login with email and password (+ optional 2FA code)' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @ApiResponse({ status: 401, description: 'Invalid credentials' })
    async login(
        @Body() dto: LoginDto,
        @Ip() ip: string,
        @Headers('user-agent') userAgent: string,
    ) {
        return this.authService.login(dto, ip, userAgent);
    }

    @Post('refresh')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Refresh JWT token' })
    @ApiResponse({ status: 200, description: 'New token issued' })
    async refreshToken(@Request() req) {
        return this.authService.refreshToken(req.user.userId);
    }

    @Get('profile')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'User profile returned' })
    async getProfile(@Request() req) {
        return this.authService.getProfile(req.user.userId);
    }

    // ======================== 2FA ========================

    @Post('2fa/setup')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Setup 2FA — generates QR code' })
    @ApiResponse({ status: 200, description: 'QR code and secret returned' })
    async setup2FA(@Request() req) {
        return this.authService.setup2FA(req.user.userId);
    }

    @Post('2fa/verify')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Verify 2FA code to enable it' })
    @ApiResponse({ status: 200, description: '2FA enabled, backup codes returned' })
    async verify2FA(
        @Request() req,
        @Body('token') token: string,
    ) {
        return this.authService.verify2FA(req.user.userId, token);
    }

    @Post('2fa/disable')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Disable 2FA (requires password)' })
    @ApiResponse({ status: 200, description: '2FA disabled' })
    async disable2FA(
        @Request() req,
        @Body('password') password: string,
    ) {
        return this.authService.disable2FA(req.user.userId, password);
    }

    // ======================== PASSWORD RESET ========================

    @Post('forgot-password')
    @ApiOperation({ summary: 'Request password reset token' })
    @ApiResponse({ status: 200, description: 'Reset email sent (if account exists)' })
    async forgotPassword(@Body('email') email: string) {
        return this.authService.forgotPassword(email);
    }

    @Post('reset-password')
    @ApiOperation({ summary: 'Reset password with reset token' })
    @ApiResponse({ status: 200, description: 'Password reset successfully' })
    async resetPassword(
        @Body('token') token: string,
        @Body('newPassword') newPassword: string,
    ) {
        return this.authService.resetPassword(token, newPassword);
    }

    // ======================== LOGIN HISTORY ========================

    @Get('login-history')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get login history' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getLoginHistory(
        @Request() req,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.authService.getLoginHistory(
            req.user.userId,
            page || 1,
            limit || 20,
        );
    }
}
