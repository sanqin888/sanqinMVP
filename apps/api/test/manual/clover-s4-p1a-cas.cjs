/*
 * C-2C7 P1-A: operator-only real PostgreSQL CAS contention check.
 * This is NOT an automatic Jest test and must never contact Clover.
 * Usage (MacBook only, after reviewed dev checkout):
 *   cd apps/api
 *   NODE_ENV=development node --env-file=.env test/manual/clover-s4-p1a-cas.cjs --confirm-local-restaurant
 */
'use strict';

const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const ORIGINAL_504 = 'CLOVER_TERMINAL_SALE_HTTP_504';
const CLAIMED_504 = 'CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED';
const NOT_FOUND = 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND';
const CONFIRMATION = '--confirm-local-restaurant';
const PREFIX = 'clover-s4-p1a-';

function requireLocalMacDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is missing; no database accessed');
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('NODE_ENV must explicitly be development or test');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    (url.port && url.port !== '5432') ||
    database !== 'restaurant'
  ) {
    throw new Error(
      'P1-A requires loopback PostgreSQL port 5432 and database restaurant',
    );
  }
  return database;
}

async function verifyMacServer(prisma) {
  // Loopback could otherwise point through an SSH tunnel at a remote server.
  const rows = await prisma.$queryRawUnsafe(
    'SELECT version() AS version, current_database() AS database',
  );
  if (
    rows.length !== 1 ||
    rows[0].database !== 'restaurant' ||
    !/darwin/i.test(rows[0].version)
  ) {
    throw new Error(
      'Database server must report a locally installed macOS PostgreSQL (Darwin); refusing to write',
    );
  }
}

