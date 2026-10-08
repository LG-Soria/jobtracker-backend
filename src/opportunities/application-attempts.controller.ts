import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPayload } from '../auth/auth.types';
import { ApplicationAttemptsService } from './application-attempts.service';

type RequestWithUser = Request & { user?: AuthPayload };

@Controller('application-attempts')
@UseGuards(JwtAuthGuard)
export class ApplicationAttemptsController {
  constructor(private readonly applicationAttemptsService: ApplicationAttemptsService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.applicationAttemptsService.list((req.user as AuthPayload).sub);
  }
}
