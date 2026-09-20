import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const cardSource = readFileSync(
  resolve(__dirname, 'reconciliation-card.tsx'),
  'utf8',
);
const adminShellSource = readFileSync(
  resolve(__dirname, '../../../../../../components/staff/AdminShell.tsx'),
  'utf8',
);

describe('Admin Uber Direct reconciliation UI contract', () => {
  it('requires Dashboard verification for UNKNOWN, exposes manual-create details, and never calls Uber directly from the browser', () => {
    expect(pageSource).toContain('https://direct.uber.com/');
    expect(cardSource).toContain('CONFIRM_NOT_CREATED_RETRY');
    expect(cardSource).toContain('BIND_EXISTING');
    expect(cardSource).toContain('retryConfirmed');
    expect(cardSource).toContain('LOCAL_BIND_CONFLICT');
    expect(cardSource).toContain('deliveryDestination');
    expect(cardSource).toContain('UNKNOWN 必须先确认');
    expect(pageSource).toContain(
      '/admin/orders/delivery-dispatch/reconciliation?limit=100',
    );
    expect(pageSource).toContain(
      '/admin/orders/delivery-dispatch/${encodeURIComponent(',
    );
    expect(pageSource).not.toContain('createDelivery');
    expect(cardSource).not.toContain('createDelivery');
  });

  it('keeps the reconciliation navigation entry ADMIN-only', () => {
    expect(adminShellSource).toContain('delivery-dispatch');
    expect(adminShellSource).toContain("roles: ['ADMIN']");
  });
});
