import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class IngestWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const configuredSecret = process.env.INGEST_WEBHOOK_SECRET?.trim();

    if (!configuredSecret) {
      throw new UnauthorizedException('Ingest webhook is not configured.');
    }

    const providedSecret = request.header('x-ingest-key')?.trim();
    if (!providedSecret || providedSecret !== configuredSecret) {
      throw new UnauthorizedException('Invalid ingest webhook key.');
    }

    return true;
  }
}
