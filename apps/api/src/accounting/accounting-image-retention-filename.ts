import * as path from 'node:path';

const LEGACY_RETENTION_PREFIX = /^acctart_[a-z0-9]+-[a-z0-9]+\.webp$/i;

export function accountingExpenseVendorName(
  extractionJson: unknown,
): string | null {
  const root = jsonRecord(extractionJson);
  const textractEvidence = jsonRecord(root.textractEvidence);
  const vendorName = normalizeAccountingImageVendorName(
    textractEvidence.vendorName,
  );
  return vendorName || null;
}

export function accountingRetainedImageFilename(
  vendorName: string,
  timestamp: Date,
): string {
  const vendor = sanitizeVendorFilenamePart(vendorName);
  if (!vendor) {
    throw new Error('vendor name is required for retained image filename');
  }
  const stamp = timestamp.toISOString().replace(/[-:]/g, '').replace('.', '');
  return `${vendor}_${stamp}.webp`;
}

export function accountingRetainedImageVendorFromFilename(
  storedUrl: string | null | undefined,
): string | null {
  if (!storedUrl) return null;
  const fileName = path.basename(storedUrl);
  const match = /^(.+)_\d{8}T\d{9}Z\.webp$/i.exec(fileName);
  return match?.[1]?.trim() || null;
}

export function accountingRetainedImageDisplayFilename(input: {
  retainedStoredUrl: string | null | undefined;
  vendorName: string | null;
  fallbackTimestamp: Date;
  originalFilename: string | null;
}): string | null {
  const retainedFilename = input.retainedStoredUrl
    ? path.basename(input.retainedStoredUrl)
    : null;
  if (retainedFilename && !LEGACY_RETENTION_PREFIX.test(retainedFilename)) {
    return retainedFilename;
  }
  if (input.vendorName) {
    return accountingRetainedImageFilename(
      input.vendorName,
      input.fallbackTimestamp,
    );
  }
  if (retainedFilename) return retainedFilename;
  return input.originalFilename;
}

export function normalizeAccountingImageVendorName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function sanitizeVendorFilenamePart(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\\/]+/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 80);
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
