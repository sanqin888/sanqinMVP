import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { UberEatsExceptionFilter } from './ubereats-exception.filter';
import type { Request, Response } from 'express';
import { SESSION_COOKIE_NAME } from '../../../auth/session-auth.guard';
import { ResourceIdPipe } from './pipes/resource-id.pipe';
import {
  UberAdminWrite,
  UberMfaAdminWrite,
  UberReadOnlyAdmin,
} from './ubereats-access.decorator';
import {
  MerchantQuery,
  OAuthCallbackQuery,
  ProvisionUberStoreDto,
  SelectUberStoreDto,
  StoreIntegrationQuery,
  UpdatePosExternalStoreIdDto,
  UpdateUberStoreIntegrationDto,
} from '../contracts/requests/oauth.requests';
import {
  CompleteUberOAuthUseCase,
  StartUberOAuthUseCase,
} from '../application/merchant/uber-merchant-oauth.service';
import {
  DiscoverUberStoresUseCase,
  MapUberStoreUseCase,
} from '../application/merchant/uber-merchant-store-mapping.service';
import {
  DeprovisionUberStoreUseCase,
  ProvisionUberStoreUseCase,
  RetrieveUberStoreIntegrationConfigUseCase,
  SyncUberStoreStatusUseCase,
  UpdateUberStoreIntegrationConfigUseCase,
} from '../application/merchant/uber-merchant-provisioning.service';
import { presentOAuthCallback, presentOAuthStart } from './oauth.presenter';
import { AppLogger } from '../../../common/app-logger';
import {
  presentMerchantConnection,
  presentMerchantMutation,
  presentMerchantStores,
  presentOAuthConnect,
  presentStoreIntegrationConfig,
} from './merchant.presenter';

type OAuthRequestContext = {
  session?: { sessionId?: string };
  user?: { userStableId?: string };
  signedCookies?: Record<string, string | undefined>;
};
@Controller('integrations/ubereats')
@UseFilters(UberEatsExceptionFilter)
export class UberEatsOAuthController {
  private readonly logger = new AppLogger(UberEatsOAuthController.name);
  constructor(
    private readonly oauthStart: StartUberOAuthUseCase,
    private readonly oauthComplete: CompleteUberOAuthUseCase,
    private readonly storeDiscovery: DiscoverUberStoresUseCase,
    private readonly storeMapping: MapUberStoreUseCase,
    private readonly storeProvisioning: ProvisionUberStoreUseCase,
    private readonly storeIntegrationConfig: RetrieveUberStoreIntegrationConfigUseCase,
    private readonly storeIntegrationUpdate: UpdateUberStoreIntegrationConfigUseCase,
    private readonly storeDeprovisioning: DeprovisionUberStoreUseCase,
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
      {
        code: query.code,
        state: query.state,
        error: query.error,
      },
      callbackSessionId,
    );
    if (result.ok) {
      try {
        const discovery = await this.storeDiscovery.getMerchantStores(
          result.value.connectionId,
        );
        this.logger.log(
          `[merchant.store-discovery] connectionId=${result.value.connectionId} count=${discovery.count}`,
        );
      } catch (error) {
        this.logger.warn(
          `[merchant.store-discovery] connectionId=${result.value.connectionId} outcome=failed error=${error instanceof Error ? error.name : 'unknown'}`,
        );
      }
    }
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
      await this.storeDiscovery.getMerchantStores(query.connectionId),
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

  @Post('oauth/stores/select')
  @UberAdminWrite()
  async selectStore(@Body() dto: SelectUberStoreDto) {
    await this.storeMapping.selectStore(dto);
    return presentMerchantMutation();
  }

  @Get('oauth/connection')
  @UberReadOnlyAdmin()
  async oauthConnection(@Query() query: MerchantQuery) {
    return presentMerchantConnection(
      await this.oauthComplete.getMerchantConnectionStatus(query.connectionId),
    );
  }

  @Post('oauth/provision')
  @UberMfaAdminWrite()
  async oauthProvision(@Body() dto: ProvisionUberStoreDto) {
    await this.storeProvisioning.provisionStore(
      dto.storeId,
      dto.payload,
      dto.connectionId,
    );
    return presentMerchantMutation();
  }

  @Get('oauth/stores/:storeId/integration-config')
  @UberReadOnlyAdmin()
  async retrieveIntegrationConfig(
    @Param('storeId', ResourceIdPipe) storeId: string,
    @Query() query: StoreIntegrationQuery,
  ) {
    return presentStoreIntegrationConfig(
      await this.storeIntegrationConfig.retrieve(storeId, query.connectionId),
    );
  }

  @Patch('oauth/stores/:storeId/integration-config')
  @UberMfaAdminWrite()
  async updateIntegrationConfig(
    @Param('storeId', ResourceIdPipe) storeId: string,
    @Body() dto: UpdateUberStoreIntegrationDto,
  ) {
    await this.storeIntegrationUpdate.update(
      storeId,
      dto.payload,
      dto.connectionId,
    );
    return presentMerchantMutation();
  }

  @Delete('oauth/stores/:storeId/integration-config')
  @UberMfaAdminWrite()
  async removeIntegrationConfig(
    @Param('storeId', ResourceIdPipe) storeId: string,
    @Query() query: StoreIntegrationQuery,
  ) {
    await this.storeDeprovisioning.revokeOrDeprovisionStore(
      storeId,
      query.connectionId,
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
