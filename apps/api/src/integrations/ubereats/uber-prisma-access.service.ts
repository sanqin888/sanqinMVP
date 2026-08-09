import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  UberMerchantConnectionDelegate,
  UberOAuthStateRequestDelegate,
  UberOrderActionDelegate,
  UberStoreMappingDelegate,
} from './uber-prisma.types';

type UberPrismaDelegates = {
  uberMerchantConnection?: UberMerchantConnectionDelegate;
  uberOAuthStateRequest?: UberOAuthStateRequestDelegate;
  uberStoreMapping?: UberStoreMappingDelegate;
  uberOrderAction?: UberOrderActionDelegate;
};

export class UberPrismaDelegateUnavailableError extends Error {
  constructor(readonly delegateName: keyof UberPrismaDelegates) {
    super(`Uber Prisma 必需 delegate 不可用: ${delegateName}`);
    this.name = UberPrismaDelegateUnavailableError.name;
  }
}

@Injectable()
export class UberPrismaAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Compatibility delegates may be absent while an older Prisma client is deployed. */
  get uberMerchantConnectionDelegate(): UberMerchantConnectionDelegate | null {
    return this.delegates.uberMerchantConnection ?? null;
  }

  get uberStoreMappingDelegate(): UberStoreMappingDelegate | null {
    return this.delegates.uberStoreMapping ?? null;
  }

  /** Required delegates fail consistently instead of causing an undefined access. */
  get uberOAuthStateRequestDelegate(): UberOAuthStateRequestDelegate {
    return this.required('uberOAuthStateRequest');
  }

  get uberOrderActionDelegate(): UberOrderActionDelegate {
    return this.required('uberOrderAction');
  }

  private get delegates(): UberPrismaDelegates {
    return this.prisma as PrismaService & UberPrismaDelegates;
  }

  private required<K extends keyof UberPrismaDelegates>(
    delegateName: K,
  ): NonNullable<UberPrismaDelegates[K]> {
    const delegate = this.delegates[delegateName];
    if (!delegate) {
      throw new UberPrismaDelegateUnavailableError(delegateName);
    }
    return delegate;
  }
}
