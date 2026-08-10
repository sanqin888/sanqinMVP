import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SESSION_COOKIE_NAME } from '../../../auth/session-auth.guard';
import { ResourceIdPipe } from '../contracts/requests/resource-id.pipe';
import {
  UberAdminWrite,
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import {
  MerchantQuery,
  OAuthCallbackQuery,
  ProvisionUberStoreDto,
  UpdatePosExternalStoreIdDto,
} from '../contracts/requests/ubereats.requests';
import { UberMerchantService } from '../application/merchant/uber-merchant.service';
import { presentOAuthCallback, presentOAuthStart } from './oauth.presenter';

type OAuthRequestContext = {
  session?: { sessionId?: string };
  user?: { userStableId?: string };
  signedCookies?: Record<string, string | undefined>;
};
@Controller('integrations/ubereats')
export class UberEatsOAuthController {
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
    return presentOAuthStart(result, res);
  }

  @Get('oauth/callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async oauthCallback(
    @Req() req: Request & OAuthRequestContext,
    @Query() query: OAuthCallbackQuery,
  ) {
    const callbackSessionId =
      typeof req.signedCookies?.[SESSION_COOKIE_NAME] === 'string'
        ? req.signedCookies[SESSION_COOKIE_NAME]
        : undefined;
    const result = await this.merchant.exchangeAuthorizationCode(
      query.code,
      query.state,
      callbackSessionId,
    );
    return presentOAuthCallback(result);
  }

  private requireAdminSession(req: Request & OAuthRequestContext): string {
    const sessionId = req.session?.sessionId?.trim();
    if (!sessionId) throw new UnauthorizedException('缺少管理员会话');
    return sessionId;
  }

  @Get('oauth/stores')
  @UberReadOnlyAdmin()
  async oauthStores(@Query() query: MerchantQuery) {
    return await this.merchant.getMerchantStores(query.merchantUberUserId);
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
      dto.payload,
      dto.merchantUberUserId,
    );
  }

  @Post('store/status/sync')
  @UberMfaAdminWrite()
  async syncStoreStatus() {
    return await this.merchant.syncStoreStatusToUber();
  }
}
