import { createServer, type Server } from 'node:http';
import { NestFactory } from '@nestjs/core';

import { UberWorkerHealthService } from './integrations/ubereats/ubereats.module';
import { UberEatsWorkerModule } from './ubereats-worker.module';

export function assertUberWorkerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.UBER_EATS_WORKER_ENABLED !== 'true') {
    throw new Error(
      'Uber worker 拒绝启动：必须显式设置 UBER_EATS_WORKER_ENABLED=true',
    );
  }
}

function createHealthServer(health: UberWorkerHealthService): Server {
  return createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end('Not Found');
      return;
    }
    const snapshot = health.snapshot();
    response.writeHead(snapshot.status === 'ok' ? 200 : 503, {
      'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(snapshot));
  });
}

async function bootstrap(): Promise<void> {
  assertUberWorkerEnabled();
  const context =
    await NestFactory.createApplicationContext(UberEatsWorkerModule);
  context.enableShutdownHooks();

  const port = Number(process.env.UBER_EATS_WORKER_HEALTH_PORT ?? 4001);
  const server = createHealthServer(context.get(UberWorkerHealthService));
  server.listen(port, '0.0.0.0', () => {
    console.log(`Uber Eats worker health listening on :${port}/health`);
  });

  const close = () => server.close();
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}

if (require.main === module) void bootstrap();
