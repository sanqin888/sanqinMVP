import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOMAIN_SERVICES = [
  'menu',
  'merchant',
  'order',
  'operations',
  'webhook',
] as const;

const DOMAIN_ENTRY_METHODS = {
  menu: [
    'validateUberMenuPayload',
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
    'processWebhookEvent',
  ],
  order: [
    'syncOrderStatusToUber',
    'getReadyForPickupAction',
    'retryReadyForPickup',
    'processPendingUberOrderActions',
    'acceptUberOrder',
    'denyUberOrder',
    'listPendingUberOrders',
    'processWebhookEvent',
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
} as const;

const EXTRACTED_ENTRY_IDENTIFIERS = {
  menu: [
    'buildUberUploadMenuPayload',
    'buildUberDraftEdges',
    'menuVersionHasResourceId',
  ],
  order: [
    'parseOrderPayload',
    'executeUberOrderAction',
    'mapEventTypeToOrderStatus',
  ],
  merchant: ['extractMerchantStores', 'upsertStoreMapping'],
} as const;

const PURE_FUNCTION_MODULES = [
  'uber-integration.utils.ts',
  'uber-menu.payload.ts',
  'uber-order-payload.parser.ts',
  'uber-payload.utils.ts',
] as const;

const INTERNAL_SERVICE_FILES = [
  'uber-menu-draft.service.ts',
  'uber-menu-publish.service.ts',
  'uber-menu-availability.service.ts',
  'uber-order-action.service.ts',
  'uber-order-outbox.service.ts',
  'uber-order-status-sync.service.ts',
  'uber-merchant-oauth.service.ts',
  'uber-merchant-store-mapping.service.ts',
  'uber-merchant-provisioning.service.ts',
  'uber-merchant-internal.service.ts',
] as const;

const LEGACY_WORKFLOWS = {
  menu: ['getUberMenuDraft', 'publishUberMenu', 'syncUberMenuItemAvailability'],
  order: [
    'syncOrderStatusToUber',
    'executeUberOrderAction',
    'processWebhookEvent',
  ],
  merchant: [
    'exchangeAuthorizationCode',
    'upsertStoreMapping',
    'provisionStore',
  ],
} as const;

const readUberSource = (fileName: string) =>
  readFileSync(join(__dirname, fileName), 'utf8');

const lineCount = (source: string) => source.split('\n').length;

describe('Uber Eats domain service architecture', () => {
  it.each(DOMAIN_SERVICES)(
    'keeps %s service declarations in focused shared modules',
    (domain) => {
      const source = readUberSource(`uber-${domain}.service.ts`);
      const serviceHeader = source.slice(0, source.indexOf('@Injectable()'));

      expect(source).not.toContain(
        'eslint-disable @typescript-eslint/no-unused-vars',
      );
      expect(serviceHeader).not.toMatch(
        /(?:^|\n)(?:export\s+)?(?:class|interface|type|const|function)\s+Uber/,
      );
      expect(serviceHeader.split('\n').length).toBeLessThan(100);
    },
  );

  it.each(Object.entries(DOMAIN_ENTRY_METHODS))(
    'keeps the %s entry point as an explicit, delegating facade',
    (domain, methods) => {
      const source = readUberSource(`uber-${domain}.service.ts`);
      const className = `Uber${domain[0].toUpperCase()}${domain.slice(1)}Service`;

      expect(lineCount(source)).toBeLessThanOrEqual(300);
      expect(source).toContain(`export class ${className}`);
      expect(source).not.toMatch(/export\s*{[^}]+}\s*from\s*['"]/s);

      for (const method of methods) {
        expect(source).toMatch(new RegExp(`\\n\\s{2}${method}\\s*\\(`));
        expect(source).toMatch(
          new RegExp(`return\\s+(?:await\\s+)?this\\.\\w+\\.${method}\\s*\\(`),
        );
      }

      for (const identifier of EXTRACTED_ENTRY_IDENTIFIERS[
        domain as keyof typeof EXTRACTED_ENTRY_IDENTIFIERS
      ]) {
        expect(source).not.toContain(identifier);
      }
    },
  );

  it.each(PURE_FUNCTION_MODULES)(
    'keeps %s independent from Nest, Prisma, and HTTP infrastructure',
    (fileName) => {
      const source = readUberSource(fileName);

      expect(source).not.toMatch(/from\s+['"]@nestjs\/common['"]/);
      expect(source).not.toContain('PrismaService');
      expect(source).not.toContain('UberHttpClient');
    },
  );

  it.each(INTERNAL_SERVICE_FILES)(
    'keeps the focused internal service %s below 600 lines',
    (fileName) => {
      expect(lineCount(readUberSource(fileName))).toBeLessThanOrEqual(600);
    },
  );

  it.each(Object.entries(LEGACY_WORKFLOWS))(
    'does not allow a monolithic %s workflow to return',
    (domain, crossResponsibilityIdentifiers) => {
      const workflowPath = join(__dirname, `uber-${domain}.workflow.ts`);
      if (!existsSync(workflowPath)) return;

      const source = readFileSync(workflowPath, 'utf8');
      const methodCount = source.match(
        /^\s{2}(?:(?:public|protected|private)\s+)?(?:async\s+)?\w+\s*\(/gm,
      )?.length;

      expect(lineCount(source)).toBeLessThanOrEqual(600);
      expect(methodCount ?? 0).toBeLessThanOrEqual(15);
      expect(
        crossResponsibilityIdentifiers.every((identifier) =>
          source.includes(identifier),
        ),
      ).toBe(false);
    },
  );

  it('keeps payload and Prisma compatibility declarations separated by responsibility', () => {
    const orderTypes = readUberSource('uber-order.types.ts');
    const menuTypes = readUberSource('uber-menu.types.ts');
    const prismaTypes = readUberSource('uber-prisma.types.ts');

    expect(orderTypes).toContain('export type UberOrderDetailDto');
    expect(orderTypes).not.toContain('UberMenuUploadPayload');
    expect(menuTypes).toContain('export type UberMenuUploadPayload');
    expect(menuTypes).not.toContain('UberOrderDetailDto');
    expect(prismaTypes).toContain('export type UberOrderActionDelegate');
    expect(prismaTypes).not.toContain('UberOrderDetailDto');
  });
});
