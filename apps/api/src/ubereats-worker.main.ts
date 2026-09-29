import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { NestFactory } from '@nestjs/core';

import {
  UBER_EATS_WORKER_RUNTIME_MODULE,
  UberWorkerHealthService,
  UberWorkerWakeService,
} from './integrations/ubereats/worker';

export function assertUberWorkerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.UBER_EATS_WORKER_ENABLED !== 'true') {
    throw new Error(
      'Uber worker 拒绝启动：必须显式设置 UBER_EATS_WORKER_ENABLED=true',
    );
  }
}

export async function handleWorkerHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
  health: UberWorkerHealthService,
  wake: UberWorkerWakeService,
): Promise<void> {
  if (request.method === 'POST' && request.url === '/wake/webhook-inbox') {
    wake.wake('webhookInbox');
    response.writeHead(204).end();
    return;
  }
  if (request.method === 'POST' && request.url === '/wake/order-action') {
    wake.wake('orderAction');
    response.writeHead(204).end();
    return;
  }
  if (request.url?.startsWith('/wake/')) {
    response.writeHead(request.method === 'POST' ? 404 : 405, {
      allow: 'POST',
    });
    response.end(
      request.method === 'POST' ? 'Not Found' : 'Method Not Allowed',
    );
    return;
  }
  if (request.url === '/live') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (request.url === '/ready') {
    const snapshot = await health.readiness();
    response.writeHead(snapshot.status === 'ok' ? 200 : 503, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(snapshot));
    return;
  }
  if (request.url === '/health') {
    const snapshot = await health.snapshot();
    response.writeHead(
      snapshot.status === 'ok' || snapshot.status === 'degraded' ? 200 : 503,
      {
        'content-type': 'application/json; charset=utf-8',
      },
    );
    response.end(JSON.stringify(snapshot));
    return;
  }
  response.writeHead(404).end('Not Found');
}

export function createHealthServer(
  health: UberWorkerHealthService,
  wake: UberWorkerWakeService,
): Server {
  return createServer((request, response) => {
    void handleWorkerHealthRequest(request, response, health, wake).catch(() => {
      if (response.headersSent) {
        response.end();
        return;
      }
      response.writeHead(503, {
        'content-type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ status: 'unhealthy' }));
    });
  });
}

async function bootstrap(): Promise<void> {
  assertUberWorkerEnabled();
  const context = await NestFactory.createApplicationContext(
    UBER_EATS_WORKER_RUNTIME_MODULE,
  );
  context.enableShutdownHooks();

  const port = Number(process.env.UBER_EATS_WORKER_HEALTH_PORT ?? 4001);
  const server = createHealthServer(
    context.get(UberWorkerHealthService),
    context.get(UberWorkerWakeService),
  );
  server.listen(port, '0.0.0.0', () => {
    console.log(
      `Uber Eats worker health listening on :${port} (/health, /ready, /live)`,
    );
  });

  const close = () => server.close();
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}

if (require.main === module) void bootstrap();
