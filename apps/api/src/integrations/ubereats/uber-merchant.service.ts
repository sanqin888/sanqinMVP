import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderEventsBus } from '../../messaging/order-events.bus';
import { OrderIngestionService } from '../../orders/order-ingestion.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberIntegrationBase } from './uber-integration.base';

/** OAuth, merchant discovery, provisioning and store state. */
@Injectable()
export class UberMerchantService extends UberIntegrationBase {
  constructor(
    prisma: PrismaService,
    uberAuthService: UberAuthService,
    @Optional() orderEventsBus?: OrderEventsBus,
    @Optional() orderIngestionService?: OrderIngestionService,
    @Optional() httpClient?: UberHttpClient,
    @Optional() config?: UberConfigService,
  ) {
    super(
      prisma,
      uberAuthService,
      orderEventsBus,
      orderIngestionService,
      httpClient,
      config,
    );
  }
}
