import { Controller, Post, Get, Body, Param, Ip } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { TokenExchangeDto } from './dto/token-exchange.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@ApiTags('Auth')
@Controller('auth')
@Public()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Post('token')
  @ApiOperation({ summary: 'Exchange authorization code for tokens' })
  exchangeToken(@Body() dto: TokenExchangeDto) {
    return this.authService.exchangeToken(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout and revoke tokens' })
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Initiate password reset via email or OTP' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP verification' })
  resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(dto, ip);
  }

  @Get('invite/:token')
  @ApiOperation({ summary: 'Validate invitation token' })
  getInvitation(@Param('token') token: string) {
    return this.authService.getInvitation(token);
  }

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept invitation and create account' })
  acceptInvite(@Body() dto: AcceptInviteDto, @Ip() ip: string) {
    return this.authService.acceptInvite(dto, ip);
  }
}
