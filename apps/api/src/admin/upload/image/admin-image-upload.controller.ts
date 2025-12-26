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
import { AdminAuthGuard } from '../../../auth/admin-auth.guard';

type UploadedFileType = {
  originalname: string;
  buffer: Buffer;
};

@UseGuards(AdminAuthGuard)
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
