import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
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
  readonly uberWebhookInboxRepository: UberWebhookInboxRepository;
  readonly uberOrderActionRepository: UberOrderActionRepository;
  readonly uberMerchantConnectionRepository: UberMerchantConnectionRepository;
  readonly uberStoreMappingRepository: UberStoreMappingRepository;
  readonly uberMenuPublishRepository: UberMenuPublishRepository;
  readonly uberOpsTicketRepository: UberOpsTicketRepository;
  readonly uberOAuthStateRepository: UberOAuthStateRepository;

  constructor(
    @Inject(PrismaService)
    private readonly prisma: UberPrismaRepositories,
  ) {
    this.uberWebhookInboxRepository = prisma.uberWebhookInbox;
    this.uberOrderActionRepository = prisma.uberOrderAction;
    this.uberMerchantConnectionRepository = prisma.uberMerchantConnection;
    this.uberStoreMappingRepository = prisma.uberStoreMapping;
    this.uberMenuPublishRepository = prisma.uberMenuPublishVersion;
    this.uberOpsTicketRepository = prisma.uberOpsTicket;
    this.uberOAuthStateRepository = prisma.uberOAuthStateRequest;
  }
}
