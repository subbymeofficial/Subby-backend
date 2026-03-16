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
  ConflictException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GoogleProfile } from './strategies/google.strategy';
import { UserRole } from '../users/schemas/user.schema';
import { GoogleAuthGuard } from './guards/google-auth.guard';

type GoogleAuthIntent = 'login' | 'register';

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
  @UseGuards(GoogleAuthGuard)
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
    try {
      let role: UserRole = UserRole.CLIENT;
      let intent: GoogleAuthIntent = 'login';

      // Backward-compatible: state used to be just the role string
      if (state) {
        try {
          const parsed = JSON.parse(state) as { role?: UserRole; intent?: string };
          if (
            parsed.role === UserRole.CLIENT ||
            parsed.role === UserRole.CONTRACTOR ||
            parsed.role === UserRole.ADMIN
          ) {
            role = parsed.role;
          }
          if (parsed.intent === 'register') intent = 'register';
        } catch {
          // If it's not JSON, treat it as the role
          if (
            (state as UserRole) === UserRole.CLIENT ||
            (state as UserRole) === UserRole.CONTRACTOR ||
            (state as UserRole) === UserRole.ADMIN
          ) {
            role = state as UserRole;
          }
        }
      }

      const result = await this.authService.googleAuth(req.user, role);

      const frontendUrl =
        this.configService.get<string>('frontendUrl') || 'http://localhost:8080';
      let dashboardPath =
        result.user.role === UserRole.ADMIN
          ? '/admin'
          : `/dashboard/${result.user.role}`;
      if (
        result.user.role === UserRole.CONTRACTOR &&
        result.isNewUser
      ) {
        dashboardPath = '/dashboard/contractor/subscription';
      }

      const redirectUrl = `${frontendUrl}${dashboardPath}?accessToken=${result.tokens.accessToken}&refreshToken=${result.tokens.refreshToken}`;
      res.redirect(redirectUrl);
    } catch (error) {
      // Handle errors gracefully by redirecting back to login/register with message
      const frontendUrl =
        this.configService.get<string>('frontendUrl') || 'http://localhost:8080';

      let errorMessage = 'Authentication failed. Please try again.';

      if (error instanceof ConflictException) {
        errorMessage = 'Email already exists. Please sign in with email and password.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      // If we have state, try to return the user to the page they started from
      let intent: GoogleAuthIntent = 'login';
      if (state) {
        try {
          const parsed = JSON.parse(state) as { intent?: string };
          if (parsed.intent === 'register') intent = 'register';
        } catch {
          // ignore
        }
      }

      const redirectPath = intent === 'register' ? '/register' : '/login';
      const redirectUrl = `${frontendUrl}${redirectPath}?error=${encodeURIComponent(errorMessage)}`;
      res.redirect(redirectUrl);
    }
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
