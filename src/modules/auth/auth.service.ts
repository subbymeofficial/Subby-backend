import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
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
}

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const user = await this.usersService.create({
      ...registerDto,
      role: registerDto.role || UserRole.CLIENT,
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
    }

    const tokens = this.generateTokens(user);
    return { user: this.sanitizeUser(user), tokens };
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
      role: user.role,
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
}
