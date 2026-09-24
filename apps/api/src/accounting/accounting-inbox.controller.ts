import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  AccountingFinancialProvider,
  AccountingInboxClassification,
  AccountingInboxStatus,
  AccountingProviderRecognitionMatchMode,
} from './accounting-contracts';
import {
  type AuthedAccountingRequest,
  parseNonNegativeAccountingNumber,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingInboxService } from './accounting-inbox.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingInboxController {
  constructor(private readonly inbox: AccountingInboxService) {}

  @Get('inbox')
  listInbox(
    @Query('status') status?: AccountingInboxStatus,
    @Query('classification') classification?: AccountingInboxClassification,
    @Query('limit') limit?: string,
    @Query('materializedEntityStableId') materializedEntityStableId?: string,
  ) {
    return this.inbox.listUnifiedInboxItems({
      status,
      classification,
      limit: parseNonNegativeAccountingNumber(limit, 'limit'),
      materializedEntityStableId,
    });
  }

  @Get('inbox/image-retention/pending')
  imageRetentionQueue(@Query('limit') limit?: string) {
    return this.inbox.listImageRetentionQueue(
      parseNonNegativeAccountingNumber(limit, 'limit'),
    );
  }

  @Get('inbox/manual-uploads')
  manualUploadLibrary(@Query('limit') limit?: string) {
    return this.inbox.listManualUploadLibrary(
      parseNonNegativeAccountingNumber(limit, 'limit'),
    );
  }

  @Get('inbox/provider-recognition-rules')
  listProviderRecognitionRules() {
    return this.inbox.listProviderRecognitionRules();
  }

  @Put('inbox/provider-recognition-rules/:ruleStableId')
  updateProviderRecognitionRule(
    @Param('ruleStableId') ruleStableId: string,
    @Body()
    body: {
      requiredKeywords: string[];
      optionalKeywords: string[];
      optionalMatchMode: AccountingProviderRecognitionMatchMode;
      priority: number;
      isActive: boolean;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.inbox.updateProviderRecognitionRule(
      ruleStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('inbox/trusted-senders')
  listTrustedSenders() {
    return this.inbox.listTrustedSenders();
  }

  @Put('inbox/trusted-senders')
  upsertTrustedSender(
    @Body() body: { email: string; label?: string | null; isActive?: boolean },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.inbox.upsertTrustedSender(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Put('inbox/:inboxItemStableId/classification')
  setInboxClassification(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Body()
    body: {
      classification: AccountingInboxClassification;
      selectedProvider?: AccountingFinancialProvider | null;
    },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.inbox.setUnifiedInboxClassification(
      inboxItemStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('inbox/:inboxItemStableId/other/confirm')
  confirmInboxOther(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.inbox.confirmUnifiedInboxOther(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Delete('inbox/:inboxItemStableId')
  discardInboxItem(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.inbox.discardUnifiedInboxItem(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }
}
