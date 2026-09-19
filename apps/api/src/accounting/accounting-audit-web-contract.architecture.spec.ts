import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const controllerSource = readFileSync(
  resolve(__dirname, 'accounting-audit.controller.ts'),
  'utf8',
);
const serviceSource = readFileSync(
  resolve(__dirname, 'accounting.service.ts'),
  'utf8',
);

describe('Phase 9 Slice 8B-A Accounting Audit transport contract', () => {
  it('uses the canonical actor-reference query name at the HTTP boundary', () => {
    expect(controllerSource).toContain(
      "@Query('operatorActorRef') operatorActorRef?: string",
    );
    expect(controllerSource).toContain('operatorActorRef,');
    expect(controllerSource).not.toContain("@Query('operatorUserId')");
  });

  it(
    'returns the canonical actor reference without the Slice 7-B compatibility remap',
    () => {
      expect(serviceSource).toContain('operatorActorRef: true');
      expect(serviceSource).not.toContain('operatorUserId: operatorActorRef');
      expect(serviceSource).not.toContain(
        'Preserve the current Web/PWA read contract until the planned 8B cleanup.',
      );
    },
  );
});
