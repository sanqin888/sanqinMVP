import { Injectable } from '@nestjs/common';
import { UberPrismaAccessService } from './uber-prisma-access.service';

/** Persistence boundary for merchant credentials. */
@Injectable()
export class UberMerchantConnectionRepository {
  constructor(private readonly prisma: UberPrismaAccessService) {}
  get delegate() {
    return this.prisma.uberMerchantConnectionDelegate;
  }
}

/** Persistence boundary for the local-to-Uber store association. */
@Injectable()
export class UberStoreMappingRepository {
  constructor(private readonly prisma: UberPrismaAccessService) {}
  get delegate() {
    return this.prisma.uberStoreMappingDelegate;
  }
}

/**
 * OAuth state persistence boundary. `consume` is a database compare-and-set:
 * precisely one concurrent callback can change a matching row.
 */
@Injectable()
export class UberOAuthStateRepository {
  constructor(private readonly prisma: UberPrismaAccessService) {}

  get delegate() {
    return this.prisma.uberOAuthStateRequestDelegate;
  }

  consume(input: {
    nonce: string;
    adminSessionId: string;
    issuedAt: Date;
    now: Date;
  }) {
    return this.delegate.updateMany({
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
