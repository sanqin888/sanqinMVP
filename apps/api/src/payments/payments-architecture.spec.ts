import { resolve } from 'node:path';

import {
  importSpecifiers,
  importViolations,
  interfaceMethods,
  scanTypeScript,
} from '../test/architecture-test.utils';

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

  it('keeps Clover execution/canonical gateways and raw mappers inside provider infrastructure', () => {
    const cloverInfrastructureRoot = resolve(
      PAYMENTS_ROOT,
      'infrastructure',
      'clover',
    );
    const sourceFiles = scanTypeScript(SOURCE_ROOT, {
      productionOnly: true,
    }).filter(({ path }) => !path.startsWith(cloverInfrastructureRoot));

    expect(
      importViolations(sourceFiles, SOURCE_ROOT, (specifier) =>
        /(?:payments\/)?infrastructure\/clover\/(?:terminal|platform|webhook)|clover-terminal\.(?:transport|contracts|mapper)|clover-platform-payments\.(?:gateway|contracts|mapper)|clover-payment-webhook|clover-ecommerce\.(?:contracts|mapper)/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
  });

  it('defines the Platform v3 gateway only inside Payments Clover infrastructure', () => {
    const definitions = scanTypeScript(SOURCE_ROOT, { productionOnly: true })
      .filter(({ source }) =>
        source.includes('class CloverPlatformPaymentsGateway'),
      )
      .map(({ path }) =>
        path.slice(SOURCE_ROOT.length + 1).replaceAll('\\', '/'),
      );

    expect(definitions).toEqual([
      'payments/infrastructure/clover/clover-payment-provider.adapter.ts',
    ]);
  });

  it('keeps Clover merchant OAuth and merchant-scoped credential persistence inside Payments Clover infrastructure', () => {
    const cloverInfrastructureRoot = resolve(
      PAYMENTS_ROOT,
      'infrastructure',
      'clover',
    );
    const oauthDefinitions = scanTypeScript(SOURCE_ROOT, {
      productionOnly: true,
    })
      .filter(({ source }) =>
        source.includes('class CloverMerchantAuthorizationService'),
      )
      .map(({ path }) =>
        path.slice(SOURCE_ROOT.length + 1).replaceAll('\\', '/'),
      );
    const outsideClover = scanTypeScript(SOURCE_ROOT, {
      productionOnly: true,
    }).filter(({ path }) => !path.startsWith(cloverInfrastructureRoot));

    expect(oauthDefinitions).toEqual([
      'payments/infrastructure/clover/oauth/clover-merchant-authorization.service.ts',
    ]);
    expect(
      importViolations(outsideClover, SOURCE_ROOT, (specifier) =>
        /payments\/infrastructure\/clover\/(?:oauth|platform)(?:\/|$)/.test(
          specifier,
        ),
      ),
    ).toEqual([]);
  });

  it('keeps Clover OAuth protocol calls separate from Platform v3 verification calls', () => {
    const cloverFiles = scanTypeScript(
      resolve(PAYMENTS_ROOT, 'infrastructure', 'clover'),
      { productionOnly: true },
    );
    const oauthClient = cloverFiles.find(({ path }) =>
      path.endsWith('oauth/clover-oauth.client.ts'),
    );
    const platformVerification = cloverFiles.find(({ path }) =>
      path.endsWith(
        'platform/clover-platform-merchant-verification.gateway.ts',
      ),
    );

    expect(oauthClient?.source).toContain('/oauth/v2/authorize');
    expect(oauthClient?.source).not.toContain('/v3/merchants/');
    expect(platformVerification?.source).toContain('/v3/merchants/');
    expect(platformVerification?.source).not.toContain('/oauth/v2/');
  });

  it('keeps Clover OAuth secrets and merchant credentials out of Web source', () => {
    const webSource = scanTypeScript(
      resolve(PAYMENTS_ROOT, '../../../web/src'),
      {
        productionOnly: true,
      },
    );
    const violations = webSource
      .filter(({ source }) =>
        /CLOVER_(?:OAUTH_CLIENT_SECRET|CREDENTIAL_ENCRYPTION_KEYS|TERMINAL_OAUTH_TOKEN)/.test(
          source,
        ),
      )
      .map(({ path }) => path.replaceAll('\\', '/'));

    expect(violations).toEqual([]);
  });

  it('keeps Clover OAuth start redirects on the configured public origin instead of the container origin', () => {
    const startRoute = scanTypeScript(
      resolve(PAYMENTS_ROOT, '../../../web/src/app/clover/oauth/start'),
      { productionOnly: true },
    ).find(({ path }) => path.endsWith('route.ts'));

    expect(startRoute?.source).toContain('cloverOAuthResultUrl');
    expect(startRoute?.source).toContain(
      "response.headers.set('Cache-Control', 'no-store')",
    );
    expect(startRoute?.source).not.toContain('new URL(location, request.url)');
    expect(startRoute?.source).not.toContain('failureRedirect(request)');
  });

  it('keeps the Clover OAuth callback exchange server-side before returning the browser to the result page', () => {
    const callbackRoute = scanTypeScript(
      resolve(PAYMENTS_ROOT, '../../../web/src/app/clover/oauth/callback'),
      { productionOnly: true },
    ).find(({ path }) => path.endsWith('route.ts'));

    expect(callbackRoute?.source).toContain('process.env.API_UPSTREAM');
    expect(callbackRoute?.source).toContain("redirect: 'manual'");
    expect(callbackRoute?.source).toContain('await fetch(target');
    expect(callbackRoute?.source).toContain(
      "result.pathname !== '/clover/oauth/result'",
    );
    expect(callbackRoute?.source).toContain('cloverOAuthPublicOrigin()');
    expect(callbackRoute?.source).not.toContain('request.nextUrl.origin');
    expect(callbackRoute?.source).not.toContain(
      'new URL(location, request.url)',
    );
    expect(callbackRoute?.source).toContain(
      "response.headers.set('Referrer-Policy', 'no-referrer')",
    );
    expect(callbackRoute?.source).toContain(
      "response.headers.set('Cache-Control', 'no-store')",
    );
    expect(callbackRoute?.source).not.toContain(
      'NextResponse.redirect(target, 302)',
    );
  });

  it('keeps Clover OAuth protocol routes outside locale redirects', () => {
    const middleware = scanTypeScript(
      resolve(PAYMENTS_ROOT, '../../../web/src'),
      { productionOnly: true },
    ).find(({ path }) => path.endsWith('middleware.ts'));

    expect(middleware?.source).toContain(
      'pathname.startsWith("/clover/oauth/")',
    );
  });

  it('prevents unified-payment orchestration from importing Clover infrastructure', () => {
    const orchestrationFiles = scanTypeScript(
      resolve(SOURCE_ROOT, 'orchestration'),
      { productionOnly: true },
    );

    expect(
      importViolations(orchestrationFiles, SOURCE_ROOT, (specifier) =>
        /payments\/infrastructure\/clover(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('keeps payment preparation on Benefits reservation public contracts instead of Loyalty/Membership internals', () => {
    const protectedFiles = scanTypeScript(
      resolve(SOURCE_ROOT, 'orchestration'),
      {
        productionOnly: true,
      },
    ).filter(
      ({ path }) =>
        path.endsWith('payment-checkout-attempt.service.ts') ||
        path.endsWith('pos-card-payment-orchestration.module.ts'),
    );

    expect(
      importViolations(protectedFiles, SOURCE_ROOT, (specifier) =>
        /(?:^|\/)(?:loyalty|membership)(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);

    const imports = protectedFiles.flatMap(({ source }) =>
      importSpecifiers(source),
    );
    expect(imports).toContain('../benefits/public-api');
    expect(imports).toContain(
      '../benefits/public-api/payment-benefits-reservation.module',
    );
  });

  it('prevents Orders and POS from importing Clover or payment provider infrastructure', () => {
    const consumers = [
      ...scanTypeScript(resolve(SOURCE_ROOT, 'orders'), {
        productionOnly: true,
      }),
      ...scanTypeScript(resolve(SOURCE_ROOT, 'pos'), {
        productionOnly: true,
      }),
    ];

    expect(
      importViolations(
        consumers,
        SOURCE_ROOT,
        (specifier) =>
          /(?:^|\/)clover(?:\/|$)/.test(specifier) ||
          /payments\/infrastructure(?:\/|$)/.test(specifier),
      ),
    ).toEqual([]);
  });

  it('keeps POS Terminal first-print ownership on the Orders durable lifecycle boundary', () => {
    const orchestration = scanTypeScript(
      resolve(SOURCE_ROOT, 'orchestration'),
      {
        productionOnly: true,
      },
    ).find(({ path }) =>
      path.endsWith('pos-card-payment-orchestration.service.ts'),
    );

    expect(orchestration).toBeDefined();
    expect(orchestration?.source).toContain("from '../orders/public-api'");
    expect(orchestration?.source).toContain('POS_ORDER_OPERATIONS');
    expect(orchestration?.source).toContain('activateImmediatePreparation');
    expect(orchestration?.source).not.toContain('PrintPosPayloadService');
    expect(orchestration?.source).not.toContain('sendPrintJob');
    expect(orchestration?.source).not.toContain('PAYMENT_CHECKOUT:');
  });

  it('keeps POS payment realtime delivery behind the POS public capability', () => {
    const orchestrationFiles = scanTypeScript(
      resolve(SOURCE_ROOT, 'orchestration'),
      { productionOnly: true },
    ).filter(({ path }) =>
      [
        'pos-card-payment-orchestration.service.ts',
        'payment-reverse-sync-orchestration.service.ts',
      ].some((name) => path.endsWith(name)),
    );
    const posFiles = scanTypeScript(resolve(SOURCE_ROOT, 'pos'), {
      productionOnly: true,
    });
    const publicApi = posFiles.find(({ path }) =>
      path.endsWith('public-api.ts'),
    );
    const deviceModule = posFiles.find(({ path }) =>
      path.endsWith('pos-device.module.ts'),
    );
    const realtimeContract = posFiles.find(({ path }) =>
      path.endsWith('pos-payment-realtime.contract.ts'),
    );

    expect(orchestrationFiles).toHaveLength(2);
    for (const orchestration of orchestrationFiles) {
      expect(orchestration.source).toContain("from '../pos/public-api'");
      expect(orchestration.source).toContain('POS_PAYMENT_REALTIME');
      expect(orchestration.source).not.toContain("from '../pos/pos.gateway'");
    }
    expect(publicApi?.source).toContain('POS_PAYMENT_REALTIME');
    expect(publicApi?.source).toContain('PosPaymentRealtimePort');
    expect(deviceModule?.source).toContain('provide: POS_PAYMENT_REALTIME');
    expect(deviceModule?.source).toContain('useExisting: PosGateway');
    expect(realtimeContract?.source).not.toMatch(/from ['"]\.\.\/payments\//);
    expect(realtimeContract?.source).not.toMatch(/from ['"]\.\.\/clover\//);
  });

  it('keeps POS refund/reverse-sync Orders access on the public POS order operations boundary', () => {
    const orchestrationFiles = scanTypeScript(
      resolve(SOURCE_ROOT, 'orchestration'),
      { productionOnly: true },
    ).filter(({ path }) =>
      [
        'pos-card-refund-orchestration.service.ts',
        'payment-reverse-sync-orchestration.service.ts',
      ].some((name) => path.endsWith(name)),
    );

    expect(orchestrationFiles).toHaveLength(2);
    for (const orchestration of orchestrationFiles) {
      expect(orchestration.source).toContain("from '../orders/public-api'");
      expect(orchestration.source).toContain('POS_ORDER_OPERATIONS');
      expect(orchestration.source).not.toContain(
        "from '../orders/orders.service'",
      );
      expect(orchestration.source).not.toMatch(/from ['"]\.\.\/orders\/dto\//);
    }
  });

  it('exposes payment preparation through the Orders public capability without duplicating OrdersService', () => {
    const orderFiles = scanTypeScript(resolve(SOURCE_ROOT, 'orders'), {
      productionOnly: true,
    });
    const publicApi = orderFiles.find(({ path }) =>
      path.endsWith('public-api.ts'),
    );
    const module = orderFiles.find(({ path }) =>
      path.endsWith('orders.module.ts'),
    );

    expect(publicApi?.source).toContain('PAYMENT_ORDER_PREPARATION');
    expect(publicApi?.source).toContain('PaymentOrderPreparationPort');
    expect(module?.source).toContain('provide: PAYMENT_ORDER_PREPARATION');
    expect(module?.source).toContain('useExisting: OrdersService');
  });

  it('keeps persisted payment preparation on the V2 stable-identity public boundary', () => {
    const checkoutPreparation = scanTypeScript(
      resolve(SOURCE_ROOT, 'orchestration'),
      { productionOnly: true },
    ).find(({ path }) => path.endsWith('payment-checkout-attempt.service.ts'));

    expect(checkoutPreparation).toBeDefined();
    expect(checkoutPreparation?.source).toContain(
      "from '../orders/public-api'",
    );
    expect(checkoutPreparation?.source).toContain('PAYMENT_ORDER_PREPARATION');
    expect(checkoutPreparation?.source).not.toContain(
      "from '../orders/orders.service'",
    );
    expect(checkoutPreparation?.source).toContain(
      'storeStableId: snapshot.storeStableId',
    );
    expect(checkoutPreparation?.source).toContain('draft.version !== 2');
    expect(checkoutPreparation?.source).toContain(
      'delete stableOrder.selectedUserCouponId',
    );
    expect(checkoutPreparation?.source).toContain(
      'delete stableOrder.checkoutIntentId',
    );
    expect(checkoutPreparation?.source).not.toContain(
      'userId: snapshot.userId',
    );
    expect(checkoutPreparation?.source).not.toContain(
      'selectedUserCouponId: snapshot.order.selectedUserCouponId',
    );
  });

  it('keeps Payments + Orders coordination inside the explicit unified-payment orchestration layer', () => {
    const composers = scanTypeScript(SOURCE_ROOT, { productionOnly: true })
      // AppModule is the repository composition root: importing both modules
      // wires contexts there but does not coordinate Payments + Orders behavior.
      .filter(({ path }) => path !== resolve(SOURCE_ROOT, 'app.module.ts'))
      .filter((file) => {
        const imports = importSpecifiers(file.source);
        const importsPayments = imports.some((specifier) =>
          /(?:^|\/)payments(?:\/|$)/.test(specifier),
        );
        const importsOrders = imports.some((specifier) =>
          /(?:^|\/)orders(?:\/|$)/.test(specifier),
        );
        return importsPayments && importsOrders;
      })
      .map(({ path }) =>
        path.slice(SOURCE_ROOT.length + 1).replaceAll('\\', '/'),
      )
      .sort();

    expect(composers).toEqual([
      'orchestration/payment-checkout-attempt.service.ts',
      'orchestration/payment-reverse-sync-orchestration.service.ts',
      'orchestration/pos-card-payment-orchestration.module.ts',
      'orchestration/pos-card-payment-orchestration.service.ts',
      'orchestration/pos-card-refund-orchestration.service.ts',
    ]);
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
