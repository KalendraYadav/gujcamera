import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async login(loginDto: LoginDto, requestId?: string) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !user.isActive) {
      await this.logAuthAudit(null, 'USER_LOGIN_FAILED', { email: loginDto.email, reason: 'User not found or inactive' }, requestId);
      throw new UnauthorizedException({
        error_code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    const isMatch = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isMatch) {
      await this.logAuthAudit(user.id, 'USER_LOGIN_FAILED', { email: loginDto.email, reason: 'Password mismatch' }, requestId);
      throw new UnauthorizedException({
        error_code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    // Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
      departmentId: user.departmentId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, tokenType: 'refresh' },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    );

    // Synchronous audit logging for successful login (master_architecture.md Section 7.2)
    await this.logAuthAudit(user.id, 'USER_LOGIN_SUCCESS', { email: user.email, role: user.role.name }, requestId);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 900, // 15 minutes
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name,
        department_id: user.departmentId,
        department_name: user.department.name,
        mfa_enabled: user.mfaEnabled,
      },
    };
  }

  async refresh(refreshTokenDto: RefreshTokenDto) {
    try {
      const decoded: any = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (decoded.tokenType !== 'refresh' || !decoded.sub) {
        throw new UnauthorizedException({
          error_code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid refresh token type',
        });
      }

      const user = await this.usersService.findById(decoded.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException({
          error_code: 'INVALID_REFRESH_TOKEN',
          message: 'User no longer active',
        });
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role.name,
        departmentId: user.departmentId,
      };

      const newAccessToken = this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
      });

      const newRefreshToken = this.jwtService.sign(
        { sub: user.id, tokenType: 'refresh' },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
        },
      );

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: 900,
      };
    } catch (err: any) {
      throw new UnauthorizedException({
        error_code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token expired or invalid',
      });
    }
  }

  private async logAuthAudit(actorId: string | null, action: string, details: any, correlationId?: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource: 'Auth',
          before: null,
          after: details,
          correlationId: correlationId && correlationId.length === 36 ? correlationId : null,
        },
      });
    } catch (err) {
      this.logger.error('Failed to write auth audit log', err);
    }
  }
}
