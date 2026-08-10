import { UberPrismaAccessService } from './uber-prisma-access.service';
import type { UberPrismaRepositories } from './uber-prisma.types';

describe('UberPrismaAccessService', () => {
  it('把生成的 delegate 作为必需的窄 repository 暴露', () => {
    const repositories = {
      uberWebhookInbox: {},
      uberMerchantConnection: {},
      uberOAuthStateRequest: {},
      uberStoreMapping: {},
      uberOrderAction: {},
      uberMenuPublishVersion: {},
      uberOpsTicket: {},
    } as UberPrismaRepositories;
    const access = new UberPrismaAccessService(repositories);

    expect(access.uberWebhookInboxRepository).toBe(
      repositories.uberWebhookInbox,
    );
    expect(access.uberMerchantConnectionRepository).toBe(
      repositories.uberMerchantConnection,
    );
    expect(access.uberOAuthStateRepository).toBe(
      repositories.uberOAuthStateRequest,
    );
    expect(access.uberStoreMappingRepository).toBe(
      repositories.uberStoreMapping,
    );
    expect(access.uberOrderActionRepository).toBe(repositories.uberOrderAction);
    expect(access.uberMenuPublishRepository).toBe(
      repositories.uberMenuPublishVersion,
    );
    expect(access.uberOpsTicketRepository).toBe(repositories.uberOpsTicket);
  });
});
