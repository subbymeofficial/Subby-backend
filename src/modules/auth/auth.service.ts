import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { UserRole, UserDocument } from '../users/schemas/user.schema';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResponse {
  user: Partial<UserDocument>;
  tokens: AuthTokens;
  isNewUser?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const user = await this.usersService.create({
      ...registerDto,
      role: (registerDto.roles && registerDto.roles[0]) || registerDto.role || UserRole.CLIENT,
      roles: registerDto.roles && registerDto.roles.length ? registerDto.roles : [registerDto.role || UserRole.CLIENT],
      activeRole: (registerDto.roles && registerDto.roles[0]) || registerDto.role || UserRole.CLIENT,
      availability: { isAvailable: false, busyDates: [] },
    });

    const tokens = this.generateTokens(user);
    return { user: this.sanitizeUser(user), tokens };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(loginDto.email, true);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses Google sign-in. Please sign in with Google.',
      );
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    const tokens = this.generateTokens(user);
    return { user: this.sanitizeUser(user), tokens };
  }

  async googleAuth(
    googleProfile: GoogleProfile,
    role: UserRole = UserRole.CLIENT,
  ): Promise<AuthResponse> {
    let user = await this.usersService.findByGoogleId(googleProfile.googleId);
    let isNewUser = false;

    if (!user) {
      const existingUser = await this.usersService.findByEmail(googleProfile.email);
      if (existingUser) {
        throw new ConflictException(
          'An account with this email already exists. Please sign in with email and password.',
        );
      }

      user = await this.usersService.createOAuthUser({
        ...googleProfile,
        role,
      });
      isNewUser = true;
    }

    const tokens = this.generateTokens(user);
    return { user: this.sanitizeUser(user), tokens, isNewUser };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(
      (await this.usersService.findById(userId)).email,
      true,
    );
    if (!user || !user.password) {
      throw new UnauthorizedException(
        'Cannot change password for Google sign-in accounts',
      );
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.usersService.update(userId, { password: hashed } as any);
    return { message: 'Password changed successfully' };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private generateTokens(user: UserDocument): AuthTokens {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.activeRole || user.role,
      roles: user.roles && user.roles.length ? user.roles : [user.role],
      activeRole: user.activeRole || user.role,
    };

    const expiresIn = this.configService.get<string>('jwt.expiresIn') || '7d';
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') || '30d';

    const accessToken = this.jwtService.sign(payload, { expiresIn });
    const refreshToken = this.jwtService.sign(
      { sub: payload.sub },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn,
      },
    );

    return { accessToken, refreshToken, expiresIn };
  }

  private sanitizeUser(user: UserDocument): Partial<UserDocument> {
    const userObj = user.toJSON() as Record<string, unknown>;
    userObj['password'] = undefined;
    return userObj as Partial<UserDocument>;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email, false);
    
    if (!user) {
      return { 
        message: 'If an account exists with this email, a reset link has been sent.' 
      };
    }

    if (user.googleId && !user.password) {
      return { 
        message: 'If an account exists with this email, a reset link has been sent.' 
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    const expiryTime = new Date(Date.now() + 30 * 60 * 1000);

    await this.usersService.update(user._id.toString(), {
      resetPasswordToken: hashedToken,
      resetPasswordExpiry: expiryTime,
    } as any);

    try {
      await this.emailService.sendPasswordResetEmail(email, resetToken);
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      await this.usersService.update(user._id.toString(), {
        resetPasswordToken: undefined,
        resetPasswordExpiry: undefined,
      } as any);

      // Development fallback: log reset link when SMTP fails (e.g. Gmail credentials)
      const isDev = process.env.NODE_ENV !== 'production';
      if (isDev) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
        console.log('\n--- DEV: Password reset link (SMTP failed, use this to test) ---');
        console.log(resetUrl);
        console.log('--- Copy the link above and open in browser ---\n');
        // Re-store the token so the link works
        await this.usersService.update(user._id.toString(), {
          resetPasswordToken: hashedToken,
          resetPasswordExpiry: expiryTime,
        } as any);
        return { message: 'If an account exists with this email, a reset link has been sent.' };
      }

      throw new BadRequestException('Failed to send password reset email. Please try again.');
    }

    return { 
      message: 'If an account exists with this email, a reset link has been sent.' 
    };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    if (!token || !newPassword) {
      throw new BadRequestException('Token and new password are required');
    }

    const users = await this.usersService['userModel']
      .find({ isDeleted: false })
      .select('+resetPasswordToken +resetPasswordExpiry')
      .exec();

    let matchedUser: UserDocument | null = null;

    for (const user of users) {
      if (!user.resetPasswordToken || !user.resetPasswordExpiry) {
        continue;
      }

      const isTokenValid = await bcrypt.compare(token, user.resetPasswordToken);
      
      if (isTokenValid) {
        if (new Date() > user.resetPasswordExpiry) {
          throw new BadRequestException('Password reset token has expired');
        }
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    if (matchedUser.googleId && !matchedUser.password) {
      throw new BadRequestException('Cannot reset password for Google sign-in accounts');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.usersService.update(matchedUser._id.toString(), {
      password: hashedPassword,
      resetPasswordToken: undefined,
      resetPasswordExpiry: undefined,
    } as any);

    return { message: 'Password has been reset successfully. You can now sign in with your new password.' };
  }
}
