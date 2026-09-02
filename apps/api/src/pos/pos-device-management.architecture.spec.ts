import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const POS_ROOT = resolve(__dirname);
const API_ROOT = resolve(POS_ROOT, '..');
const ADMIN_POS_DEVICE_ROOT = resolve(API_ROOT, 'admin', 'pos-devices');
const AUTH_ROOT = resolve(API_ROOT, 'auth');
const ORCHESTRATION_ROOT = resolve(API_ROOT, 'orchestration');
const STORE_ROOT = resolve(API_ROOT, 'store');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('POS device management boundary', () => {
  it('keeps Admin POS-device transport off Prisma persistence', () => {
    const files = [
      'admin-pos-devices.controller.ts',
      'admin-pos-devices.module.ts',
      'dto/create-pos-device.dto.ts',
      'dto/update-pos-device-status.dto.ts',
    ].map((file) => read(resolve(ADMIN_POS_DEVICE_ROOT, file)));

    const source = files.join('\n');
    expect(source).not.toContain('@prisma/client');
    expect(source).not.toMatch(/(?:^|\/)prisma(?:\/|$)/m);
    expect(source).not.toContain('AdminPosDevicesService');
  });

  it('keeps Store persistence behind the Brand/Store public boundary', () => {
    const service = read(resolve(POS_ROOT, 'pos-device.service.ts'));

    expect(service).not.toContain('this.prisma.store');
    expect(service).toContain("from '../store/public-api'");
  });

  it('exposes the POS owner only through its public API', () => {
    const controller = read(
      resolve(ADMIN_POS_DEVICE_ROOT, 'admin-pos-devices.controller.ts'),
    );
    const module = read(
      resolve(ADMIN_POS_DEVICE_ROOT, 'admin-pos-devices.module.ts'),
    );
    const publicApi = read(resolve(POS_ROOT, 'public-api.ts'));

    expect(controller).toContain("from '../../pos/public-api'");
    expect(module).toContain("from '../../pos/public-api'");
    expect(publicApi).toContain('POS_DEVICE_MANAGEMENT');
    expect(publicApi).not.toContain('PosDeviceService');
  });

  it('keeps the retired Admin DB-ID compatibility contract deleted', () => {
    const controller = read(
      resolve(ADMIN_POS_DEVICE_ROOT, 'admin-pos-devices.controller.ts'),
    );
    const createDto = read(
      resolve(ADMIN_POS_DEVICE_ROOT, 'dto/create-pos-device.dto.ts'),
    );
    const posContract = read(
      resolve(POS_ROOT, 'pos-device-management.contract.ts'),
    );
    const posModule = read(resolve(POS_ROOT, 'pos-device.module.ts'));
    const posPublicApi = read(resolve(POS_ROOT, 'public-api.ts'));
    const posService = read(resolve(POS_ROOT, 'pos-device.service.ts'));
    const storeContract = read(
      resolve(STORE_ROOT, 'brand-store-config.contract.ts'),
    );
    const storeModule = read(
      resolve(STORE_ROOT, 'brand-store-config.module.ts'),
    );
    const storePublicApi = read(resolve(STORE_ROOT, 'public-api.ts'));
    const storeReader = read(
      resolve(STORE_ROOT, 'brand-store-config.reader.ts'),
    );

    expect(createDto).toContain('storeStableId: string');
    expect(createDto).not.toMatch(/\bstoreId\??\s*:/);
    expect(createDto).not.toContain('IsUUID');
    expect(controller).toContain(
      "BadRequestException('storeStableId is required')",
    );
    expect(controller).toContain("@Patch(':deviceStableId/reset-code')");
    expect(controller).toContain("@Patch(':deviceStableId/status')");
    expect(controller).toContain("@Delete(':deviceStableId')");
    expect(controller).not.toContain('UUID_PATTERN');
    expect(controller).not.toContain('pos_device_admin_compatibility_used');

    for (const source of [posContract, posModule, posPublicApi, posService]) {
      expect(source).not.toContain('POS_DEVICE_ADMIN_COMPATIBILITY');
      expect(source).not.toContain('PosDeviceAdminCompatibilityPort');
      expect(source).not.toContain('@compat pos-device.admin-db-id.v1');
    }
    expect(posService).not.toContain('resolveDeviceStableId');
    expect(posService).not.toContain('resolveStoreStableId(');

    for (const source of [
      storeContract,
      storeModule,
      storePublicApi,
      storeReader,
    ]) {
      expect(source).not.toContain('STORE_LEGACY_DB_ID_RESOLVER');
      expect(source).not.toContain('StoreLegacyDbIdResolverPort');
      expect(source).not.toContain('resolveStoreStableIdByDbId');
      expect(source).not.toContain('@compat pos-device.admin-db-id.v1');
    }
  });
});

