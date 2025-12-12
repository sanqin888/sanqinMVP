// apps/api/src/admin/upload/image/admin-image-upload.module.ts

import { Module } from '@nestjs/common';
import { AdminImageUploadController } from './admin-image-upload.controller';
import { AdminImageUploadService } from './admin-image-upload.service';

@Module({
  controllers: [AdminImageUploadController],
  providers: [AdminImageUploadService],
  exports: [AdminImageUploadService],
})
export class AdminImageUploadModule {}
