import { resolve } from 'node:path';

import {
  importViolations,
  interfaceMethods,
  scanTypeScript,
} from './test/architecture-test.utils';

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
  it('keeps the payment domain framework-independent and isolated from Orders, POS and Clover', () => {
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
  });

  it('keeps the payment application layer on domain and port boundaries only', () => {
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
  });

  it('defines the provider boundary without exposing a concrete Clover gateway', () => {
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
  });

  it('keeps the Payments bounded context isolated from Orders and POS internals', () => {
    const paymentFiles = scanTypeScript(PAYMENTS_ROOT, {
      productionOnly: true,
    });

    expect(
      importViolations(paymentFiles, SOURCE_ROOT, (specifier) =>
        /(?:^|\/)(?:orders|pos)(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('keeps Clover provider infrastructure isolated from Orders and POS', () => {
    const cloverInfrastructure = scanTypeScript(
      resolve(PAYMENTS_ROOT, 'infrastructure', 'clover'),
      { productionOnly: true },
    );

    expect(
      importViolations(cloverInfrastructure, PAYMENTS_ROOT, (specifier) =>
        /(?:^|\/)(?:orders|pos)(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('prevents Orders and POS from importing Clover transport or wire infrastructure', () => {
    const consumers = [
      ...scanTypeScript(resolve(SOURCE_ROOT, 'orders'), {
        productionOnly: true,
      }),
      ...scanTypeScript(resolve(SOURCE_ROOT, 'pos'), {
        productionOnly: true,
      }),
    ];

    expect(
      importViolations(consumers, SOURCE_ROOT, (specifier) =>
        /(?:^|\/)clover(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('tracks the one remaining legacy Web checkout Clover -> Orders exception and prevents it from spreading', () => {
    const cloverFiles = scanTypeScript(resolve(SOURCE_ROOT, 'clover'), {
      productionOnly: true,
    });
    const violations = importViolations(cloverFiles, SOURCE_ROOT, (specifier) =>
      /(?:^|\/)orders(?:\/|$)/.test(specifier),
    ).sort();

    // Phase B removes CloverModule -> OrdersModule. The existing Web checkout
    // controller remains a precise compatibility exception until the Web flow
    // is normalized in a later phase; do not broaden this exception.
    expect(violations).toEqual([
      'clover/clover-pay.controller.ts -> ../orders/orders.service',
    ]);
  });
});
