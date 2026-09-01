import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const POS_ROOT = resolve(__dirname);
const API_ROOT = resolve(POS_ROOT, '..');
const ADMIN_POS_DEVICE_ROOT = resolve(API_ROOT, 'admin', 'pos-devices');
const AUTH_ROOT = resolve(API_ROOT, 'auth');
const ORDERS_ROOT = resolve(API_ROOT, 'orders');
const ORCHESTRATION_ROOT = resolve(API_ROOT, 'orchestration');

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
    const contract = read(resolve(POS_ROOT, 'pos-device-management.contract.ts'));

    expect(contract).toContain('AuthenticatedPosIdentity');
    expect(contract).toContain('deviceStableId: string');
    expect(contract).toContain('storeStableId: string');
    expect(contract).toContain('name: string | null');
    expect(contract).not.toMatch(/\bstoreId\s*:/);
    expect(contract).not.toMatch(/\bdeviceId\s*:/);
    expect(contract).not.toContain('deviceKeyHash');
  });

  it('prevents POS HTTP, Socket and Payments consumers from inventing identity shapes', () => {
    const consumers = [
      resolve(ORDERS_ROOT, 'scheduled-orders.controller.ts'),
      resolve(POS_ROOT, 'pos-device.guard.ts'),
      resolve(POS_ROOT, 'pos-devices.controller.ts'),
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
