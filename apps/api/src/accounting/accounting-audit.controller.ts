import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionAuthGuard } from '../auth/public-api';
import { AccountingService } from './accounting.service';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingAuditController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('audit-logs')
  async listAuditLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('operatorActorRef') operatorActorRef?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.listAuditLogs({
      entityType,
      entityId,
      operatorActorRef,
      from,
      to,
    });
  }
}
