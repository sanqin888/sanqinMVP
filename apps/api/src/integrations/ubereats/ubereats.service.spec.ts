jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
  Channel: { ubereats: 'ubereats' },
  FulfillmentType: { pickup: 'pickup', delivery: 'delivery' },
  OrderStatus: {
    pending: 'pending',
    paid: 'paid',
    making: 'making',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
  },
  PaymentMethod: { UBEREATS: 'UBEREATS' },
  UberMenuPublishStatus: {
    SUBMITTED: 'SUBMITTED',
    SUCCEEDED: 'SUCCEEDED',
    FAILED: 'FAILED',
  },
  UberOpsTicketPriority: {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    CRITICAL: 'CRITICAL',
  },
  UberOpsTicketStatus: {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    RESOLVED: 'RESOLVED',
  },
  UberOpsTicketType: { STORE_STATUS_SYNC: 'STORE_STATUS_SYNC' },
}));
import { UberMenuService } from './uber-menu.service';
import { UberMerchantService } from './uber-merchant.service';
import { UberOperationsService } from './uber-operations.service';
import { UberOrderService } from './uber-order.service';
import { UberWebhookService } from './uber-webhook.service';
import { UberEatsService } from './ubereats.service';

type FacadeDependency = Record<string, jest.Mock>;
type FacadeMethod = keyof UberEatsService;

const methods = {
  webhook: ['handleWebhook'],
  orders: [
    'syncOrderStatusToUber',
    'getReadyForPickupAction',
    'retryReadyForPickup',
    'processPendingUberOrderActions',
    'acceptUberOrder',
    'denyUberOrder',
    'listPendingUberOrders',
  ],
  menu: [
    'listUberItemChannelConfigs',
    'listUberPublishedMenuItems',
    'listUberOptionItemConfigs',
    'upsertUberItemChannelConfig',
    'upsertUberOptionItemConfig',
    'getUberMenuDraft',
    'updateUberDraftItem',
    'updateUberDraftGroup',
    'updateUberDraftOption',
    'bindUberDraftOptionChildGroup',
    'unbindUberDraftOptionChildGroup',
    'getUberMenuDraftDiff',
    'publishUberMenu',
    'syncUberMenuItemAvailability',
    'syncUberOptionItemAvailability',
    'validateUberMenuPayload',
  ],
  merchant: [
    'buildMerchantAuthorizeUrl',
    'startMerchantOAuth',
    'exchangeAuthorizationCode',
    'getMerchantStores',
    'updatePosExternalStoreId',
    'getMerchantConnectionStatus',
    'provisionStore',
    'revokeOrDeprovisionStore',
    'syncStoreStatusToUber',
  ],
  operations: [
    'generateReconciliationReport',
    'listReconciliationReports',
    'createOpsTicket',
    'listOpsTickets',
    'retryOpsTicket',
  ],
} satisfies Record<string, FacadeMethod[]>;

const dependency = (
  names: FacadeMethod[],
  response: unknown,
): FacadeDependency =>
  Object.fromEntries(
    names.map((name) => [name, jest.fn().mockResolvedValue(response)]),
  );

describe('UberEatsService facade', () => {
  it('将所有原公开方法委托给对应 provider，并原样保留 controller 响应结构', async () => {
    const controllerResponse = { success: true, data: { status: 'SUCCEEDED' } };
    const webhook = dependency(methods.webhook, controllerResponse);
    const orders = dependency(methods.orders, controllerResponse);
    const menu = dependency(methods.menu, controllerResponse);
    const merchant = dependency(methods.merchant, controllerResponse);
    const operations = dependency(methods.operations, controllerResponse);
    const service = new UberEatsService(
      webhook as Pick<UberWebhookService, 'handleWebhook'>,
      orders as Pick<UberOrderService, (typeof methods.orders)[number]>,
      menu as Pick<UberMenuService, (typeof methods.menu)[number]>,
      merchant as Pick<UberMerchantService, (typeof methods.merchant)[number]>,
      operations as Pick<
        UberOperationsService,
        (typeof methods.operations)[number]
      >,
    );

    for (const [providerName, provider] of Object.entries({
      webhook,
      orders,
      menu,
      merchant,
      operations,
    })) {
      for (const method of methods[providerName as keyof typeof methods]) {
        const result = await (
          service[method] as (...args: unknown[]) => unknown
        )('argument');
        expect(provider[method]).toHaveBeenCalledWith('argument');
        expect(result).toBe(controllerResponse);
      }
    }
  });
});
