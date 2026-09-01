import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const POS_ROOT = resolve(__dirname);
const ADMIN_POS_DEVICE_ROOT = resolve(POS_ROOT, '..', 'admin', 'pos-devices');

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
