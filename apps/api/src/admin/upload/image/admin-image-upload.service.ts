// apps/api/src/admin/upload/image/admin-image-upload.service.ts

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
};

@Injectable()
export class AdminImageUploadService {
  private readonly logger = new Logger(AdminImageUploadService.name);

  /**
   * 把上传的文件保存到本地，并返回可用于前端的 URL
   */
  async saveFileToLocal(file: UploadedFile): Promise<string> {
    // 你可以按自己的目录调整
    const uploadDir = path.join(process.cwd(), 'uploads', 'images');

    await fs.promises.mkdir(uploadDir, { recursive: true });

    const ext = path.extname(file.originalname) || '.jpg';
    const fileName = `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}${ext}`;
    const targetPath = path.join(uploadDir, fileName);

    await fs.promises.writeFile(targetPath, file.buffer);

    // 这里是返回给前端的 URL 前缀，后面你在 Nest 里用静态资源或 Nginx 映射
    const urlPath = `/uploads/images/${fileName}`;

    this.logger.log(`Image uploaded: ${urlPath}`);

    return urlPath;
  }
}
