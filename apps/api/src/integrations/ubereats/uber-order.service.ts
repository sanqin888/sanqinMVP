import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberIntegrationRuntime } from './uber-integration.runtime';

/** Order ingestion, parsing, persistence and outbound order actions. */
@Injectable()
export class UberOrderService {
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

  syncOrderStatusToUber(
    ...args: Parameters<UberIntegrationRuntime['syncOrderStatusToUber']>
  ): ReturnType<UberIntegrationRuntime['syncOrderStatusToUber']> {
    return this.runtime.syncOrderStatusToUber(...args);
  }

  getReadyForPickupAction(
    ...args: Parameters<UberIntegrationRuntime['getReadyForPickupAction']>
  ): ReturnType<UberIntegrationRuntime['getReadyForPickupAction']> {
    return this.runtime.getReadyForPickupAction(...args);
  }

  retryReadyForPickup(
    ...args: Parameters<UberIntegrationRuntime['retryReadyForPickup']>
  ): ReturnType<UberIntegrationRuntime['retryReadyForPickup']> {
    return this.runtime.retryReadyForPickup(...args);
  }

  processPendingUberOrderActions(
    ...args: Parameters<
      UberIntegrationRuntime['processPendingUberOrderActions']
    >
  ): ReturnType<UberIntegrationRuntime['processPendingUberOrderActions']> {
    return this.runtime.processPendingUberOrderActions(...args);
  }

  acceptUberOrder(
    ...args: Parameters<UberIntegrationRuntime['acceptUberOrder']>
  ): ReturnType<UberIntegrationRuntime['acceptUberOrder']> {
    return this.runtime.acceptUberOrder(...args);
  }

  denyUberOrder(
    ...args: Parameters<UberIntegrationRuntime['denyUberOrder']>
  ): ReturnType<UberIntegrationRuntime['denyUberOrder']> {
    return this.runtime.denyUberOrder(...args);
  }

  listPendingUberOrders(
    ...args: Parameters<UberIntegrationRuntime['listPendingUberOrders']>
  ): ReturnType<UberIntegrationRuntime['listPendingUberOrders']> {
    return this.runtime.listPendingUberOrders(...args);
  }
}
