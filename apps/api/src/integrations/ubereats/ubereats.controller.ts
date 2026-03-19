//apps/api/src/integrations/ubereats/ubereats.controller.ts
import {
  Body,
  Controller,
  Get,
  Head,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  OrderStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AppLogger } from '../../common/app-logger';
import { UberEatsService } from './ubereats.service';

class UpsertUberPriceBookItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  priceCents!: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

class PublishUberMenuDto {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

class SyncUberMenuItemAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsString()
  storeId?: string;
}

class GenerateUberReconciliationReportDto {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsString()
  rangeStart?: string;

  @IsOptional()
  @IsString()
  rangeEnd?: string;
}

class CreateUberOpsTicketDto {
  @IsEnum(UberOpsTicketType)
  type!: UberOpsTicketType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(UberOpsTicketPriority)
  priority?: UberOpsTicketPriority;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsString()
  externalOrderId?: string;

  @IsOptional()
  @IsString()
  menuItemStableId?: string;
}

@Controller('integrations/ubereats')
export class UberEatsController {
  private readonly logger = new AppLogger(UberEatsController.name);

  constructor(private readonly uberEatsService: UberEatsService) {}

  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  oauthCallback(@Query('code') code?: string, @Req() req?: Request) {
    this.logger.log(
      `[ubereats oauth callback] code=${code ?? 'missing'} query=${JSON.stringify(req?.query ?? {})}`,
    );

    return 'Authorized. You can close this window. (ok)';
  }

  @Get('webhook')
  health(@Res() res: Response) {
    return res.status(200).json({ ok: true });
  }

  @Head('webhook')
  head(@Res() res: Response) {
    return res.sendStatus(200);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    this.logger.log(
      `[ubereats webhook headers] ${JSON.stringify(req.headers)}`,
    );
    const rawBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(
          typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body ?? {}),
          'utf8',
        );

    const rawBody = rawBuffer.toString('utf8');

    this.logger.log(
      `[ubereats webhook controller] rawBodyBytes=${rawBuffer.length}`,
    );

    let parsedBody: unknown = null;
    let bodyParseFailed = false;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = null;
      bodyParseFailed = Boolean(rawBody);
    }

    await this.uberEatsService.handleWebhook({
      headers: req.headers as Record<string, unknown>,
      body: parsedBody,
      rawBody,
      bodyParseFailed,
    });

    return { ok: true };
  }
  @Post('orders/:externalOrderId/status')
  async syncOrderStatus(
    @Param('externalOrderId') externalOrderId: string,
    @Body('status', new ParseEnumPipe(OrderStatus)) status: OrderStatus,
  ) {
    return this.uberEatsService.syncOrderStatusToUber(externalOrderId, status);
  }

  @Get('orders/pending')
  async listPendingOrders() {
    return this.uberEatsService.listPendingUberOrders();
  }

  @Post('store/status/sync')
  async syncStoreStatus() {
    return this.uberEatsService.syncStoreStatusToUber();
  }

  @Get('price-book')
  async getPriceBook(@Query('storeId') storeId?: string) {
    return this.uberEatsService.listUberPriceBook(storeId);
  }

  @Post('price-book/items/:menuItemStableId')
  async upsertPriceBookItem(
    @Param('menuItemStableId') menuItemStableId: string,
    @Body() dto: UpsertUberPriceBookItemDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.uberEatsService.upsertUberPriceBookItem({
      storeId,
      menuItemStableId,
      priceCents: dto.priceCents,
      isAvailable: dto.isAvailable,
    });
  }

  @Post('menu/publish')
  async publishMenu(@Body() dto: PublishUberMenuDto) {
    return this.uberEatsService.publishUberMenu({
      storeId: dto.storeId,
      dryRun: dto.dryRun,
    });
  }

  @Post('menu/items/:menuItemStableId/availability')
  async syncMenuItemAvailability(
    @Param('menuItemStableId') menuItemStableId: string,
    @Body() dto: SyncUberMenuItemAvailabilityDto,
  ) {
    return this.uberEatsService.syncMenuItemAvailability({
      menuItemStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
  }

  @Post('reports/reconciliation/generate')
  async generateReconciliationReport(
    @Body() dto: GenerateUberReconciliationReportDto,
  ) {
    return this.uberEatsService.generateReconciliationReport({
      storeId: dto.storeId,
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
    });
  }

  @Get('reports/reconciliation')
  async listReconciliationReports(
    @Query('storeId') storeId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.uberEatsService.listReconciliationReports(
      storeId,
      Number(limit || 20),
    );
  }

  @Post('ops/tickets')
  async createOpsTicket(@Body() dto: CreateUberOpsTicketDto): Promise<unknown> {
    return this.uberEatsService.createOpsTicket({
      type: dto.type,
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      storeId: dto.storeId,
      externalOrderId: dto.externalOrderId,
      menuItemStableId: dto.menuItemStableId,
    });
  }

  @Get('ops/tickets')
  async listOpsTickets(
    @Query('storeId') storeId?: string,
    @Query('status') status?: UberOpsTicketStatus,
  ): Promise<unknown> {
    return this.uberEatsService.listOpsTickets(storeId, status);
  }

  @Post('ops/tickets/:ticketStableId/retry')
  async retryOpsTicket(
    @Param('ticketStableId') ticketStableId: string,
  ): Promise<unknown> {
    return this.uberEatsService.retryOpsTicket(ticketStableId);
  }
}
