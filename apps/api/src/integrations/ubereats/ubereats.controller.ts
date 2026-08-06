//apps/api/src/integrations/ubereats/ubereats.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Header,
  HttpCode,
  Patch,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  OrderStatus,
  UberOpsTicketPriority,
  UberOpsTicketStatus,
  UberOpsTicketType,
} from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { Roles } from '../../auth/roles.decorator';
import { AdminMfaGuard } from '../../auth/admin-mfa.guard';
import { RolesGuard } from '../../auth/roles.guard';
import {
  SESSION_COOKIE_NAME,
  SessionAuthGuard,
} from '../../auth/session-auth.guard';
import { UberEatsService } from './ubereats.service';

type OAuthRequestContext = {
  session?: { sessionId?: string };
  user?: { userStableId?: string };
  signedCookies?: Record<string, string | undefined>;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character,
  );
}

class UpsertUberPriceBookItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  priceCents!: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  displayDescription?: string;
}

class UpsertUberOptionItemConfigDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priceDeltaCents?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  displayDescription?: string;
}

class UpdateUberDraftItemDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  displayDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  priceCents?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  storeId?: string;
}

class UpdateUberDraftGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxSelect?: number;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  storeId?: string;
}

class UpdateUberDraftOptionDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priceDeltaCents?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  storeId?: string;
}

class UpdateUberDraftOptionChildGroupDto {
  @IsString()
  groupId!: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}

class PublishUberMenuDto {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  timezoneConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  taxRateConfirmed?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedGroupIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedMenuItemStableIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedOptionChoiceStableIds?: string[];
}

class SyncUberMenuItemAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;

  @IsOptional()
  @IsString()
  storeId?: string;
}

class SyncUberOptionItemAvailabilityDto {
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

class ProvisionUberStoreDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  merchantUberUserId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  payload?: Record<string, unknown>;
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

  @Get('oauth/connect-url')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  oauthConnectUrl(@Req() req: Request & OAuthRequestContext) {
    return this.uberEatsService.buildMerchantAuthorizeUrl(
      this.requireAdminSession(req),
      req.user?.userStableId,
    );
  }

  @Get('oauth/start')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  oauthStart(@Req() req: Request & OAuthRequestContext, @Res() res: Response) {
    const result = this.uberEatsService.startMerchantOAuth(
      this.requireAdminSession(req),
      req.user?.userStableId,
    );
    return res.redirect(result.authorizeUrl);
  }

  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async oauthCallback(
    @Req() req: Request & OAuthRequestContext,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ) {
    const correlationId = randomUUID();
    this.logger.log(
      `[ubereats oauth callback] correlationId=${correlationId} hasCode=${Boolean(code)} hasState=${Boolean(state)}`,
    );

    if (!code) {
      return 'Uber 授权失败：缺少 code。';
    }

    try {
      const callbackSessionId =
        typeof req.signedCookies?.[SESSION_COOKIE_NAME] === 'string'
          ? req.signedCookies[SESSION_COOKIE_NAME]
          : undefined;
      const result = await this.uberEatsService.exchangeAuthorizationCode(
        code,
        state,
        callbackSessionId,
      );

      return `
<!doctype html>
<html lang="zh-CN">
  <body>
    <h2>Uber 授权成功</h2>
    <p>merchantUberUserId: ${escapeHtml(result.merchantUberUserId)}</p>
    <p>scope: ${escapeHtml(result.scope ?? '')}</p>
    <p>expiresAt: ${result.expiresAt ? new Date(result.expiresAt).toISOString() : 'unknown'}</p>
    <p>你现在可以关闭此页面，并继续调用 /integrations/ubereats/oauth/stores 或 /integrations/ubereats/oauth/provision。</p>
  </body>
</html>
`;
    } catch (error) {
      const internalMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const displayMessage =
        process.env.NODE_ENV === 'production'
          ? '授权处理失败，请重试或联系管理员。'
          : internalMessage;

      this.logger.error(
        `[ubereats oauth callback] correlationId=${correlationId} failed=true errorType=${error instanceof Error ? error.name : 'UnknownError'}`,
      );

      return `
<!doctype html>
<html lang="zh-CN">
  <body>
    <h2>Uber 授权失败</h2>
    <p>${escapeHtml(displayMessage)}</p>
  </body>
</html>
`;
    }
  }