function createWorker(paymentId) {
  const child = fork(__filename, ['--worker', paymentId], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    // Avoid inheriting parent's --env-file flag through process.execArgv.
    execArgv: [],
    // Forward DB/runtime essentials only; never inherit Clover or other secrets.
    env: {
      DATABASE_URL: process.env.DATABASE_URL,
      NODE_ENV: process.env.NODE_ENV,
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
  });
  const seen = new Map();
  const waiters = new Map();
  let workerError = null;

  function fail(message) {
    workerError = new Error(message);
    for (const rejectOrResolve of waiters.values()) {
      rejectOrResolve.reject(workerError);
    }
    waiters.clear();
  }

  child.on('message', (message) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'error') {
      fail('Worker failure: ' + String(message.code || 'UNKNOWN'));
      return;
    }
    seen.set(message.type, message);
    const waiter = waiters.get(message.type);
    if (waiter) {
      waiters.delete(message.type);
      waiter.resolve(message);
    }
  });
  child.on('error', () => fail('Worker process could not be started'));
  child.on('exit', (code) => {
    if (code !== 0 && !seen.has('result')) {
      fail('Worker exited before CAS result, exit=' + String(code));
    }
  });

  return {
    child,
    sendGo() {
      if (!child.connected) throw new Error('Worker IPC is disconnected');
      child.send({ type: 'go' });
    },
    async waitFor(type) {
      if (workerError) throw workerError;
      if (seen.has(type)) return seen.get(type);
      const pending = new Promise((resolve, reject) => {
        waiters.set(type, { resolve, reject });
      });
      let timer;
      try {
        return await Promise.race([
          pending,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Worker ' + type + ' timed out')),
              20000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    stop() {
      if (child.exitCode === null && !child.killed) child.kill();
    },
  };
}

async function runWorker(paymentId) {
  requireLocalMacDatabase();
  const { PrismaClient } = require('@prisma/client');
  // Load the actual Payments-owned Prisma repository, not a copied SQL query.
  require('ts-node/register/transpile-only');
  const { PrismaPaymentTransactionRepository } = require(
    '../../src/payments/infrastructure/prisma/prisma-payment-transaction.repository.ts'
  );
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await verifyMacServer(prisma);
    const repo = new PrismaPaymentTransactionRepository(prisma);
    const existing = await repo.findById(paymentId);
    if (
      !existing ||
      existing.status !== 'RECONCILING' ||
      existing.toSnapshot().resultCode !== ORIGINAL_504 ||
      existing.toSnapshot().failureCode !== NOT_FOUND
    ) {
      throw new Error('Missing or non-eligible isolated P1-A fixture');
    }
    const backends = await prisma.$queryRawUnsafe(
      'SELECT pg_backend_pid() AS pid',
    );
    process.send({ type: 'ready', backendPid: backends[0].pid });
    await new Promise((resolve) => {
      process.on('message', (message) => {
        if (message && message.type === 'go') resolve();
      });
    });
    process.send({ type: 'issued' });
    const claim = await repo.claimUncertainResultCode(
      paymentId,
      ORIGINAL_504,
      CLAIMED_504,
      NOT_FOUND,
    );
    const snapshot = claim.transaction.toSnapshot();
    process.send({
      type: 'result',
      claimed: claim.updated,
      status: snapshot.status,
      resultCode: snapshot.resultCode,
      providerPaymentId: snapshot.providerPaymentId,
    });
  } catch (error) {
    process.send({
      type: 'error',
      code: typeof error.code === 'string' ? error.code : 'WORKER_FAILURE',
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

async function runParent() {
  if (process.argv[2] !== CONFIRMATION) {
    throw new Error('Explicit ' + CONFIRMATION + ' argument required');
  }
  requireLocalMacDatabase();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const id = randomUUID();
  const attemptId = PREFIX + randomUUID();
  const externalPaymentId = 'sq_' + PREFIX + randomUUID();
  let fixtureCreated = false;
  const workers = [];
  let passed = false;

  try {
    await prisma.$connect();
    await verifyMacServer(prisma);

    const fixture = await prisma.paymentTransaction.create({
      data: {
        id,
        attemptId,
        idempotencyKey: PREFIX + randomUUID(),
        provider: 'CLOVER',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: 'SALE',
        // Synthetic one-cent fixture; no provider is ever invoked.
        amountCents: 1,
        currency: 'CAD',
        status: 'RECONCILING',
        externalPaymentId,
        providerPaymentId: null,
        resultCode: ORIGINAL_504,
        failureCode: NOT_FOUND,
      },
    });
    fixtureCreated = true;
    if (fixture.id !== id) throw new Error('Fixture identity mismatch');

    const first = createWorker(id);
    const second = createWorker(id);
    workers.push(first, second);
    const ready = await Promise.all(
      workers.map((worker) => worker.waitFor('ready')),
    );
    if (
      ready[0].backendPid === ready[1].backendPid ||
      !Number.isInteger(ready[0].backendPid) ||
      !Number.isInteger(ready[1].backendPid)
    ) {
      throw new Error('Workers did not establish distinct PostgreSQL sessions');
    }

    // Hold a real PostgreSQL row lock while both *independent processes*
    // issue the original repository updateMany. Only one can win the CAS.
    await prisma.$transaction(
      async (transaction) => {
        const locked = await transaction.$queryRawUnsafe(
          'SELECT id FROM "PaymentTransaction" WHERE id = $1::uuid FOR UPDATE',
          id,
        );
        if (locked.length !== 1) throw new Error('Fixture row lock failed');
        workers.forEach((worker) => worker.sendGo());
        await Promise.all(workers.map((worker) => worker.waitFor('issued')));
        await new Promise((resolve) => setTimeout(resolve, 250));
      },
      { timeout: 10000, maxWait: 5000 },
    );

    const results = await Promise.all(
      workers.map((worker) => worker.waitFor('result')),
    );
    const wins = results.filter((result) => result.claimed).length;
    if (
      wins !== 1 ||
      results.length !== 2 ||
      results.some(
        (result) =>
          result.status !== 'RECONCILING' ||
          result.resultCode !== CLAIMED_504 ||
          result.providerPaymentId !== null,
      )
    ) {
      throw new Error('Competing CAS outcomes or returned persisted truth are invalid');
    }

    const final = await prisma.paymentTransaction.findUnique({ where: { id } });
    const count = await prisma.paymentTransaction.count({
      where: { externalPaymentId },
    });
    const fenceCount = await prisma.paymentTerminalOperation.count({
      where: { attemptId },
    });
    const checkoutCount = await prisma.paymentCheckoutAttempt.count({
      where: { attemptId },
    });
    if (
      !final ||
      final.id !== id ||
      final.attemptId !== attemptId ||
      final.status !== 'RECONCILING' ||
      final.resultCode !== CLAIMED_504 ||
      final.failureCode !== NOT_FOUND ||
      final.providerPaymentId !== null ||
      count !== 1 ||
      fenceCount !== 0 ||
      checkoutCount !== 0
    ) {
      throw new Error('Post-CAS persisted identity/state assertions failed');
    }

    require('ts-node/register/transpile-only');
    const { PrismaPaymentTransactionRepository } = require(
      '../../src/payments/infrastructure/prisma/prisma-payment-transaction.repository.ts'
    );
    const repeat = await new PrismaPaymentTransactionRepository(
      prisma,
    ).claimUncertainResultCode(id, ORIGINAL_504, CLAIMED_504, NOT_FOUND);
    if (repeat.updated || repeat.transaction.toSnapshot().resultCode !== CLAIMED_504) {
      throw new Error('A third attempt unexpectedly reclaimed the payment');
    }
    passed = true;
  } finally {
    for (const worker of workers) worker.stop();
    try {
      if (fixtureCreated) {
        const deleted = await prisma.paymentTransaction.deleteMany({
          where: { id, attemptId, externalPaymentId },
        });
        if (deleted.count !== 1) {
          throw new Error(
            'P1-A cleanup did not remove exactly one fixture; investigate attemptId=' +
              attemptId,
          );
        }
        console.log('P1-A fixture cleanup: one matching test row deleted');
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  if (passed) {
    console.log('P1-A COMPLETE: real PostgreSQL CAS verified on two independent workers');
    console.log('CAS claim winners=1 losers=1 repeat_claim=0');
    console.log('Payment status=RECONCILING resultCode=' + CLAIMED_504);
    console.log('Payment rows=1 terminal fences=0 checkouts=0');
    console.log('Clover calls by P1-A harness=0 (no provider loaded)');
    console.log('Fixture attemptId=' + attemptId);
    console.log('P1-B real process restart remains a separate gate');
  }
}

if (process.argv[2] === '--worker') {
  if (typeof process.send !== 'function') {
    console.error('P1-A worker requires parent IPC');
    process.exitCode = 1;
  } else {
    runWorker(process.argv[3]).catch(() => {
      process.send({ type: 'error', code: 'UNEXPECTED_WORKER_FAILURE' });
      process.exitCode = 1;
    });
  }
} else {
  runParent().catch((error) => {
    // Do not print DATABASE_URL, credentials or Prisma connection internals.
    console.error('P1-A FAILED: ' + String(error.message || 'unexpected error'));
    process.exitCode = 1;
  });
}
