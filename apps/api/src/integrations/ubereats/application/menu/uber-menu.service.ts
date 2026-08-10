import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { UberAuthService } from '../merchant/uber-auth.service';
import {
  UberConfigService,
  type UberMenuConfig,
} from '../../infrastructure/config/uber-config.service';
import { UberHttpClient } from '../../infrastructure/http/uber-http.client';
import { UberMenuGateway } from '../../infrastructure/api/uber-resource.gateways';
import { UberMenuWorkflowCore } from './uber-menu.workflow';
import { UberPrismaAccessService } from '../../infrastructure/persistence/uber-prisma-access.service';
@Injectable()
export class UberMenuService extends UberMenuWorkflowCore {
  constructor(
    prisma: PrismaService,
    auth: UberAuthService,
    gateway: UberMenuGateway,
    @Inject(UberConfigService) config: UberMenuConfig,
    access: UberPrismaAccessService,
    http: UberHttpClient,
  ) {
    super(prisma, auth, gateway, config, access, http);
  }
}
