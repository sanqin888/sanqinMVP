import { PrismaService } from '../../prisma/prisma.service';
import {
  UberPrismaAccessService,
  UberPrismaDelegateUnavailableError,
} from './uber-prisma-access.service';

describe('UberPrismaAccessService', () => {
  it('返回已存在的 delegate', () => {
    const merchantConnection = {};
    const oauthStateRequest = {};
    const storeMapping = {};
    const orderAction = {};
    const access = new UberPrismaAccessService({
      uberMerchantConnection: merchantConnection,
      uberOAuthStateRequest: oauthStateRequest,
      uberStoreMapping: storeMapping,
      uberOrderAction: orderAction,
    } as unknown as PrismaService);

    expect(access.uberMerchantConnectionDelegate).toBe(merchantConnection);
    expect(access.uberOAuthStateRequestDelegate).toBe(oauthStateRequest);
    expect(access.uberStoreMappingDelegate).toBe(storeMapping);
    expect(access.uberOrderActionDelegate).toBe(orderAction);
  });

  it('可选兼容 delegate 缺失时返回 null', () => {
    const access = new UberPrismaAccessService({} as PrismaService);

    expect(access.uberMerchantConnectionDelegate).toBeNull();
    expect(access.uberStoreMappingDelegate).toBeNull();
  });

  it.each(['uberOAuthStateRequest', 'uberOrderAction'] as const)(
    '必需 delegate %s 缺失时抛出统一错误',
    (delegateName) => {
      const access = new UberPrismaAccessService({} as PrismaService);
      const readDelegate = () =>
        delegateName === 'uberOAuthStateRequest'
          ? access.uberOAuthStateRequestDelegate
          : access.uberOrderActionDelegate;

      expect(readDelegate).toThrow(UberPrismaDelegateUnavailableError);
      expect(readDelegate).toThrow(
        `Uber Prisma 必需 delegate 不可用: ${delegateName}`,
      );
    },
  );
});
