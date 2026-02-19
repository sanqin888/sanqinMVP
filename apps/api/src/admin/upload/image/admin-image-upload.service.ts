// apps/api/src/admin/upload/image/admin-image-upload.service.ts

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsImagesDir } from '../../../common/utils/uploads-path';

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
};

@Injectable()
export class AdminImageUploadService {
  private readonly logger = new Logger(AdminImageUploadService.name);
  private readonly allowedExtensions = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
  ]);
  private readonly extensionMap = new Map<string, string[]>([
    ['jpeg', ['.jpg', '.jpeg']],
    ['png', ['.png']],
    ['gif', ['.gif']],
    ['webp', ['.webp']],
    ['svg', ['.svg']],
  ]);

  /**
   * 把上传的文件保存到本地，并返回可用于前端的 URL
   */
  async saveFileToLocal(file: UploadedFile): Promise<string> {
    // 你可以按自己的目录调整
    const uploadDir = getUploadsImagesDir();

    await fs.promises.mkdir(uploadDir, { recursive: true });

    const extFromName = path.extname(file.originalname).toLowerCase();
    const detectedType = this.detectImageType(file.buffer);

    if (!detectedType) {
      throw new BadRequestException('Unsupported or invalid image format.');
    }

    const allowedExtensions = this.extensionMap.get(detectedType) ?? [];

    if (extFromName && !this.allowedExtensions.has(extFromName)) {
      throw new BadRequestException('Unsupported file extension.');
    }

    if (extFromName && !allowedExtensions.includes(extFromName)) {
      throw new BadRequestException('File extension does not match file type.');
    }

    const ext = extFromName || allowedExtensions[0];
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

  async listLocalImages(): Promise<string[]> {
    const uploadDir = getUploadsImagesDir();

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(uploadDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) =>
        this.allowedExtensions.has(path.extname(name).toLowerCase()),
      )
      .sort()
      .map((name) => `/uploads/images/${name}`);
  }

  async deleteLocalImageByUrl(imageUrl: string): Promise<void> {
    const trimmed = imageUrl.trim();
    if (!trimmed) {
      throw new BadRequestException('imageUrl is required');
    }

    const normalized = trimmed.split('?')[0].split('#')[0];
    const expectedPrefix = '/uploads/images/';

    if (!normalized.startsWith(expectedPrefix)) {
      throw new BadRequestException('Invalid image url.');
    }

    const fileName = normalized.slice(expectedPrefix.length);
    if (!fileName || fileName.includes('/') || fileName.includes('\\')) {
      throw new BadRequestException('Invalid image filename.');
    }

    const ext = path.extname(fileName).toLowerCase();
    if (!this.allowedExtensions.has(ext)) {
      throw new BadRequestException('Unsupported file extension.');
    }

    const uploadDir = getUploadsImagesDir();
    const targetPath = path.join(uploadDir, fileName);

    try {
      await fs.promises.unlink(targetPath);
      this.logger.log(`Image deleted: ${normalized}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  private detectImageType(buffer: Buffer): string | null {
    if (buffer.length < 12) {
      return null;
    }

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpeg';
    }

    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (pngSignature.every((byte, index) => buffer[index] === byte)) {
      return 'png';
    }

    const gifHeader = buffer.subarray(0, 6).toString('ascii');
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return 'gif';
    }

    const riffHeader = buffer.subarray(0, 4).toString('ascii');
    const webpHeader = buffer.subarray(8, 12).toString('ascii');
    if (riffHeader === 'RIFF' && webpHeader === 'WEBP') {
      return 'webp';
    }

    const sample = buffer.subarray(0, 1024).toString('utf8');
    const trimmedSample = sample.replace(/^\uFEFF/, '').trimStart();
    if (/<svg[\s>]/i.test(trimmedSample)) {
      return 'svg';
    }

    return null;
  }
}
