import { readFileSync } from 'node:fs';
import path from 'node:path';
import customerManifest from './manifest';

type StaffManifest = {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose: string;
  }>;
};

function readStaffManifest(fileName: string): StaffManifest {
  const filePath = path.join(process.cwd(), 'public', fileName);
  return JSON.parse(readFileSync(filePath, 'utf8')) as StaffManifest;
}

describe('PWA manifests', () => {
  it('keeps the customer app identity while using a language-neutral launch URL', () => {
    const manifest = customerManifest();

    expect(manifest.id).toBe('/zh');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('gives Admin, Accounting and POS independent identities and language-neutral launch URLs', () => {
    const admin = readStaffManifest('admin.webmanifest');
    const accounting = readStaffManifest('accounting.webmanifest');
    const pos = readStaffManifest('pos.webmanifest');

    expect(admin).toMatchObject({
      id: '/pwa/admin',
      name: 'SanQ Admin',
      short_name: 'SanQ Admin',
      start_url: '/admin',
      scope: '/',
    });
    expect(accounting).toMatchObject({
      id: '/pwa/accounting',
      name: 'SanQ Accounting',
      short_name: 'SanQ Acct',
      start_url: '/accounting/dashboard',
      scope: '/',
    });
    expect(pos).toMatchObject({
      id: '/pwa/pos',
      name: 'SanQ POS',
      short_name: 'SanQ POS',
      start_url: '/store/pos',
      scope: '/',
    });

    expect(
      new Set([manifestId(customerManifest()), admin.id, accounting.id, pos.id])
        .size,
    ).toBe(4);
  });

  it('uses the repository-hosted PNG icons selected for the staff apps', () => {
    const admin = readStaffManifest('admin.webmanifest');
    const accounting = readStaffManifest('accounting.webmanifest');
    const pos = readStaffManifest('pos.webmanifest');

    expect(admin.icons).toEqual([
      {
        src: '/images/pwa/admin-v1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ]);
    expect(accounting.icons).toEqual([
      {
        src: '/images/pwa/accounting-v1.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ]);
    expect(pos.icons).toEqual([
      {
        src: '/images/icon-512-v2.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ]);
  });

  it('binds the POS route group to the POS manifest instead of the customer manifest', () => {
    const filePath = path.join(
      process.cwd(),
      'src',
      'app',
      '[locale]',
      '(device)',
      'store',
      'pos',
      'layout.tsx',
    );
    const layout = readFileSync(filePath, 'utf8');

    expect(layout).toContain('manifest: "/pos.webmanifest"');
  });
});

function manifestId(manifest: ReturnType<typeof customerManifest>): string {
  return manifest.id ?? manifest.start_url ?? '';
}
