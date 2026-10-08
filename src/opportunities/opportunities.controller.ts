import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPayload } from '../auth/auth.types';
import { ApproveOpportunitiesDto } from './dto/approve-opportunities.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { ListOpportunitiesDto } from './dto/list-opportunities.dto';
import { OpportunitiesService } from './opportunities.service';

type RequestWithUser = Request & { user?: AuthPayload };

@Controller('opportunities')
@UseGuards(JwtAuthGuard)
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query() query: ListOpportunitiesDto) {
    return this.opportunitiesService.list((req.user as AuthPayload).sub, query);
  }

  @Get('status')
  status(@Req() req: RequestWithUser) {
    return this.opportunitiesService.getAutomationStatus((req.user as AuthPayload).sub);
  }

  @Post('run-discovery')
  runDiscovery(@Req() req: RequestWithUser) {
    return this.opportunitiesService.runDiscoveryBatchForUser(req.user as AuthPayload);
  }

  @Post('approve')
  approve(@Req() req: RequestWithUser, @Body() dto: ApproveOpportunitiesDto) {
    return this.opportunitiesService.approveQueuedApplications(req.user as AuthPayload, dto);
  }

  @Post('clear-open')
  clearOpen(@Req() req: RequestWithUser) {
    return this.opportunitiesService.clearOpenOpportunities(req.user as AuthPayload);
  }

  @Post(':id/register-job-application')
  registerInTracker(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.opportunitiesService.registerInTracker(req.user as AuthPayload, id);
  }

  @Post(':id/dismiss')
  dismiss(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.opportunitiesService.dismiss(req.user as AuthPayload, id);
  }

  @Post(':id/feedback')
  feedback(@Req() req: RequestWithUser, @Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.opportunitiesService.addFeedback(req.user as AuthPayload, id, dto);
  }
}
