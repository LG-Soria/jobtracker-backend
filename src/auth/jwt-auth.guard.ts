import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JWT_COOKIE_NAME } from './auth.constants';
import { AuthPayload } from './auth.types';

type RequestWithUser = Request & { user?: AuthPayload };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = request.cookies?.[JWT_COOKIE_NAME];

    if (!token) {
      throw new UnauthorizedException('Auth token missing');
    }

    const payload = await this.authService.verifyTokenFromCookie(token);
    request.user = payload;
    return true;
  }
}