describe('POS device authentication boundary', () => {
  it('keeps POS credential persistence and verification behind the POS public port', () => {
    const authService = read(resolve(AUTH_ROOT, 'auth.service.ts'));
    const authModule = read(resolve(AUTH_ROOT, 'auth.module.ts'));
    const posDeviceModule = read(resolve(POS_ROOT, 'pos-device.module.ts'));
    const publicApi = read(resolve(POS_ROOT, 'public-api.ts'));

    expect(authService).toContain("from '../pos/public-api'");
    expect(authService).toContain('POS_DEVICE_CREDENTIAL_VERIFIER');
    expect(authService).not.toContain('this.prisma.posDevice');
    expect(authService).not.toContain('deviceKeyHash');
    expect(authService).not.toContain('verifyDeviceKey');
    expect(authModule).toContain("from '../pos/public-api'");
    expect(authModule).toContain('PosDeviceModule');
    expect(posDeviceModule).toContain('POS_DEVICE_CREDENTIAL_VERIFIER');
    expect(publicApi).toContain('POS_DEVICE_CREDENTIAL_VERIFIER');
    expect(publicApi).toContain('PosDeviceCredentialVerifierPort');
  });

  it('defines one authenticated POS identity with no DB UUID or credential fields', () => {
    const contract = read(
      resolve(POS_ROOT, 'pos-device-management.contract.ts'),
    );

    expect(contract).toContain('AuthenticatedPosIdentity');
    expect(contract).toContain('deviceStableId: string');
    expect(contract).toContain('storeStableId: string');
    expect(contract).toContain('name: string | null');
    expect(contract).not.toMatch(/\bstoreId\s*:/);
    expect(contract).not.toMatch(/\bdeviceId\s*:/);
    expect(contract).not.toContain('deviceKeyHash');
  });

  it('threads authenticated POS store identity through store-status operations', () => {
    const controller = read(
      resolve(POS_ROOT, 'pos-store-status.controller.ts'),
    );
    const service = read(resolve(POS_ROOT, 'pos-store-status.service.ts'));
    const watchdog = read(
      resolve(POS_ROOT, 'pos-connectivity-watchdog.service.ts'),
    );
    const storeStatusController = read(
      resolve(STORE_ROOT, 'store-status.controller.ts'),
    );
    const storeStatusService = read(
      resolve(STORE_ROOT, 'store-status.service.ts'),
    );

    expect(controller).toContain('req.posDevice?.storeStableId?.trim()');
    expect(controller).toContain(
      'this.service.getCustomerOrderingStatus(requireStoreStableId(req))',
    );
    expect(controller).toContain('requireStoreStableId(req),');
    expect(service).toContain('getStoreSnapshot(storeStableId)');
    expect(service).toMatch(
      /resumeTemporaryClosureIfMatches\(\s*storeStableId,/,
    );
    expect(service).not.toContain('resolveConfiguredStoreStableId');
    expect(watchdog).toContain('store: { storeStableId }');
    expect(watchdog).toContain('getCurrentStatus(storeStableId)');
    expect(watchdog).toContain('reconcileExpiredPause(storeStableId)');
    expect(storeStatusController).toContain(
      'getCurrentStatus(resolveConfiguredStoreStableId())',
    );
    expect(storeStatusService).toContain('getStoreSnapshot(storeStableId)');
    expect(storeStatusService).not.toContain('resolveConfiguredStoreStableId');
  });

  it('threads authenticated POS store identity through exchange-rate quoting while keeping the fallback Brand-owned', () => {
    const controller = read(
      resolve(POS_ROOT, 'pos-exchange-rate.controller.ts'),
    );
    const service = read(resolve(POS_ROOT, 'pos-exchange-rate.service.ts'));

    expect(controller).toContain('AuthenticatedPosIdentity');
    expect(controller).toContain('req.posDevice?.storeStableId?.trim()');
    expect(controller).toContain('requireStoreStableId(req)');
    expect(service).toContain('getStoreSnapshot(storeStableId)');
    expect(service).toContain('getBrandSnapshot()');
    expect(service).not.toContain('brandStoreConfigReader.getSnapshot()');
    expect(service).not.toContain('resolveConfiguredStoreStableId');
  });

  it('prevents POS HTTP, Socket and Payments consumers from inventing identity shapes', () => {
    const consumers = [
      resolve(POS_ROOT, 'pos-device.guard.ts'),
      resolve(POS_ROOT, 'pos-devices.controller.ts'),
      resolve(POS_ROOT, 'pos-exchange-rate.controller.ts'),
      resolve(POS_ROOT, 'pos-orders.controller.ts'),
      resolve(POS_ROOT, 'pos-store-status.controller.ts'),
      resolve(POS_ROOT, 'pos-summary.controller.ts'),
      resolve(POS_ROOT, 'pos.gateway.ts'),
      resolve(ORCHESTRATION_ROOT, 'pos-card-payment.controller.ts'),
      resolve(ORCHESTRATION_ROOT, 'pos-card-refund.controller.ts'),
      resolve(ORCHESTRATION_ROOT, 'pos-full-refund.controller.ts'),
    ].map(read);

    for (const source of consumers) {
      expect(source).toContain('AuthenticatedPosIdentity');
      expect(source).not.toMatch(/posDevice\??\s*:\s*\{/);
      expect(source).not.toMatch(/posDevice\?\.storeId\b/);
    }

    for (const file of [
      'pos-card-payment.controller.ts',
      'pos-card-refund.controller.ts',
      'pos-full-refund.controller.ts',
    ]) {
      const source = read(resolve(ORCHESTRATION_ROOT, file));
      expect(source).toContain("from '../pos/public-api'");
      expect(source).not.toContain('storeId: string; storeStableId: string');
    }
  });
});
