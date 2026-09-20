import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import { AccountingProviderFinancialService } from './accounting-provider-financial.service';
import type { ProviderFinancialReviewDraftInput } from './accounting-provider-financial-review.policy';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingProviderFinancialController {
  constructor(
    private readonly providerFinancial: AccountingProviderFinancialService,
  ) {}

  @Get('provider-financial/:documentStableId/review-revisions')
  listProviderFinancialReviewRevisions(
    @Param('documentStableId') documentStableId: string,
  ) {
    return this.providerFinancial.listHumanReviewRevisions(documentStableId);
  }

  @Post('provider-financial/:documentStableId/review-revisions')
  createProviderFinancialReviewDraft(
    @Param('documentStableId') documentStableId: string,
    @Body() body: ProviderFinancialReviewDraftInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.providerFinancial.createHumanReviewDraft(
      documentStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post(
    'provider-financial/:documentStableId/review-revisions/:reviewRevisionStableId/confirm',
  )
  confirmProviderFinancialReviewRevision(
    @Param('documentStableId') documentStableId: string,
    @Param('reviewRevisionStableId') reviewRevisionStableId: string,
    @Body() body: { expectedReviewHash: string },
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.providerFinancial.confirmHumanReviewRevision(
      documentStableId,
      reviewRevisionStableId,
      body.expectedReviewHash,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('inbox/:inboxItemStableId/provider-financial/confirm')
  confirmProviderFinancialInboxItem(
    @Param('inboxItemStableId') inboxItemStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.providerFinancial.confirmSelectedInboxFinancialEvidence(
      inboxItemStableId,
      requireAccountingOperatorUserId(req),
    );
  }
}
