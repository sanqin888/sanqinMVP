import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  UberMenuPublishRepository,
  UberMerchantConnectionRepository,
  UberOAuthStateRepository,
  UberOpsTicketRepository,
  UberOrderActionRepository,
  UberPrismaRepositories,
  UberStoreMappingRepository,
  UberWebhookInboxRepository,
} from './uber-prisma.types';

/**
 * Typed adapter from generated Prisma delegates to narrow persistence ports.
 * Every model is required at startup: rolling deploy compatibility belongs in
 * the database migration sequence, not in optional runtime model discovery.
 */
@Injectable()
export class UberPrismaAccessService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: UberPrismaRepositories,
  ) {}

  get uberWebhookInboxRepository(): UberWebhookInboxRepository {
    return this.repositories.uberWebhookInbox;
  }

  get uberOrderActionRepository(): UberOrderActionRepository {
    return this.repositories.uberOrderAction;
  }

  get uberMerchantConnectionRepository(): UberMerchantConnectionRepository {
    return this.repositories.uberMerchantConnection;
  }

  get uberStoreMappingRepository(): UberStoreMappingRepository {
    return this.repositories.uberStoreMapping;
  }

  get uberMenuPublishRepository(): UberMenuPublishRepository {
    return this.repositories.uberMenuPublishVersion;
  }

  get uberOpsTicketRepository(): UberOpsTicketRepository {
    return this.repositories.uberOpsTicket;
  }

  get uberOAuthStateRepository(): UberOAuthStateRepository {
    return this.repositories.uberOAuthStateRequest;
  }

  private get repositories(): UberPrismaRepositories {
    return this.prisma;
  }
}
