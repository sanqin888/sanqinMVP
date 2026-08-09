import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberIntegrationRuntime } from './uber-integration.runtime';

/** Menu graph construction, validation, publication and availability. */
@Injectable()
export class UberMenuService {
  private readonly runtime: UberIntegrationRuntime;

  constructor(
    prisma: PrismaService,
    uberAuthService: UberAuthService,
    @Optional() orderEventsBus?: OrderEventsBus,
    @Optional() orderIngestionService?: OrderIngestionService,
    @Optional() httpClient?: UberHttpClient,
    @Optional() config?: UberConfigService,
  ) {
    this.runtime = new UberIntegrationRuntime(
      prisma,
      uberAuthService,
      orderEventsBus,
      orderIngestionService,
      httpClient,
      config,
    );
  }

  listUberItemChannelConfigs(
    ...args: Parameters<UberIntegrationRuntime['listUberItemChannelConfigs']>
  ): ReturnType<UberIntegrationRuntime['listUberItemChannelConfigs']> {
    return this.runtime.listUberItemChannelConfigs(...args);
  }

  listUberPublishedMenuItems(
    ...args: Parameters<UberIntegrationRuntime['listUberPublishedMenuItems']>
  ): ReturnType<UberIntegrationRuntime['listUberPublishedMenuItems']> {
    return this.runtime.listUberPublishedMenuItems(...args);
  }

  listUberOptionItemConfigs(
    ...args: Parameters<UberIntegrationRuntime['listUberOptionItemConfigs']>
  ): ReturnType<UberIntegrationRuntime['listUberOptionItemConfigs']> {
    return this.runtime.listUberOptionItemConfigs(...args);
  }

  upsertUberItemChannelConfig(
    ...args: Parameters<UberIntegrationRuntime['upsertUberItemChannelConfig']>
  ): ReturnType<UberIntegrationRuntime['upsertUberItemChannelConfig']> {
    return this.runtime.upsertUberItemChannelConfig(...args);
  }

  upsertUberOptionItemConfig(
    ...args: Parameters<UberIntegrationRuntime['upsertUberOptionItemConfig']>
  ): ReturnType<UberIntegrationRuntime['upsertUberOptionItemConfig']> {
    return this.runtime.upsertUberOptionItemConfig(...args);
  }

  getUberMenuDraft(
    ...args: Parameters<UberIntegrationRuntime['getUberMenuDraft']>
  ): ReturnType<UberIntegrationRuntime['getUberMenuDraft']> {
    return this.runtime.getUberMenuDraft(...args);
  }

  updateUberDraftItem(
    ...args: Parameters<UberIntegrationRuntime['updateUberDraftItem']>
  ): ReturnType<UberIntegrationRuntime['updateUberDraftItem']> {
    return this.runtime.updateUberDraftItem(...args);
  }

  updateUberDraftGroup(
    ...args: Parameters<UberIntegrationRuntime['updateUberDraftGroup']>
  ): ReturnType<UberIntegrationRuntime['updateUberDraftGroup']> {
    return this.runtime.updateUberDraftGroup(...args);
  }

  updateUberDraftOption(
    ...args: Parameters<UberIntegrationRuntime['updateUberDraftOption']>
  ): ReturnType<UberIntegrationRuntime['updateUberDraftOption']> {
    return this.runtime.updateUberDraftOption(...args);
  }

  bindUberDraftOptionChildGroup(
    ...args: Parameters<UberIntegrationRuntime['bindUberDraftOptionChildGroup']>
  ): ReturnType<UberIntegrationRuntime['bindUberDraftOptionChildGroup']> {
    return this.runtime.bindUberDraftOptionChildGroup(...args);
  }

  unbindUberDraftOptionChildGroup(
    ...args: Parameters<
      UberIntegrationRuntime['unbindUberDraftOptionChildGroup']
    >
  ): ReturnType<UberIntegrationRuntime['unbindUberDraftOptionChildGroup']> {
    return this.runtime.unbindUberDraftOptionChildGroup(...args);
  }

  getUberMenuDraftDiff(
    ...args: Parameters<UberIntegrationRuntime['getUberMenuDraftDiff']>
  ): ReturnType<UberIntegrationRuntime['getUberMenuDraftDiff']> {
    return this.runtime.getUberMenuDraftDiff(...args);
  }

  publishUberMenu(
    ...args: Parameters<UberIntegrationRuntime['publishUberMenu']>
  ): ReturnType<UberIntegrationRuntime['publishUberMenu']> {
    return this.runtime.publishUberMenu(...args);
  }

  syncUberMenuItemAvailability(
    ...args: Parameters<UberIntegrationRuntime['syncUberMenuItemAvailability']>
  ): ReturnType<UberIntegrationRuntime['syncUberMenuItemAvailability']> {
    return this.runtime.syncUberMenuItemAvailability(...args);
  }

  syncUberOptionItemAvailability(
    ...args: Parameters<
      UberIntegrationRuntime['syncUberOptionItemAvailability']
    >
  ): ReturnType<UberIntegrationRuntime['syncUberOptionItemAvailability']> {
    return this.runtime.syncUberOptionItemAvailability(...args);
  }

  validateUberMenuPayload(
    ...args: Parameters<UberIntegrationRuntime['validateUberMenuPayload']>
  ): ReturnType<UberIntegrationRuntime['validateUberMenuPayload']> {
    return this.runtime.validateUberMenuPayload(...args);
  }

  normalizeAndValidateUberMenuGraph(
    ...args: Parameters<
      UberIntegrationRuntime['normalizeAndValidateUberMenuGraph']
    >
  ): ReturnType<UberIntegrationRuntime['normalizeAndValidateUberMenuGraph']> {
    return this.runtime.normalizeAndValidateUberMenuGraph(...args);
  }
}
