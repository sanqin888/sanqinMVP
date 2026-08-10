import { Injectable } from '@nestjs/common';
import { UberPrismaAccessService } from './uber-prisma-access.service';
import { PrismaService } from '../../../../prisma/prisma.service';

/** Prisma details used by the legacy merchant workflow stay behind this repository. */
@Injectable()
export class UberMerchantWorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  findStoreMappings(merchantUberUserId: string, uberStoreIds: string[]) {
    return this.prisma.uberStoreMapping.findMany({
      where: { merchantUberUserId, uberStoreId: { in: uberStoreIds } },
      select: {
        uberStoreId: true,
        isProvisioned: true,
        provisionedAt: true,
        posExternalStoreId: true,
      },
    });
  }

  createOpsTicket(
    data: Parameters<PrismaService['uberOpsTicket']['create']>[0]['data'],
  ) {
    return this.prisma.uberOpsTicket.create({ data });
  }

  async ensureBusinessConfig() {
    const config = await this.prisma.businessConfig.findUnique({
      where: { id: 1 },
    });
    return (
      config ??
      this.prisma.businessConfig.create({ data: { id: 1, storeName: '' } })
    );
  }
}

/** Persistence boundary for merchant credentials. */
@Injectable()
export class UberMerchantConnectionRepository {
  constructor(private readonly prisma: UberPrismaAccessService) {}
  findUnique(
    input: Parameters<
      UberPrismaAccessService['uberMerchantConnectionRepository']['findUnique']
    >[0],
  ) {
    return this.prisma.uberMerchantConnectionRepository.findUnique(input);
  }
  findFirst(
    input: Parameters<
      UberPrismaAccessService['uberMerchantConnectionRepository']['findFirst']
    >[0],
  ) {
    return this.prisma.uberMerchantConnectionRepository.findFirst(input);
  }
  upsert(
    input: Parameters<
      UberPrismaAccessService['uberMerchantConnectionRepository']['upsert']
    >[0],
  ) {
    return this.prisma.uberMerchantConnectionRepository.upsert(input);
  }
}

/** Persistence boundary for the local-to-Uber store association. */
@Injectable()
export class UberStoreMappingRepository {
  constructor(private readonly prisma: UberPrismaAccessService) {}
  findStoreMapping(uberStoreId: string) {
    return this.prisma.uberStoreMappingRepository.findUnique({
      where: { uberStoreId },
    });
  }
  saveStoreMapping(
    input: Parameters<
      UberPrismaAccessService['uberStoreMappingRepository']['upsert']
    >[0],
  ) {
    return this.prisma.uberStoreMappingRepository.upsert(input);
  }
}

/**
 * OAuth state persistence boundary. `consume` is a database compare-and-set:
 * precisely one concurrent callback can change a matching row.
 */
@Injectable()
export class UberOAuthStateRepository {
  constructor(private readonly prisma: UberPrismaAccessService) {}

  consumeOAuthState(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    now: Date;
  }) {
    return this.prisma.uberOAuthStateRepository.updateMany({
      where: {
        nonce: input.nonce,
        adminSessionId: input.adminSessionId,
        issuedAt: input.issuedAt,
        expiresAt: { gt: input.now },
        consumedAt: null,
      },
      data: { consumedAt: input.now },
    });
  }
}
