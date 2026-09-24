import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  ACCOUNTING_INBOX_FILE_MAX_BYTES,
  AccountingInboxAcquisitionService,
} from './accounting-inbox-acquisition.service';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import {
  AccountingArtifactDeliveryService,
  accountingArtifactContentDisposition,
} from './accounting-artifact-delivery.service';
import { AccountingEvidenceFileManagerService } from './accounting-evidence-file-manager.service';
import { AccountingImageRetentionService } from './accounting-image-retention.service';
import { AccountingTabularPreviewService } from './accounting-tabular-preview.service';
import type { AccountingImageRetentionProfile } from './accounting-receipt-image';
import { getAccountingUploadsDir } from './accounting-storage-path';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingInboxArtifactsController {
  constructor(
    private readonly acquisition: AccountingInboxAcquisitionService,
    private readonly imageRetention: AccountingImageRetentionService,
    private readonly artifactDelivery: AccountingArtifactDeliveryService,
    private readonly evidenceFileManager: AccountingEvidenceFileManagerService,
    private readonly tabularPreview: AccountingTabularPreviewService,
  ) {}

  @Post('inbox/artifacts')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: ACCOUNTING_INBOX_FILE_MAX_BYTES },
    }),
  )
  async uploadInboxArtifact(
    @UploadedFile()
    file:
      | { originalname: string; mimetype?: string; buffer: Buffer }
      | undefined,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.acquisition.acquireManualFile(file);
  }

  @Post('inbox/:inboxItemStableId/image-retention/candidate')
  createImageRetentionCandidate(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Body()
    body: { profile?: AccountingImageRetentionProfile; vendorName?: string },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.imageRetention.createCandidate(
      inboxItemStableId,
      body.profile ?? 'BALANCED',
      body.vendorName ?? '',
      requireAccountingOperatorUserId(req),
    );
  }

  @Delete('inbox/:inboxItemStableId/image-retention/candidate')
  discardImageRetentionCandidate(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.imageRetention.discardCandidate(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('inbox/:inboxItemStableId/image-retention/accept')
  acceptImageRetentionCandidate(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.imageRetention.acceptCandidate(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('evidence-file-manager')
  accountingEvidenceFileManager() {
    return this.evidenceFileManager.listFileManager();
  }

  @Post('evidence-folders')
  createAccountingEvidenceFolder(
    @Body() body: { name?: unknown },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.evidenceFileManager.createFolder(
      body.name,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('evidence-files/move')
  moveAccountingEvidenceFiles(
    @Body()
    body: {
      artifactStableIds?: unknown;
      targetFolderStableId?: unknown;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.evidenceFileManager.moveArtifacts(
      {
        artifactStableIds: body.artifactStableIds,
        targetFolderStableId: body.targetFolderStableId,
      },
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('inbox/artifacts/:artifactStableId/tabular-preview')
  accountingInboxArtifactTabularPreview(
    @Param('artifactStableId') artifactStableId: string,
    @Query('sheetIndex') sheetIndex?: string,
  ) {
    return this.tabularPreview.previewArtifact(artifactStableId, sheetIndex);
  }

  @Get('inbox/artifacts/:artifactStableId/content')
  async accountingInboxArtifactContent(
    @Param('artifactStableId') artifactStableId: string,
    @Res() res: Response,
  ) {
    const resolved =
      await this.artifactDelivery.resolveArtifactContent(artifactStableId);
    this.setArtifactDeliveryHeaders(res, resolved, 'inline');
    return res.sendFile(resolved.filePath);
  }

  @Get('inbox/artifacts/:artifactStableId/download')
  async accountingInboxArtifactDownload(
    @Param('artifactStableId') artifactStableId: string,
    @Res() res: Response,
  ) {
    const resolved =
      await this.artifactDelivery.resolveArtifactContent(artifactStableId);
    this.setArtifactDeliveryHeaders(res, resolved, 'attachment');
    return res.sendFile(resolved.filePath);
  }

  @Delete('inbox/manual-uploads/:inboxItemStableId/permanent')
  permanentlyDeleteManualUpload(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.acquisition.permanentlyDeleteManualUpload(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  private setArtifactDeliveryHeaders(
    res: Response,
    resolved: Awaited<
      ReturnType<AccountingArtifactDeliveryService['resolveArtifactContent']>
    >,
    disposition: 'inline' | 'attachment',
  ) {
    res.setHeader('Content-Type', resolved.mimeType);
    res.setHeader(
      'Content-Disposition',
      accountingArtifactContentDisposition(disposition, resolved.filename),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
  }

  @Get('files/:kind/:fileName')
  accountingFile(
    @Param('kind') kind: string,
    @Param('fileName') fileName: string,
    @Res() res: Response,
  ) {
    const safeName = path.basename(fileName);
    const extension = path.extname(safeName).toLowerCase();
    const imageContentType =
      extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.png'
          ? 'image/png'
          : extension === '.webp'
            ? 'image/webp'
            : null;
    let contentType: string | null = null;
    if ((kind === 'bills' || kind === 'inbox') && extension === '.pdf') {
      contentType = 'application/pdf';
    } else if (
      (kind === 'uber-reports' || kind === 'inbox') &&
      extension === '.csv'
    ) {
      contentType = 'text/csv; charset=utf-8';
    } else if (kind === 'inbox' && extension === '.xlsx') {
      contentType =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else if (
      (kind === 'bills' ||
        kind === 'receipts' ||
        kind === 'inbox' ||
        kind === 'image-retention') &&
      imageContentType
    ) {
      contentType = imageContentType;
    }
    if (!contentType || safeName !== fileName) {
      throw new NotFoundException('accounting file not found');
    }
    const filePath = path.join(getAccountingUploadsDir(), kind, safeName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('accounting file not found');
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(filePath);
  }
}