  private readRequestHeader(req: Request, name: string): string | null {
    const value = req.headers[name.toLowerCase()];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find((item) => item.trim());
      return first?.trim() || null;
    }
    return null;
  }

  private requireAdminSession(req: Request & OAuthRequestContext): string {
    const sessionId = req.session?.sessionId?.trim();
    if (!sessionId) throw new Error('缺少管理员会话');
    return sessionId;
  }

  @Get('oauth/stores')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async oauthStores(
    @Query('accessToken') accessToken?: string,
    @Query('merchantUberUserId') merchantUberUserId?: string,
  ) {
    return await this.uberEatsService.getMerchantStores(
      accessToken,
      merchantUberUserId,
    );
  }

  @Get('oauth/connection')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async oauthConnection(
    @Query('merchantUberUserId') merchantUberUserId?: string,
  ) {
    return await this.uberEatsService.getMerchantConnectionStatus(
      merchantUberUserId,
    );
  }

  @Post('oauth/provision')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async oauthProvision(@Body() dto: ProvisionUberStoreDto) {
    return await this.uberEatsService.provisionStore(
      dto.accessToken,
      dto.storeId,
      dto.payload ?? {},
      dto.merchantUberUserId,
    );
  }

  @Get('webhook')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  health(@Res() res: Response) {
    return res.status(200).json({ ok: true });
  }

  @Head('webhook')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  head(@Res() res: Response) {
    return res.sendStatus(200);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    if (!Buffer.isBuffer(req.body)) {
      throw new BadRequestException('Uber webhook raw body 不可用');
    }
    const rawBuffer = req.body;

    const rawBody = rawBuffer.toString('utf8');

    let parsedBody: unknown = null;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsedBody = null;
    }

    const body =
      parsedBody && typeof parsedBody === 'object'
        ? (parsedBody as Record<string, unknown>)
        : null;
    const requestId = this.readRequestHeader(req, 'x-request-id') ?? 'unknown';
    const eventType =
      typeof body?.event_type === 'string' ? body.event_type : 'unknown';
    const contentType =
      this.readRequestHeader(req, 'content-type') ?? 'unknown';
    this.logger.log(
      `[ubereats webhook] requestId=${requestId} eventType=${eventType} contentType=${contentType} bodyBytes=${rawBuffer.length}`,
    );

    await this.uberEatsService.handleWebhook({
      headers: req.headers as Record<string, unknown>,
      rawBody: rawBuffer,
    });

    return { ok: true };
  }
  @Post('orders/:externalOrderId/status')
  @UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
  @Roles('ADMIN')
  async syncOrderStatus(
    @Param('externalOrderId') externalOrderId: string,
    @Body('status', new ParseEnumPipe(OrderStatus)) status: OrderStatus,
  ) {
    return await this.uberEatsService.syncOrderStatusToUber(
      externalOrderId,
      status,
    );
  }

  @Get('orders/pending')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listPendingOrders() {
    return await this.uberEatsService.listPendingUberOrders();
  }

  @Post('store/status/sync')
  @UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
  @Roles('ADMIN')
  async syncStoreStatus() {
    return await this.uberEatsService.syncStoreStatusToUber();
  }

  @Get('menu/channel/items')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listItemChannelConfigs(@Query('storeId') storeId?: string) {
    return await this.uberEatsService.listUberItemChannelConfigs(storeId);
  }

  @Get('menu/published/items')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listPublishedMenuItems(@Query('storeId') storeId?: string) {
    return await this.uberEatsService.listUberPublishedMenuItems(storeId);
  }

  @Post('menu/channel/items/:menuItemStableId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async upsertItemChannelConfig(
    @Param('menuItemStableId') menuItemStableId: string,
    @Body() dto: UpsertUberPriceBookItemDto,
    @Query('storeId') storeId?: string,
  ) {
    return await this.uberEatsService.upsertUberItemChannelConfig({
      storeId,
      menuItemStableId,
      priceCents: dto.priceCents,
      isAvailable: dto.isAvailable,
      displayName: dto.displayName,
      displayDescription: dto.displayDescription,
    });
  }

  @Get('menu/channel/options')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listOptionChannelConfigs(@Query('storeId') storeId?: string) {
    return await this.uberEatsService.listUberOptionItemConfigs(storeId);
  }

  @Post('menu/channel/options/:optionChoiceStableId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async upsertOptionChannelConfig(
    @Param('optionChoiceStableId') optionChoiceStableId: string,
    @Body() dto: UpsertUberOptionItemConfigDto,
    @Query('storeId') storeId?: string,
  ) {
    return await this.uberEatsService.upsertUberOptionItemConfig({
      storeId,
      optionChoiceStableId,
      priceDeltaCents: dto.priceDeltaCents,
      isAvailable: dto.isAvailable,
      displayName: dto.displayName,
      displayDescription: dto.displayDescription,
    });
  }

  @Get('menu/draft')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getMenuDraft(@Query('storeId') storeId?: string) {
    return await this.uberEatsService.getUberMenuDraft(storeId);
  }

  @Patch('menu/draft/items/:itemId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async patchDraftItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateUberDraftItemDto,
  ) {
    return await this.uberEatsService.updateUberDraftItem(itemId, dto);
  }

  @Patch('menu/draft/groups/:groupId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async patchDraftGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateUberDraftGroupDto,
  ) {
    return await this.uberEatsService.updateUberDraftGroup(groupId, dto);
  }

  @Patch('menu/draft/options/:optionItemId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async patchDraftOption(
    @Param('optionItemId') optionItemId: string,
    @Body() dto: UpdateUberDraftOptionDto,
  ) {
    return await this.uberEatsService.updateUberDraftOption(optionItemId, dto);
  }

  @Post('menu/draft/options/:optionItemId/child-groups')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async bindOptionChildGroup(
    @Param('optionItemId') optionItemId: string,
    @Body() dto: UpdateUberDraftOptionChildGroupDto,
  ) {
    return await this.uberEatsService.bindUberDraftOptionChildGroup(
      optionItemId,
      dto.groupId,
      dto.storeId,
    );
  }

  @Delete('menu/draft/options/:optionItemId/child-groups/:groupId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async unbindOptionChildGroup(
    @Param('optionItemId') optionItemId: string,
    @Param('groupId') groupId: string,
    @Query('storeId') storeId?: string,
  ) {
    return await this.uberEatsService.unbindUberDraftOptionChildGroup(
      optionItemId,
      groupId,
      storeId,
    );
  }

  @Get('menu/draft/diff')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getMenuDraftDiff(@Query('storeId') storeId?: string) {
    return await this.uberEatsService.getUberMenuDraftDiff(storeId);
  }

  @Post('menu/publish')
  @UseGuards(SessionAuthGuard, AdminMfaGuard, RolesGuard)
  @Roles('ADMIN')
  async publishMenu(@Body() dto: PublishUberMenuDto) {
    return await this.uberEatsService.publishUberMenu({
      storeId: dto.storeId,
      dryRun: dto.dryRun,
      timezoneConfirmed: dto.timezoneConfirmed,
      taxRateConfirmed: dto.taxRateConfirmed,
      excludedCategoryIds: dto.excludedCategoryIds,
      excludedGroupIds: dto.excludedGroupIds,
      excludedMenuItemStableIds: dto.excludedMenuItemStableIds,
      excludedOptionChoiceStableIds: dto.excludedOptionChoiceStableIds,
    });
  }

  @Post('menu/items/:menuItemStableId/availability')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async syncMenuItemAvailability(
    @Param('menuItemStableId') menuItemStableId: string,
    @Body() dto: SyncUberMenuItemAvailabilityDto,
  ) {
    return await this.uberEatsService.syncUberMenuItemAvailability({
      menuItemStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
  }

  @Post('menu/options/:optionChoiceStableId/availability')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async syncOptionItemAvailability(
    @Param('optionChoiceStableId') optionChoiceStableId: string,
    @Body() dto: SyncUberOptionItemAvailabilityDto,
  ) {
    return await this.uberEatsService.syncUberOptionItemAvailability({
      optionChoiceStableId,
      isAvailable: dto.isAvailable,
      storeId: dto.storeId,
    });
  }

  @Post('reports/reconciliation/generate')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async generateReconciliationReport(
    @Body() dto: GenerateUberReconciliationReportDto,
  ) {
    return await this.uberEatsService.generateReconciliationReport({
      storeId: dto.storeId,
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
    });
  }

  @Get('reports/reconciliation')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listReconciliationReports(
    @Query('storeId') storeId?: string,
    @Query('limit') limit?: string,
  ) {
    return await this.uberEatsService.listReconciliationReports(
      storeId,
      Number(limit || 20),
    );
  }

  @Post('ops/tickets')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async createOpsTicket(@Body() dto: CreateUberOpsTicketDto): Promise<unknown> {
    return await this.uberEatsService.createOpsTicket({
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
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async listOpsTickets(
    @Query('storeId') storeId?: string,
    @Query('status') status?: UberOpsTicketStatus,
  ): Promise<unknown> {
    return await this.uberEatsService.listOpsTickets(storeId, status);
  }

  @Post('ops/tickets/:ticketStableId/retry')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async retryOpsTicket(
    @Param('ticketStableId') ticketStableId: string,
  ): Promise<unknown> {
    return await this.uberEatsService.retryOpsTicket(ticketStableId);
  }
}
