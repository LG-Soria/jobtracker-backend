import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPayload } from '../auth/auth.types';
import { CvVariantsService } from './cv-variants.service';
import { CreateCvVariantDto } from './dto/create-cv-variant.dto';
import { UploadCvVariantDto } from './dto/upload-cv-variant.dto';
import { UpdateCvVariantDto } from './dto/update-cv-variant.dto';

type RequestWithUser = Request & { user?: AuthPayload };
type UploadedCvFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname: string;
};

@Controller('cv-variants')
@UseGuards(JwtAuthGuard)
export class CvVariantsController {
  constructor(private readonly cvVariantsService: CvVariantsService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.cvVariantsService.list((req.user as AuthPayload).sub);
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() dto: CreateCvVariantDto) {
    return this.cvVariantsService.create((req.user as AuthPayload).sub, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() req: RequestWithUser,
    @UploadedFile() file: UploadedCvFile | undefined,
    @Body() dto: UploadCvVariantDto,
  ) {
    if (!file) {
      throw new BadRequestException('CV file is required.');
    }

    return this.cvVariantsService.createFromUpload((req.user as AuthPayload).sub, dto, file);
  }

  @Patch(':id')
  update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateCvVariantDto) {
    return this.cvVariantsService.update((req.user as AuthPayload).sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.cvVariantsService.remove((req.user as AuthPayload).sub, id);
  }
}
