// apps/api/src/admin/upload/image/admin-image-upload.controller.ts

import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminImageUploadService } from './admin-image-upload.service';
import { AdminMfaGuard } from '../../../auth/admin-mfa.guard';
import { SessionAuthGuard } from '../../../auth/session-auth.guard';
import { Roles } from '../../../auth/roles.decorator';
import { RolesGuard } from '../../../auth/roles.guard';

type UploadedFileType = {
  originalname: string;
  buffer: Buffer;
};

@UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/upload')
export class AdminImageUploadController {
  constructor(private readonly service: AdminImageUploadService) {}

  /**
   * 图片上传接口：
   * POST /api/v1/admin/upload/image
   * form-data: file=<binary>
   * 返回：{ url: string }
   */
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @UploadedFile() file: UploadedFileType | undefined,
  ): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const url = await this.service.saveFileToLocal(file);
    return { url };
  }
}
