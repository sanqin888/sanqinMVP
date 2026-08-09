import type {
  UberMerchantConnectionRecord,
  UberStoreMappingRecord,
} from './uber-merchant.types';
import type {
  UberOrderActionName,
  UberOrderActionRecord,
} from './uber-order.types';

export type UberOrderActionDelegate = {
  findUnique(args: {
    where: {
      externalOrderId_action: {
        externalOrderId: string;
        action: UberOrderActionName;
      };
    };
  }): Promise<UberOrderActionRecord | null>;
  create(args: {
    data: Record<string, unknown>;
  }): Promise<UberOrderActionRecord>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<UberOrderActionRecord>;
  upsert(args: {
    where: {
      externalOrderId_action: {
        externalOrderId: string;
        action: UberOrderActionName;
      };
    };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<UberOrderActionRecord>;
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: { updatedAt: 'asc' | 'desc' };
    take: number;
  }): Promise<UberOrderActionRecord[]>;
};

export type UberMerchantConnectionDelegate = {
  findUnique(args: {
    where: { merchantUberUserId: string };
  }): Promise<UberMerchantConnectionRecord | null>;
  findFirst(args: {
    orderBy: { connectedAt: 'desc' | 'asc' };
  }): Promise<UberMerchantConnectionRecord | null>;
  upsert(args: {
    where: { merchantUberUserId: string };
    create: UberMerchantConnectionRecord;
    update: Omit<
      UberMerchantConnectionRecord,
      'merchantUberUserId' | 'rawStoresSnapshot'
    >;
  }): Promise<UberMerchantConnectionRecord>;
  update(args: {
    where: { merchantUberUserId: string };
    data: { rawStoresSnapshot: Record<string, unknown> };
  }): Promise<unknown>;
};

export type UberStoreMappingDelegate = {
  findUnique(args: {
    where: { uberStoreId: string };
  }): Promise<UberStoreMappingRecord | null>;
  findMany(args: {
    orderBy: { uberStoreId: 'asc' | 'desc' };
  }): Promise<UberStoreMappingRecord[]>;
  upsert(args: {
    where: { uberStoreId: string };
    create: {
      merchantUberUserId: string;
      uberStoreId: string;
      storeName: string | null;
      locationSummary: string | null;
      isProvisioned: boolean;
      provisionedAt: Date | null;
      posExternalStoreId: string | null;
      rawPayload: Record<string, unknown>;
    };
    update: {
      merchantUberUserId: string;
      storeName: string | null;
      locationSummary: string | null;
      isProvisioned?: boolean;
      provisionedAt?: Date | undefined;
      posExternalStoreId?: string | null;
      rawPayload: Record<string, unknown>;
    };
  }): Promise<UberStoreMappingRecord>;
  updateMany(args: {
    where: { uberStoreId: string };
    data: {
      isProvisioned: boolean;
      provisionedAt: Date | null;
    };
  }): Promise<{ count: number }>;
  update(args: {
    where: { uberStoreId: string };
    data: { posExternalStoreId: string };
  }): Promise<UberStoreMappingRecord>;
};

export type UberOAuthStateRequestRecord = {
  nonce: string;
  adminSessionId: string;
  redirectUri: string;
  merchantContext: string | null;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type UberOAuthStateRequestDelegate = {
  create(args: {
    data: Omit<UberOAuthStateRequestRecord, 'consumedAt'>;
  }): Promise<unknown>;
  findUnique(args: {
    where: { nonce: string };
  }): Promise<UberOAuthStateRequestRecord | null>;
  updateMany(args: {
    where: {
      nonce: string;
      adminSessionId: string;
      issuedAt: Date;
      expiresAt: { gt: Date };
      consumedAt: null;
    };
    data: { consumedAt: Date };
  }): Promise<{ count: number }>;
  deleteMany(args: {
    where: { expiresAt: { lte: Date } };
  }): Promise<{ count: number }>;
};
