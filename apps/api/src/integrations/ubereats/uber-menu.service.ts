import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UberAuthService } from './uber-auth.service';
import { UberConfigService, type UberMenuConfig } from './uber-config.service';
import { UberHttpClient } from './uber-http.client';
import { UberMenuWorkflowCore } from './uber-menu.workflow';
import { UberPrismaAccessService } from './uber-prisma-access.service';
@Injectable()
export class UberMenuService extends UberMenuWorkflowCore {
  constructor(
    prisma: PrismaService,
    auth: UberAuthService,
    http: UberHttpClient,
    @Inject(UberConfigService) config: UberMenuConfig,
    access: UberPrismaAccessService,
  ) {
    super(prisma, auth, http, config, access);
  }
}
