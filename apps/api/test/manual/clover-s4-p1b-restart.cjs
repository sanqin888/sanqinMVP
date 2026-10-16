/*
 * C-2C7 P1-B: operator-only, real process-death + persisted PostgreSQL recovery.
 *
 * No live API termination, no Clover transport and no real payment requests.
 * Run after reviewed dev merge on the MacBook:
 *   cd apps/api
 *   NODE_ENV=development node --env-file=.env test/manual/clover-s4-p1b-restart.cjs --confirm-local-restaurant
 */
'use strict';

const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const PREFIX = 'clover-s4-p1b-';
const ORIGINAL_504 = 'CLOVER_TERMINAL_SALE_HTTP_504';
const CONSUMED = 'CLOVER_TERMINAL_SALE_HTTP_504_RESUME_CLAIMED';
const NOT_FOUND = 'CLOVER_PLATFORM_PAYMENT_NOT_FOUND';
const CONFIRM = '--confirm-local-restaurant';

function guardDatabaseTarget() {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('NODE_ENV must be development or test');
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL missing');
  let db;
  try {
    db = new URL(raw);
  } catch {
    throw new Error('Invalid DATABASE_URL');
  }
  if (
    !['postgresql:', 'postgres:'].includes(db.protocol) ||
    !['127.0.0.1', 'localhost'].includes(db.hostname) ||
    (db.port && db.port !== '5432') ||
    decodeURIComponent(db.pathname.slice(1)) !== 'restaurant'
  ) {
    throw new Error('Only the local MacBook restaurant PostgreSQL on 5432 is permitted');
  }
}

async function guardPostgresServer(prisma) {
  // A loopback SSH tunnel could otherwise target a Linux production database.
  const rows = await prisma.$queryRawUnsafe(
    'SELECT version() AS version, current_database() AS database',
  );
  if (
    rows.length !== 1 ||
    rows[0].database !== 'restaurant' ||
    !/darwin/i.test(rows[0].version)
  ) {
    throw new Error('Database must identify as macOS/Darwin PostgreSQL');
  }
}

function verifyScratchPayment(row, fixture, expectedCode) {
  if (
    !row ||
    row.id !== fixture.id ||
    row.attemptId !== fixture.attemptId ||
    row.idempotencyKey !== fixture.idempotencyKey ||
    row.externalPaymentId !== fixture.externalPaymentId ||
    !row.attemptId.startsWith(PREFIX) ||
    !row.idempotencyKey.startsWith(PREFIX) ||
    !row.externalPaymentId.startsWith('sq_' + PREFIX) ||
    row.provider !== 'CLOVER' ||
    row.source !== 'POS_TERMINAL' ||
    row.paymentMethod !== 'CARD' ||
    row.operation !== 'SALE' ||
    row.status !== 'RECONCILING' ||
    row.amountCents !== 1 ||
    row.currency !== 'CAD' ||
    row.resultCode !== expectedCode ||
    row.failureCode !== NOT_FOUND ||
    row.providerPaymentId !== null ||
    row.orderId !== null ||
    row.checkoutIntentId !== null
  ) {
    throw new Error('Fixture Payment identity or financial state changed');
  }
}

function verifyScratchFence(operation, fixture) {
  if (
    !operation ||
    operation.terminalId !== fixture.terminalId ||
    operation.storeStableId !== fixture.storeStableId ||
    operation.attemptId !== fixture.attemptId ||
    operation.paymentTransactionId !== fixture.id ||
    operation.externalPaymentId !== fixture.externalPaymentId ||
    !operation.terminalId.startsWith(PREFIX) ||
    operation.state !== 'SALE_IN_FLIGHT'
  ) {
    throw new Error('Fixture Terminal fence was lost or mutated');
  }
}

function loadPaymentCode() {
  require('ts-node/register/transpile-only');
  return {
    ...require('../../src/payments/application/create-payment-attempt.use-case.ts'),
    ...require('../../src/payments/infrastructure/prisma/prisma-payment-transaction.repository.ts'),
  };
}

