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
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from '../application/merchant/uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from '../application/merchant/uber-merchant-store-mapping.service';
import {
  ProvisionUberStoreUseCase,
  SyncUberStoreStatusUseCase,
} from '../application/merchant/uber-merchant-provisioning.service';
import { presentOAuthCallback, presentOAuthStart } from './oauth.presenter';
import {
  presentMerchantConnection,
  presentMerchantMutation,
  presentMerchantStores,
  presentOAuthConnect,
} from './merchant.presenter';

type OAuthRequestContext = {
  session?: { sessionId?: string };
  user?: { userStableId?: string };
  signedCookies?: Record<string, string | undefined>;
};
@Controller('integrations/ubereats')
export class UberEatsOAuthController {
  constructor(
    private readonly oauthStart: StartUberOAuthUseCase,
    private readonly oauthComplete: CompleteUberOAuthUseCase,
    private readonly storeDiscovery: DiscoverUberStoresUseCase,
    private readonly storeMapping: MapUberStoreUseCase,
    private readonly storeProvisioning: ProvisionUberStoreUseCase,
    private readonly storeStatusSync: SyncUberStoreStatusUseCase,
  ) {}
  @Get('oauth/connect-url')
  @UberReadOnlyAdmin()
  async oauthConnectUrl(@Req() req: Request & OAuthRequestContext) {
    return presentOAuthConnect(
      await this.oauthStart.buildMerchantAuthorizeUrl(
        this.requireAdminSession(req),
        req.user?.userStableId,
      ),
    );
  }

  @Get('oauth/start')
  @UberReadOnlyAdmin()
  async startOAuth(
    @Req() req: Request & OAuthRequestContext,
    @Res() res: Response,
  ) {
    const result = await this.oauthStart.startMerchantOAuth(
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
    const result = await this.oauthComplete.exchangeAuthorizationCode(
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
    return presentMerchantStores(
      await this.storeDiscovery.getMerchantStores(query.merchantUberUserId),
    );
  }

  @Patch('oauth/stores/:storeId/pos-external-store-id')
  @UberAdminWrite()
  async updatePosExternalStoreId(
    @Param('storeId', ResourceIdPipe) storeId: string,
    @Body() dto: UpdatePosExternalStoreIdDto,
  ) {
    await this.storeMapping.updatePosExternalStoreId(
      storeId,
      dto.posExternalStoreId,
    );
    return presentMerchantMutation();
  }

  @Get('oauth/connection')
  @UberReadOnlyAdmin()
  async oauthConnection(@Query() query: MerchantQuery) {
    return presentMerchantConnection(
      await this.oauthComplete.getMerchantConnectionStatus(
        query.merchantUberUserId,
      ),
    );
  }

  @Post('oauth/provision')
  @UberMfaAdminWrite()
  async oauthProvision(@Body() dto: ProvisionUberStoreDto) {
    await this.storeProvisioning.provisionStore(
      dto.storeId,
      dto.payload,
      dto.merchantUberUserId,
    );
    return presentMerchantMutation();
  }

  @Post('store/status/sync')
  @UberMfaAdminWrite()
  async syncStoreStatus() {
    await this.storeStatusSync.syncStoreStatusToUber();
    return presentMerchantMutation();
  }
}
