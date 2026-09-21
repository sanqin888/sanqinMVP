import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingArtifactBinaryRetentionState } from './accounting-contracts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAccountingUploadsDir } from './accounting-storage-path';
import { AccountingInboxService } from './accounting-inbox.service';

const INBOX_FILE_PREFIX = '/api/v1/accounting/files/inbox/';
const RETENTION_FILE_PREFIX = '/api/v1/accounting/files/image-retention/';

@Injectable()
export class AccountingArtifactDeliveryService {
  constructor(private readonly inbox: AccountingInboxService) {}

  async resolveArtifactContent(artifactStableId: string) {
    const context =
      await this.inbox.readArtifactContentContext(artifactStableId);
    if (!context) {
      throw new NotFoundException('accounting evidence not found');
    }

    let storedUrl = context.storedUrl;
    let mimeType = context.mimeType;
    let retainedDerivative = false;

    const retention = context.binaryRetention;
    if (
      retention &&
      (retention.state ===
        AccountingArtifactBinaryRetentionState.PURGE_PENDING ||
        retention.state ===
          AccountingArtifactBinaryRetentionState.COMPRESSED_ONLY) &&
      retention.retainedStoredUrl &&
      retention.retainedMimeType
    ) {
      storedUrl = retention.retainedStoredUrl;
      mimeType = retention.retainedMimeType;
      retainedDerivative = true;
    }

    if (!storedUrl || !mimeType) {
      throw new NotFoundException('accounting evidence binary not found');
    }

    const filePath = resolveArtifactStoredUrl(storedUrl);
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      throw new NotFoundException('accounting evidence binary not found');
    }

    return {
      filePath,
      mimeType,
      filename: artifactDeliveryFilename({
        artifactStableId: context.artifactStableId,
        originalFilename: context.originalFilename,
        filePath,
        mimeType,
        retainedDerivative,
      }),
      retainedDerivative,
    };
  }
}

export function accountingArtifactContentUrl(
  artifactStableId: string,
): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/content`;
}

export function accountingArtifactDownloadUrl(
  artifactStableId: string,
): string {
  return `/api/v1/accounting/inbox/artifacts/${encodeURIComponent(artifactStableId)}/download`;
}

export function accountingArtifactContentDisposition(
  disposition: 'inline' | 'attachment',
  filename: string,
): string {
  const normalized = path.basename(filename).replace(/[\r\n]/g, '').trim();
  const safeName = normalized || 'accounting-evidence';
  const asciiFallback =
    safeName
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_')
      .slice(0, 180) || 'accounting-evidence';
  const encoded = encodeURIComponent(safeName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function resolveArtifactStoredUrl(storedUrl: string): string {
  const candidates = [
    {
      prefix: INBOX_FILE_PREFIX,
      directory: 'inbox',
    },
    {
      prefix: RETENTION_FILE_PREFIX,
      directory: 'image-retention',
    },
  ] as const;

  const candidate = candidates.find(({ prefix }) =>
    storedUrl.startsWith(prefix),
  );
  if (!candidate) {
    throw new ConflictException('accounting evidence path is invalid');
  }

  const relativeName = storedUrl.slice(candidate.prefix.length);
  const fileName = path.basename(relativeName);
  if (!fileName || relativeName !== fileName) {
    throw new ConflictException('accounting evidence path is invalid');
  }

  return path.join(getAccountingUploadsDir(), candidate.directory, fileName);
}

function artifactDeliveryFilename(input: {
  artifactStableId: string;
  originalFilename: string | null;
  filePath: string;
  mimeType: string;
  retainedDerivative: boolean;
}): string {
  if (!input.retainedDerivative) {
    return (
      input.originalFilename?.trim() ||
      path.basename(input.filePath) ||
      input.artifactStableId
    );
  }

  const original =
    input.originalFilename?.trim() ||
    path.basename(input.filePath) ||
    input.artifactStableId;
  const parsed = path.parse(original);
  const extension =
    extensionForMimeType(input.mimeType) || path.extname(input.filePath);
  return `${parsed.name || input.artifactStableId}-retained${extension}`;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'application/pdf':
      return '.pdf';
    case 'text/csv':
    case 'text/csv; charset=utf-8':
      return '.csv';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return '.xlsx';
    default:
      return '';
  }
}
