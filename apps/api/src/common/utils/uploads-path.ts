import * as path from 'path';

const defaultUploadsDir = path.resolve(process.cwd(), 'uploads');

export function getUploadsRootDir(): string {
  const configuredUploadsDir =
    process.env.UPLOAD_ROOT?.trim() || process.env.UPLOADS_DIR?.trim();
  if (!configuredUploadsDir) {
    return defaultUploadsDir;
  }

  return path.resolve(configuredUploadsDir);
}

export function getUploadsImagesDir(): string {
  return path.join(getUploadsRootDir(), 'images');
}
