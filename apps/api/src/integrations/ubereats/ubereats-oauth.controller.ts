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
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../common/app-logger';
import { SESSION_COOKIE_NAME } from '../../auth/session-auth.guard';
import { ResourceIdPipe } from './contracts/requests/resource-id.pipe';
import {
  UberAdminWrite,
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import {
  CreateUberOpsTicketDto,
  GenerateUberReconciliationReportDto,
  MerchantQuery,
  OAuthCallbackQuery,
  OpsTicketListQuery,
  ProvisionUberStoreDto,
  PublishUberMenuDto,
  ReportListQuery,
  ResourceIdParam,
  StoreIdQuery,
  SyncUberMenuItemAvailabilityDto,
  SyncUberOptionItemAvailabilityDto,
  UpdatePosExternalStoreIdDto,
  UpdateUberDraftGroupDto,
  UpdateUberDraftItemDto,
  UpdateUberDraftOptionChildGroupDto,
  UpdateUberDraftOptionDto,
  UpsertUberOptionItemConfigDto,
  UpsertUberPriceBookItemDto,
} from './contracts/requests/ubereats.requests';
import { UberMerchantService } from './uber-merchant.service';

type OAuthRequestContext = {
  session?: { sessionId?: string };
  user?: { userStableId?: string };
  signedCookies?: Record<string, string | undefined>;
};
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[
        character
      ] ?? character,
  );
}

@Controller('integrations/ubereats')
export class UberEatsOAuthController {
  private readonly logger = new AppLogger(UberEatsOAuthController.name);
  constructor(private readonly merchant: UberMerchantService) {}
  @Get('oauth/connect-url')
  @UberReadOnlyAdmin()
  async oauthConnectUrl(@Req() req: Request & OAuthRequestContext) {
    return this.merchant.buildMerchantAuthorizeUrl(
      this.requireAdminSession(req),
      req.user?.userStableId,
    );
  }

  @Get('oauth/start')
  @UberReadOnlyAdmin()
  async oauthStart(
    @Req() req: Request & OAuthRequestContext,
    @Res() res: Response,
  ) {
    const result = await this.merchant.startMerchantOAuth(
      this.requireAdminSession(req),
      req.user?.userStableId,
    );
    return res.redirect(result.authorizeUrl);
  }

  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async oauthCallback(
    @Req() req: Request & OAuthRequestContext,
    @Query() query: OAuthCallbackQuery,
  ) {
    const correlationId = randomUUID();
    this.logger.log(
      `[ubereats oauth callback] correlationId=${correlationId} hasCode=${Boolean(query.code)} hasState=${Boolean(query.state)}`,
    );

    if (!query.code) {
      return 'Uber 授权失败：缺少 code。';
    }

    try {
      const callbackSessionId =
        typeof req.signedCookies?.[SESSION_COOKIE_NAME] === 'string'
          ? req.signedCookies[SESSION_COOKIE_NAME]
          : undefined;
      const result = await this.merchant.exchangeAuthorizationCode(
        query.code,
        query.state,
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
  @UberReadOnlyAdmin()
  async oauthStores(@Query() query: MerchantQuery) {
    return await this.merchant.getMerchantStores(query.merchantUberUserId!);
  }

  @Patch('oauth/stores/:storeId/pos-external-store-id')
  @UberAdminWrite()
  async updatePosExternalStoreId(
    @Param('storeId', ResourceIdPipe) storeId: string,
    @Body() dto: UpdatePosExternalStoreIdDto,
  ) {
    return await this.merchant.updatePosExternalStoreId(
      storeId,
      dto.posExternalStoreId,
    );
  }

  @Get('oauth/connection')
  @UberReadOnlyAdmin()
  async oauthConnection(@Query() query: MerchantQuery) {
    return await this.merchant.getMerchantConnectionStatus(
      query.merchantUberUserId,
    );
  }

  @Post('oauth/provision')
  @UberMfaAdminWrite()
  async oauthProvision(@Body() dto: ProvisionUberStoreDto) {
    return await this.merchant.provisionStore(
      dto.storeId,
      dto.payload ?? {},
      dto.merchantUberUserId,
    );
  }

  @Post('store/status/sync')
  @UberMfaAdminWrite()
  async syncStoreStatus() {
    return await this.merchant.syncStoreStatusToUber();
  }
}
