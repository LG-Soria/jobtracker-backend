import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPayload } from '../auth/auth.types';
import { SearchProfilesService } from './search-profiles.service';
import { CreateSearchProfileDto } from './dto/create-search-profile.dto';
import { UpdateSearchProfileDto } from './dto/update-search-profile.dto';

type RequestWithUser = Request & { user?: AuthPayload };

@Controller('search-profiles')
@UseGuards(JwtAuthGuard)
export class SearchProfilesController {
  constructor(private readonly searchProfilesService: SearchProfilesService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.searchProfilesService.list((req.user as AuthPayload).sub);
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateSearchProfileDto) {
    return this.searchProfilesService.create((req.user as AuthPayload).sub, dto);
  }

  @Patch(':id')
  update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateSearchProfileDto) {
    return this.searchProfilesService.update((req.user as AuthPayload).sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.searchProfilesService.remove((req.user as AuthPayload).sub, id);
  }
}
