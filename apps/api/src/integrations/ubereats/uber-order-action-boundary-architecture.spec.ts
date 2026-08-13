import { join, relative, resolve, sep } from 'node:path';

import {
  importSpecifiers,
  scanTypeScript,
} from './test/architecture-test.utils';

const ROOT = resolve(__dirname);
const ORDERS = join(ROOT, 'application/orders');
const PORTS = join(ORDERS, 'uber-order.ports.ts');
const QUERY_PORTS = join(ORDERS, 'uber-order-query.ports.ts');
const WIRING = join(ROOT, 'infrastructure/nest/orders.wiring.ts');
const ACTION_ADAPTER = join(
  ROOT,
  'infrastructure/uber-api/uber-order-action.gateway.ts',
);

const production = scanTypeScript(ROOT, { productionOnly: true });
const applicationOrders = production.filter(({ path }) =>
  path.startsWith(`${ORDERS}${sep}`),
);
const sourceAt = (path: string) =>
  production.find((file) => file.path === path)?.source ?? '';
const locations = (pattern: RegExp) =>
  production.flatMap(({ path, source }) =>
    [...source.matchAll(pattern)].map(
      (match) => `${relative(ROOT, path)}:${match[1] ?? match[0]}`,
    ),
  );
const classSlice = (source: string, className: string): string => {
  const start = source.search(new RegExp(`\\bclass\\s+${className}\\b`));
  if (start < 0) return '';
  const next = source.slice(start + 1).search(/\nexport class\s+\w+/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
};

describe('Uber order action boundary architecture', () => {
  it('defines the unified action port and token exactly once, in the canonical port file', () => {
    expect(
      locations(
        /(?:export\s+)?(?:interface|class)\s+(UberOrderActionGatewayPort)\b/g,
      ),
    ).toEqual([
      'application/orders/uber-order.ports.ts:UberOrderActionGatewayPort',
    ]);
    expect(
      locations(
        /(?:export\s+)?(?:const|let|var)\s+(UBER_ORDER_ACTION_GATEWAY)\b/g,
      ),
    ).toEqual([
      'application/orders/uber-order.ports.ts:UBER_ORDER_ACTION_GATEWAY',
    ]);
    expect(sourceAt(PORTS)).toContain('interface UberOrderActionGatewayPort');
  });

  it('has one infrastructure implementation and one Nest token binding', () => {
    expect(
      locations(
        /class\s+(\w+)\s+implements\s+[^\n{]*\bUberOrderActionGatewayPort\b/g,
      ),
    ).toEqual([
      'infrastructure/uber-api/uber-order-action.gateway.ts:UberOrderActionGatewayAdapter',
    ]);
    expect(sourceAt(ACTION_ADAPTER)).toMatch(
      /UberOrderActionGatewayAdapter\s+implements\s+UberOrderActionGatewayPort/,
    );
    expect([
      ...sourceAt(WIRING).matchAll(/provide:\s*UBER_ORDER_ACTION_GATEWAY\b/g),
    ]).toHaveLength(1);
    expect(sourceAt(WIRING)).toMatch(
      /provide:\s*UBER_ORDER_ACTION_GATEWAY,\s*useExisting:\s*UberOrderActionGatewayAdapter/s,
    );
  });

  it('does not let the resource gateway become an application action port', () => {
    const resourceGateway = sourceAt(
      join(ROOT, 'infrastructure/uber-api/uber-resource.gateways.ts'),
    );
    expect(resourceGateway).not.toMatch(
      /class\s+UberOrderGateway[^\n{]*implements[^\n{]*UberOrderActionGatewayPort/,
    );
  });

  it('keeps worker adapters away from action transports and storage ports', () => {
    const workers = production.filter(({ path }) =>
      path.startsWith(`${join(ROOT, 'infrastructure/workers')}${sep}`),
    );
    const violations = workers.flatMap((file) =>
      importSpecifiers(file.source)
        .filter((specifier) =>
          /uber-order\.ports|uber-order-action\.gateway|uber-resource\.gateways/.test(
            specifier,
          ),
        )
        .map((specifier) => `${relative(ROOT, file.path)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  it('rejects legacy outcomes, HTTP-shaped ports and any second action channel', () => {
    const violations = applicationOrders.flatMap(({ path, source }) => {
      const found: string[] = [];
      if (
        /\bUberGatewayOutcome\b|\bUberOrderOutbox\w*\b|\bUBER_ORDER_OUTBOX\b|\bACTION_COMMAND_GATEWAY\b/.test(
          source,
        )
      )
        found.push('legacy action symbol');
      if (/\bexecuteAction\s*\(/.test(source)) found.push('executeAction port');
      if (/\b(?:httpStatus|statusCode|retryAfter)\b/.test(source))
        found.push('raw HTTP result');
      for (const match of source.matchAll(
        /interface\s+(\w+)\s*{([\s\S]*?)\n}/g,
      )) {
        const [name, body] = [match[1], match[2]];
        const actionMethods = [
          'accept',
          'deny',
          'cancel',
          'readyForPickup',
        ].filter((method) => new RegExp(`\\b${method}\\s*\\(`).test(body));
        if (name !== 'UberOrderActionGatewayPort' && actionMethods.length >= 2)
          found.push(`second action port ${name}`);
        if (
          name !== 'UberOrderActionRepositoryPort' &&
          /\b(?:enqueue|claim)\s*\(/.test(body) &&
          /action|command|queue|outbox/i.test(name)
        )
          found.push(`second action queue ${name}`);
      }
      return found.map((rule) => `${relative(ROOT, path)} -> ${rule}`);
    });
    expect(violations).toEqual([]);
  });

  it('routes application order-detail queries only through the query port', () => {
    expect(sourceAt(QUERY_PORTS)).toMatch(/interface UberOrderDetailQueryPort/);
    const violations = applicationOrders.flatMap((file) =>
      importSpecifiers(file.source)
        .filter((specifier) =>
          /infrastructure\/uber-api|uber-resource\.gateways|uber-order-detail\.gateway/.test(
            specifier,
          ),
        )
        .map((specifier) => `${relative(ROOT, file.path)} -> ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  it('enforces service-only action call relationships', () => {
    const useCases = sourceAt(join(ORDERS, 'uber-order.use-cases.ts'));
    const request = classSlice(useCases, 'RequestUberOrderActionUseCase');
    const importer = classSlice(useCases, 'ImportUberOrderUseCase');
    const worker = classSlice(useCases, 'ExecuteUberOrderActionWorker');
    const sync = sourceAt(join(ORDERS, 'sync-uber-order-status.use-case.ts'));

    expect(request).toMatch(
      /constructor\(private readonly actions: UberOrderActionService\)/,
    );
    expect(request).not.toMatch(/Action(?:Repository|Gateway)(?:Port)?/);
    expect(importer).toMatch(
      /private readonly actions: UberOrderActionService/,
    );
    expect(importer).not.toMatch(/Action(?:Repository|Gateway)(?:Port)?/);
    expect(sync).toMatch(/private readonly actions: UberOrderActionService/);
    expect(sync).not.toMatch(/Action(?:Repository|Gateway)(?:Port)?/);
    expect(worker).toMatch(/UberOrderActionRepositoryPort/);
    expect(worker).toMatch(/UberOrderActionService/);
    expect(worker).not.toMatch(
      /UberOrderActionGatewayPort|UBER_ORDER_ACTION_GATEWAY/,
    );
  });

  it('makes the action service the sole application consumer of both action ports', () => {
    const consumers = applicationOrders
      .filter(({ path }) => path !== PORTS)
      .filter(
        ({ source }) =>
          /UberOrderActionRepositoryPort/.test(source) &&
          /UberOrderActionGatewayPort/.test(source),
      )
      .map(({ path }) => relative(ROOT, path));
    expect(consumers).toEqual([
      'application/orders/uber-order-action.service.ts',
    ]);
  });
});
