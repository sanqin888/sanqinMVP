import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from './accounting-controller-support';
import type {
  CreateAccountingExternalSaleInputV1,
  CreateAccountingExternalSaleSettlementInputV1,
  ReverseAccountingExternalSaleInputV1,
} from './accounting-external-sales.contract';
import type {
  AccountingExternalSaleReconstructionExecuteInputV1,
  AccountingExternalSaleReconstructionPreviewInputV1,
} from './accounting-external-sales-reconstruction.contract';
import { AccountingExternalSalesReconstructionService } from './accounting-external-sales-reconstruction.service';
import { AccountingExternalSaleSettlementService } from './accounting-external-sale-settlement.service';
import { AccountingExternalSalesQueryService } from './accounting-external-sales-query.service';
import { AccountingExternalSaleReversalService } from './accounting-external-sales-reversal.service';
import { AccountingExternalSalesService } from './accounting-external-sales.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingExternalSalesController {
  constructor(
    private readonly externalSales: AccountingExternalSalesService,
    private readonly settlements: AccountingExternalSaleSettlementService,
    private readonly reversals: AccountingExternalSaleReversalService,
    private readonly queries: AccountingExternalSalesQueryService,
    private readonly reconstruction: AccountingExternalSalesReconstructionService,
  ) {}

  @Get('external-sales')
  listExternalSales(@Query('limit') limit?: string) {
    return this.queries.listSales(limit);
  }

  @Get('external-sales/options')
  externalSaleFormOptions() {
    return this.queries.formOptions();
  }

  @Get('external-sales/settlements')
  listExternalSaleSettlements(@Query('limit') limit?: string) {
    return this.queries.listSettlements(limit);
  }

  @Get('external-sales/:externalSaleStableId')
  externalSaleDetail(
    @Param('externalSaleStableId') externalSaleStableId: string,
  ) {
    return this.queries.getSale(externalSaleStableId);
  }

  @Post('external-sales/reconstruction/preview')
  previewExternalSaleReconstruction(
    @Body() body: AccountingExternalSaleReconstructionPreviewInputV1,
  ) {
    return this.reconstruction.preview(body);
  }

  @Post('external-sales/reconstruction/execute')
  executeExternalSaleReconstruction(
    @Body() body: AccountingExternalSaleReconstructionExecuteInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.reconstruction.execute(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('external-sales')
  createExternalSale(
    @Body() body: CreateAccountingExternalSaleInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.externalSales.createSale(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('external-sales/:externalSaleStableId/reverse')
  reverseExternalSale(
    @Param('externalSaleStableId') externalSaleStableId: string,
    @Body() body: ReverseAccountingExternalSaleInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.reversals.reverseSale(
      externalSaleStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('external-sales/settlements')
  createExternalSaleSettlement(
    @Body() body: CreateAccountingExternalSaleSettlementInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.settlements.createSettlement(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('external-sales/settlements/:settlementStableId/reverse')
  reverseExternalSaleSettlement(
    @Param('settlementStableId') settlementStableId: string,
    @Body() body: ReverseAccountingExternalSaleInputV1,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.reversals.reverseSettlement(
      settlementStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }
}