function launchChild(role, fixture) {
  // Include IPC but never forward Clover OAuth / Compact environment variables.
  return fork(__filename, ['--child', role, JSON.stringify(fixture)], {
    execArgv: [],
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: {
      NODE_ENV: process.env.NODE_ENV,
      DATABASE_URL: process.env.DATABASE_URL,
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    },
  });
}

function receive(child, type, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let timer;
    function cleanup() {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    }
    function onMessage(message) {
      if (message?.type === 'error') {
        cleanup();
        reject(new Error('Child failed: ' + String(message.code || 'UNKNOWN')));
      } else if (message?.type === type) {
        cleanup();
        resolve(message);
      }
    }
    function onError() {
      cleanup();
      reject(new Error('Child process could not start'));
    }
    function onExit(code, signal) {
      cleanup();
      reject(new Error('Child exited before ' + type + ': ' + code + '/' + signal));
    }
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for child: ' + type));
    }, timeoutMs);
    child.on('message', onMessage);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

async function killChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error('Claimant exited before SIGKILL test');
  }
  const exited = new Promise((resolve, reject) => {
    let timer;
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
    timer = setTimeout(() => reject(new Error('SIGKILL did not terminate claimant')), 10000);
  });
  if (!child.kill('SIGKILL')) throw new Error('SIGKILL could not be sent');
  const result = await exited;
  if (result.signal !== 'SIGKILL') {
    throw new Error('Expected claimant death by SIGKILL');
  }
}

async function stopOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    let timer;
    function cleanup() {
      clearTimeout(timer);
      child.off('exit', onExit);
    }
    function onExit() {
      cleanup();
      resolve();
    }
    child.on('exit', onExit);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Owned worker could not be stopped; investigate its PID'));
    }, 10000);
    if (!child.kill('SIGKILL')) {
      cleanup();
      reject(new Error('Could not SIGKILL owned worker; fixture was not deleted'));
    }
  });
}

