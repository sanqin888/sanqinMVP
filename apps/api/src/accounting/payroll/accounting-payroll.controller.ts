import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles, RolesGuard, SessionAuthGuard } from '../../auth/public-api';
import {
  type AuthedAccountingRequest,
  requireAccountingOperatorUserId,
} from '../accounting-controller-support';
import { AccountingPayrollConfigService } from './accounting-payroll-config.service';
import { AccountingPayrollEmployeeService } from './accounting-payroll-employee.service';
import { AccountingPayrollOpeningService } from './accounting-payroll-opening.service';
import { AccountingPayrollRunService } from './accounting-payroll-run.service';
import { AccountingPayrollFinalizationService } from './accounting-payroll-finalization.service';
import { AccountingPayrollYtdService } from './accounting-payroll-ytd.service';
import { AccountingPayrollPayStatementService } from './accounting-payroll-pay-statement.service';
import { AccountingPayrollPostingService } from './accounting-payroll-posting.service';
import { AccountingPayrollEmployeePaymentService } from './accounting-payroll-employee-payment.service';
import type {
  CreatePayrollEmployeeConfigInput,
  CreatePayrollEmployeeInput,
  CreatePayrollEmployeePaymentInput,
  CreatePayrollEmployerConfigInput,
  CreatePayrollEmployerInput,
  CreatePayrollRunInput,
  UpdatePayrollEmployeeInput,
  UpdatePayrollEmployerInput,
  UpdatePayrollRunInput,
  UpsertPayrollYearOpeningInput,
} from './payroll-lifecycle.contracts';

@Controller('accounting')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN', 'ACCOUNTANT')
export class AccountingPayrollController {
  constructor(
    private readonly config: AccountingPayrollConfigService,
    private readonly employees: AccountingPayrollEmployeeService,
    private readonly openings: AccountingPayrollOpeningService,
    private readonly runs: AccountingPayrollRunService,
    private readonly finalization: AccountingPayrollFinalizationService,
    private readonly ytd: AccountingPayrollYtdService,
    private readonly payStatements: AccountingPayrollPayStatementService,
    private readonly posting: AccountingPayrollPostingService,
    private readonly employeePayments: AccountingPayrollEmployeePaymentService,
  ) {}

  @Get('payroll/employers')
  listEmployers(@Query('includeInactive') includeInactive?: string) {
    return this.config.listEmployers(includeInactive === 'true');
  }

  @Post('payroll/employers')
  createEmployer(
    @Body() body: CreatePayrollEmployerInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.config.createEmployer(
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Put('payroll/employers/:employerStableId')
  updateEmployer(
    @Param('employerStableId') employerStableId: string,
    @Body() body: UpdatePayrollEmployerInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.config.updateEmployer(
      employerStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/employers/:employerStableId/configs')
  listEmployerConfigs(@Param('employerStableId') employerStableId: string) {
    return this.config.listEmployerConfigs(employerStableId);
  }

  @Post('payroll/employers/:employerStableId/configs')
  createEmployerConfig(
    @Param('employerStableId') employerStableId: string,
    @Body() body: CreatePayrollEmployerConfigInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.config.createEmployerConfig(
      employerStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/employers/:employerStableId/employees')
  listEmployees(
    @Param('employerStableId') employerStableId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.employees.listEmployees(
      employerStableId,
      includeInactive === 'true',
    );
  }

  @Post('payroll/employers/:employerStableId/employees')
  createEmployee(
    @Param('employerStableId') employerStableId: string,
    @Body() body: CreatePayrollEmployeeInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.employees.createEmployee(
      employerStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Put('payroll/employees/:employeeStableId')
  updateEmployee(
    @Param('employeeStableId') employeeStableId: string,
    @Body() body: UpdatePayrollEmployeeInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.employees.updateEmployee(
      employeeStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/employees/:employeeStableId/configs')
  listEmployeeConfigs(@Param('employeeStableId') employeeStableId: string) {
    return this.employees.listEmployeeConfigs(employeeStableId);
  }

  @Post('payroll/employees/:employeeStableId/configs')
  createEmployeeConfig(
    @Param('employeeStableId') employeeStableId: string,
    @Body() body: CreatePayrollEmployeeConfigInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.employees.createEmployeeConfig(
      employeeStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/employees/:employeeStableId/openings/:taxYear')
  getYearOpening(
    @Param('employeeStableId') employeeStableId: string,
    @Param('taxYear') taxYearRaw: string,
  ) {
    return this.openings.getYearOpening(employeeStableId, Number(taxYearRaw));
  }

  @Put('payroll/employees/:employeeStableId/openings/:taxYear')
  upsertYearOpening(
    @Param('employeeStableId') employeeStableId: string,
    @Param('taxYear') taxYearRaw: string,
    @Body() body: UpsertPayrollYearOpeningInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.openings.upsertYearOpening(
      employeeStableId,
      Number(taxYearRaw),
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/employees/:employeeStableId/ytd/:taxYear')
  getEmployeeYtd(
    @Param('employeeStableId') employeeStableId: string,
    @Param('taxYear') taxYearRaw: string,
  ) {
    return this.ytd.getEmployeeYtd(employeeStableId, Number(taxYearRaw));
  }

  @Get('payroll/runs')
  listRuns(@Query('employeeStableId') employeeStableId?: string) {
    return this.runs.listRuns(employeeStableId);
  }

  @Post('payroll/runs')
  createRun(
    @Body() body: CreatePayrollRunInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.runs.createDraft(body, requireAccountingOperatorUserId(req));
  }

  @Get('payroll/runs/:runStableId')
  getRun(@Param('runStableId') runStableId: string) {
    return this.runs.getRun(runStableId);
  }

  @Put('payroll/runs/:runStableId')
  updateRun(
    @Param('runStableId') runStableId: string,
    @Body() body: UpdatePayrollRunInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.runs.updateDraft(
      runStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('payroll/runs/:runStableId/calculate')
  calculateRun(
    @Param('runStableId') runStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.finalization.calculateRun(
      runStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('payroll/runs/:runStableId/approve')
  approveRun(
    @Param('runStableId') runStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.finalization.approveRun(
      runStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Post('payroll/runs/:runStableId/post')
  postRun(
    @Param('runStableId') runStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.posting.postRunAccrual(
      runStableId,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/runs/:runStableId/employee-payment')
  getEmployeePayment(@Param('runStableId') runStableId: string) {
    return this.employeePayments.getForRun(runStableId);
  }

  @Post('payroll/runs/:runStableId/employee-payment')
  settleEmployeePayment(
    @Param('runStableId') runStableId: string,
    @Body() body: CreatePayrollEmployeePaymentInput,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.employeePayments.settleRun(
      runStableId,
      body,
      requireAccountingOperatorUserId(req),
    );
  }

  @Get('payroll/runs/:runStableId/pay-statement.pdf')
  async payStatementPdf(
    @Param('runStableId') runStableId: string,
    @Req() req: AuthedAccountingRequest,
    @Res() res: Response,
  ) {
    const statement = await this.payStatements.render(
      runStableId,
      requireAccountingOperatorUserId(req),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + statement.filename + '"',
    );
    return res.send(statement.buffer);
  }

  @Post('payroll/runs/:runStableId/void')
  voidRun(
    @Param('runStableId') runStableId: string,
    @Req() req: AuthedAccountingRequest,
  ) {
    return this.finalization.voidRun(
      runStableId,
      requireAccountingOperatorUserId(req),
    );
  }
}
