import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { buildCookieOptions, getJwtSecret, JWT_COOKIE_NAME } from './auth.constants';
import { AuthPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.validateCredentials(dto.email, dto.password);
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const token = await this.jwtService.signAsync(payload);
    return { token, payload };
  }

  setAuthCookie(res: Response, token: string) {
    res.cookie(JWT_COOKIE_NAME, token, buildCookieOptions());
  }

  clearAuthCookie(res: Response) {
    res.clearCookie(JWT_COOKIE_NAME, {
      ...buildCookieOptions(),
      maxAge: 0,
    });
  }

  async verifyTokenFromCookie(token?: string): Promise<AuthPayload> {
    if (!token) {
      throw new UnauthorizedException('Auth token missing');
    }

    try {
      return await this.jwtService.verifyAsync<AuthPayload>(token, {
        secret: getJwtSecret(),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async validateCredentials(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }
}
