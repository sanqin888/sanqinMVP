import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberIntegrationRuntime } from './uber-integration.runtime';
import { UberOrderService } from './uber-order.service';
import { UberMenuService } from './uber-menu.service';

/** Webhook signature verification, durable inbox claiming and event routing. */
@Injectable()
export class UberWebhookService {
  private readonly runtime: UberIntegrationRuntime;

  constructor(
    prisma: PrismaService,
    uberAuthService: UberAuthService,
    @Optional() orderEventsBus?: OrderEventsBus,
    @Optional() orderIngestionService?: OrderIngestionService,
    @Optional() httpClient?: UberHttpClient,
    @Optional() config?: UberConfigService,
    @Optional() private readonly orders?: UberOrderService,
    @Optional() private readonly menu?: UberMenuService,
  ) {
    this.runtime = new UberIntegrationRuntime(
      prisma,
      uberAuthService,
      orderEventsBus,
      orderIngestionService,
      httpClient,
      config,
    );
    // Keep domain collaborators explicit; webhook routing can evolve without inheritance.
    void this.orders;
    void this.menu;
    return this.runtime as unknown as UberWebhookService;
  }

  handleWebhook(
    ...args: Parameters<UberIntegrationRuntime['handleWebhook']>
  ): ReturnType<UberIntegrationRuntime['handleWebhook']> {
    return this.runtime.handleWebhook(...args);
  }
}
