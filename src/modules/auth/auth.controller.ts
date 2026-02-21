import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoogleProfile } from './strategies/google.strategy';
import { UserRole } from '../users/schemas/user.schema';

interface JwtUser {
  sub: string;
  email: string;
  role: UserRole;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: JwtUser) {
    return user;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const role = (state as UserRole) || UserRole.CLIENT;
    const result = await this.authService.googleAuth(req.user, role);

    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:8080';
    const dashboardPath =
      result.user.role === UserRole.ADMIN
        ? '/admin'
        : `/dashboard/${result.user.role}`;

    const redirectUrl = `${frontendUrl}${dashboardPath}?accessToken=${result.tokens.accessToken}&refreshToken=${result.tokens.refreshToken}`;
    res.redirect(redirectUrl);
  }
}