async function childMain(role, fixture) {
  guardDatabaseTarget();
  if (
    typeof process.send !== 'function' ||
    !fixture ||
    typeof fixture.id !== 'string' ||
    typeof fixture.attemptId !== 'string' ||
    !fixture.attemptId.startsWith(PREFIX)
  ) {
    throw new Error('P1-B child may run only with a scoped parent IPC fixture');
  }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await guardPostgresServer(prisma);
    const {
      PrismaPaymentTransactionRepository,
      PrismaPaymentTerminalOperationRepository,
      TerminalPaymentService,
      CreatePaymentAttemptUseCase,
    } = loadPaymentCode();
    const repository = new PrismaPaymentTransactionRepository(prisma);
    const operations = new PrismaPaymentTerminalOperationRepository(prisma);
    const initial = (await repository.findById(fixture.id))?.toSnapshot();
    verifyScratchPayment(initial, fixture, role === 'claim' ? ORIGINAL_504 : CONSUMED);
    const fence = await operations.findByAttemptId(fixture.attemptId);
    verifyScratchFence(fence, fixture);

    const backend = await prisma.$queryRawUnsafe('SELECT pg_backend_pid() AS pid');
    if (role === 'claim') {
      const result = await repository.claimUncertainResultCode(
        fixture.id, ORIGINAL_504, CONSUMED, NOT_FOUND,
      );
      if (!result.updated) throw new Error('Original 504 claim was not acquired');
      verifyScratchPayment(result.transaction.toSnapshot(), fixture, CONSUMED);
      // Commit, load and notify before an intentional SIGKILL. No Clover command exists.
      const persisted = (await repository.findById(fixture.id))?.toSnapshot();
      verifyScratchPayment(persisted, fixture, CONSUMED);
      process.send({ type: 'claimed', backendPid: backend[0].pid });
      // Keep only this disposable claimant alive until the parent kills it.
      await new Promise(() => {
        setInterval(() => {}, 60_000);
      });
    } else if (role === 'recover') {
      let saleCalls = 0;
      let canonicalReads = 0;
      let deviceCalls = 0;
      const forbiddenTerminalProvider = new Proxy({}, {
        get(_target, key) {
          deviceCalls += 1;
          throw new Error('Unexpected Compact device call: ' + String(key));
        },
      });
      const fakePlatform = {
        startPayment: async () => {
          saleCalls += 1;
          throw new Error('Unexpected provider Sale');
        },
        getPaymentStatus: async (input) => {
          canonicalReads += 1;
          if (
            input.paymentId !== fixture.id ||
            input.attemptId !== fixture.attemptId ||
            input.externalPaymentId !== fixture.externalPaymentId ||
            input.idempotencyKey !== fixture.idempotencyKey
          ) {
            throw new Error('Canonical mock received wrong original identity');
          }
          return {
            status: 'UNKNOWN',
            evidence: 'CANONICAL',
            failureCode: NOT_FOUND,
          };
        },
      };
      const service = new TerminalPaymentService(
        new CreatePaymentAttemptUseCase(repository),
        repository,
        fakePlatform,
        forbiddenTerminalProvider,
        operations,
      );
      if (service.canResumeOriginal504Sale(await repository.findById(fixture.id))) {
        throw new Error('Consumed original Sale unexpectedly resumable');
      }
      for (let i = 0; i < 2; i += 1) {
        const noRetry = await service.resumeOriginal504Sale(fixture.id);
        verifyScratchPayment(noRetry.toSnapshot(), fixture, CONSUMED);
      }
      if (saleCalls !== 0 || canonicalReads !== 0 || deviceCalls !== 0) {
        throw new Error('Replay touched a provider or device after the consumed claim');
      }
      const observed = await service.reconcile(fixture.id);
      verifyScratchPayment(observed.toSnapshot(), fixture, CONSUMED);
      if (canonicalReads !== 1) throw new Error('Mock canonical read missing');
      if (saleCalls !== 0 || deviceCalls !== 0) {
        throw new Error('A provider Sale or Compact operation was attempted');
      }
      const thirdClaim = await repository.claimUncertainResultCode(
        fixture.id, ORIGINAL_504, CONSUMED, NOT_FOUND,
      );
      if (thirdClaim.updated) throw new Error('Consumed resume claim was re-armed');
      verifyScratchPayment(thirdClaim.transaction.toSnapshot(), fixture, CONSUMED);
      verifyScratchFence(await operations.findByAttemptId(fixture.attemptId), fixture);
      process.send({
        type: 'recovered',
        backendPid: backend[0].pid,
        secondClaim: thirdClaim.updated,
        saleCalls,
        deviceCalls,
        canonicalReads,
      });
    } else {
      throw new Error('Unknown P1-B worker role');
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function parentMain() {
  if (process.argv[2] !== CONFIRM) {
    throw new Error('Explicit ' + CONFIRM + ' required');
  }
  guardDatabaseTarget();
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const fixture = {
    id: randomUUID(),
    attemptId: PREFIX + suffix,
    idempotencyKey: PREFIX + randomUUID(),
    externalPaymentId: 'sq_' + PREFIX + randomUUID(),
    terminalId: PREFIX + 'terminal-' + randomUUID(),
    storeStableId: PREFIX + 'store-' + randomUUID(),
  };
  const children = [];
  let paymentCreated = false;
  let fenceCreated = false;
  let passed = false;
  try {
    await prisma.$connect();
    await guardPostgresServer(prisma);
    await prisma.paymentTransaction.create({
      data: {
        id: fixture.id,
        attemptId: fixture.attemptId,
        idempotencyKey: fixture.idempotencyKey,
        externalPaymentId: fixture.externalPaymentId,
        provider: 'CLOVER',
        source: 'POS_TERMINAL',
        paymentMethod: 'CARD',
        operation: 'SALE',
        amountCents: 1,
        currency: 'CAD',
        status: 'RECONCILING',
        resultCode: ORIGINAL_504,
        failureCode: NOT_FOUND,
      },
    });
    paymentCreated = true;
    await prisma.paymentTerminalOperation.create({
      data: {
        terminalId: fixture.terminalId,
        storeStableId: fixture.storeStableId,
        attemptId: fixture.attemptId,
        paymentTransactionId: fixture.id,
        externalPaymentId: fixture.externalPaymentId,
        state: 'SALE_IN_FLIGHT',
      },
    });
    fenceCreated = true;

    const claimant = launchChild('claim', fixture);
    children.push(claimant);
    const claimed = await receive(claimant, 'claimed');
    verifyScratchPayment(
      await prisma.paymentTransaction.findUnique({ where: { id: fixture.id } }),
      fixture,
      CONSUMED,
    );
    await killChild(claimant);

    // The second process exists only after the first was confirmed SIGKILLed.
    const restarted = launchChild('recover', fixture);
    children.push(restarted);
    const recovered = await receive(restarted, 'recovered');
    if (
      claimed.backendPid === recovered.backendPid ||
      recovered.secondClaim !== false ||
      recovered.saleCalls !== 0 ||
      recovered.deviceCalls !== 0 ||
      recovered.canonicalReads !== 1
    ) {
      throw new Error('New worker identity / no-replay assertions failed');
    }
    verifyScratchPayment(
      await prisma.paymentTransaction.findUnique({ where: { id: fixture.id } }),
      fixture,
      CONSUMED,
    );
    const finalFence = await prisma.paymentTerminalOperation.findUnique({
      where: { terminalId: fixture.terminalId },
    });
    verifyScratchFence(finalFence, fixture);
    const paymentCount = await prisma.paymentTransaction.count({
      where: { externalPaymentId: fixture.externalPaymentId },
    });
    const checkoutCount = await prisma.paymentCheckoutAttempt.count({
      where: { attemptId: fixture.attemptId },
    });
    if (paymentCount !== 1 || checkoutCount !== 0) {
      throw new Error('Final Payment or Checkout row count mismatch');
    }
    passed = true;
  } finally {
    // Stop only our disposable children; refuse fixture deletion if one is alive.
    try {
      await Promise.all(children.map(stopOwnedChild));
      if (fenceCreated) {
        const removed = await prisma.paymentTerminalOperation.deleteMany({
          where: {
            terminalId: fixture.terminalId,
            attemptId: fixture.attemptId,
            paymentTransactionId: fixture.id,
          },
        });
        if (removed.count !== 1) throw new Error('Fixture fence cleanup mismatch');
      }
      if (paymentCreated) {
        const removed = await prisma.paymentTransaction.deleteMany({
          where: {
            id: fixture.id,
            attemptId: fixture.attemptId,
            externalPaymentId: fixture.externalPaymentId,
          },
        });
        if (removed.count !== 1) throw new Error('Fixture Payment cleanup mismatch');
      }
      if (paymentCreated) console.log('P1-B fixture cleanup: owned Payment and fence removed');
    } finally {
      await prisma.$disconnect();
    }
  }
  if (passed) {
    console.log('P1-B PASS: original claim durable after SIGKILL and fresh Node process');
    console.log('Claimant exit=SIGKILL, recovery child=distinct process');
    console.log('Original 504 claim consumed; repeat resume=0, repeat claim=0');
    console.log('Payment=RECONCILING / RESUME_CLAIMED; fence=SALE_IN_FLIGHT');
    console.log('Payment rows=1 checkouts=0; mocked canonical reads=1; Clover Sale calls=0');
    console.log('Fixture attemptId=' + fixture.attemptId);
    console.log('Real Compact, live API and S1-S3 Payment records were not touched');
  }
}

if (process.argv[2] === '--child') {
  if (typeof process.send !== 'function') {
    console.error('P1-B worker requires parent IPC');
    process.exitCode = 1;
  } else {
    let input = null;
    try {
      input = JSON.parse(process.argv[4]);
    } catch {
      process.send({ type: 'error', code: 'BAD_FIXTURE' });
      process.exitCode = 1;
    }
    if (input) {
      childMain(process.argv[3], input).catch(() => {
        process.send({ type: 'error', code: 'CHILD_FAILED' });
        process.exitCode = 1;
      });
    }
  }
} else {
  parentMain().catch((error) => {
    // Never print credentials, DB URLs or provider payloads.
    console.error('P1-B FAILED: ' + String(error.message || 'unexpected error'));
    process.exitCode = 1;
  });
}
