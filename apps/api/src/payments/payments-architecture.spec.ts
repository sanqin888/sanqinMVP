import { resolve } from 'node:path';

import {
  importViolations,
  interfaceMethods,
  scanTypeScript,
} from '../integrations/ubereats/test/architecture-test.utils';

const PAYMENTS_ROOT = resolve(__dirname);
const SOURCE_ROOT = resolve(PAYMENTS_ROOT, '..');

const crossesBoundedContext = (specifier: string) =>
  /(?:^|\/)(?:orders|pos|clover)(?:\/|$)/.test(specifier);

const dependsOnFrameworkOrPersistence = (specifier: string) =>
  specifier.startsWith('@nestjs/') ||
  specifier === '@prisma/client' ||
  /(?:^|\/)prisma(?:\/|$)/.test(specifier) ||
  /(?:^|\/)infrastructure(?:\/|$)/.test(specifier);

describe('Payments bounded-context architecture', () => {
  it(
    'keeps the payment domain framework-independent and isolated from Orders, POS and Clover',
    () => {
      const domainFiles = scanTypeScript(resolve(PAYMENTS_ROOT, 'domain'), {
        productionOnly: true,
      });

      expect(
        importViolations(
          domainFiles,
          PAYMENTS_ROOT,
          (specifier) =>
            crossesBoundedContext(specifier) ||
            dependsOnFrameworkOrPersistence(specifier) ||
            /(?:^|\/)application(?:\/|$)/.test(specifier),
        ),
      ).toEqual([]);
    },
  );

  it(
    'keeps the payment application layer on domain and port boundaries only',
    () => {
      const applicationFiles = scanTypeScript(
        resolve(PAYMENTS_ROOT, 'application'),
        { productionOnly: true },
      );

      expect(
        importViolations(
          applicationFiles,
          PAYMENTS_ROOT,
          (specifier) =>
            crossesBoundedContext(specifier) ||
            dependsOnFrameworkOrPersistence(specifier),
        ),
      ).toEqual([]);
    },
  );

  it(
    'defines the provider boundary without exposing a concrete Clover gateway',
    () => {
      const providerPort = scanTypeScript(
        resolve(PAYMENTS_ROOT, 'application'),
      ).find(({ path }) => path.endsWith('payment-provider.port.ts'));

      expect(providerPort).toBeDefined();
      expect(
        providerPort
          ? interfaceMethods(providerPort).find(
              ({ interfaceName }) => interfaceName === 'PaymentProvider',
            )?.methods
          : undefined,
      ).toEqual([
        'startPayment',
        'getPaymentStatus',
        'cancelPayment',
        'voidPayment',
        'refundPayment',
      ]);
    },
  );

  it(
    'tracks the exact Phase B legacy Clover -> Orders exceptions and prevents them from spreading',
    () => {
      const cloverFiles = scanTypeScript(resolve(SOURCE_ROOT, 'clover'), {
        productionOnly: true,
      });
      const violations = importViolations(
        cloverFiles,
        SOURCE_ROOT,
        (specifier) => /(?:^|\/)orders(?:\/|$)/.test(specifier),
      ).sort();

      // Phase B must delete these two exceptions when Clover becomes a Payment provider.
      expect(violations).toEqual(
        [
          'clover/clover-pay.controller.ts -> ../orders/orders.service',
          'clover/clover.module.ts -> ../orders/orders.module',
        ].sort(),
      );
    },
  );
});
