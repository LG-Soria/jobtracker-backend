// Specification: Controller for /job-applications REST endpoints.
// Exposes CRUD endpoints and forwards requests to JobApplicationsService.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthPayload } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateJobApplicationDto } from './dto/create-job-application.dto';
import { ListJobApplicationsQueryDto } from './dto/list-job-applications.dto';
import { UpdateJobApplicationDto } from './dto/update-job-application.dto';
import { JobApplicationsService } from './job-applications.service';

type RequestWithUser = Request & { user: AuthPayload };

@Controller('job-applications')
@UseGuards(JwtAuthGuard)
export class JobApplicationsController {
  constructor(private readonly service: JobApplicationsService) {}

  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query() query: ListJobApplicationsQueryDto,
  ) {
    return this.service.findAll(req.user.sub, query);
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Req() req: RequestWithUser, @Body() dto: CreateJobApplicationDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobApplicationDto,
  ) {
    return this.service.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.remove(req.user.sub, id);
  }
}
