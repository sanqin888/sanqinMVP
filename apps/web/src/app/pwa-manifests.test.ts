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

  it('gives Admin and Accounting independent identities and language-neutral launch URLs', () => {
    const admin = readStaffManifest('admin.webmanifest');
    const accounting = readStaffManifest('accounting.webmanifest');

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
      start_url: '/accounting',
      scope: '/',
    });

    expect(new Set([manifestId(customerManifest()), admin.id, accounting.id]).size).toBe(3);
  });

  it('uses the repository-hosted PNG icons selected for the staff apps', () => {
    const admin = readStaffManifest('admin.webmanifest');
    const accounting = readStaffManifest('accounting.webmanifest');

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
  });
});

function manifestId(manifest: ReturnType<typeof customerManifest>): string {
  return manifest.id ?? manifest.start_url ?? '';
}
