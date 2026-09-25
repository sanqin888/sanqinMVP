const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createPrintJobHandler,
  readCompletedPrintDeliveries,
  rememberCompletedPrintDelivery,
  registerCloudConnectionHandlers,
} = require("../printer-server");

function createFakeSocket() {
  const handlers = new Map();
  const emitted = [];
  return {
    id: "socket-test",
    handlers,
    emitted,
    on(event, handler) {
      handlers.set(event, handler);
    },
    emit(event, payload) {
      emitted.push({ event, payload });
    },
  };
}

function job(target = "customer") {
  return {
    jobId: "job-1",
    target,
    payload: {
      orderNumber: "A100",
      pickupCode: "Q7",
      snapshot: { items: [] },
      labelPlan: { labels: [] },
    },
  };
}

function ackEvents(socket) {
  return socket.emitted.filter(({ event }) => event === "PRINT_JOB_ACK");
}

test("successful print is remembered and ACKed with the stable wire envelope", async () => {
  const socket = createFakeSocket();
  const completed = new Map();
  const inFlight = new Map();
  let prints = 0;
  const handler = createPrintJobHandler({
    socket,
    completed,
    inFlight,
    printCustomer: async () => {
      prints += 1;
    },
    rememberCompleted: (jobId, target) => {
      completed.set(`${jobId}:${target}`, 123);
    },
  });

  await handler(job());

  assert.equal(prints, 1);
  assert.equal(inFlight.size, 0);
  assert.equal(completed.has("job-1:customer"), true);
  assert.deepEqual(ackEvents(socket), [
    {
      event: "PRINT_JOB_ACK",
      payload: {
        jobId: "job-1",
        target: "customer",
        success: true,
      },
    },
  ]);
});

test("print failure ACKs false and does not mark the delivery completed", async () => {
  const socket = createFakeSocket();
  const completed = new Map();
  const handler = createPrintJobHandler({
    socket,
    completed,
    inFlight: new Map(),
    printKitchen: async () => {
      throw new Error("printer offline");
    },
    rememberCompleted: () => {
      assert.fail("failed physical print must not be remembered");
    },
  });

  await handler(job("kitchen"));

  assert.equal(completed.size, 0);
  assert.deepEqual(ackEvents(socket), [
    {
      event: "PRINT_JOB_ACK",
      payload: {
        jobId: "job-1",
        target: "kitchen",
        success: false,
        error: "printer offline",
      },
    },
  ]);
});

test("completed duplicate ACKs success without printing again", async () => {
  const socket = createFakeSocket();
  const completed = new Map([["job-1:customer", 123]]);
  let prints = 0;
  const handler = createPrintJobHandler({
    socket,
    completed,
    inFlight: new Map(),
    printCustomer: async () => {
      prints += 1;
    },
  });

  await handler(job());

  assert.equal(prints, 0);
  assert.deepEqual(ackEvents(socket).map(({ payload }) => payload.success), [true]);
});

test("in-flight duplicate joins one physical print and both deliveries receive success ACK", async () => {
  const socket = createFakeSocket();
  const completed = new Map();
  const inFlight = new Map();
  let resolvePrint;
  const physicalPrint = new Promise((resolve) => {
    resolvePrint = resolve;
  });
  let prints = 0;

  const handler = createPrintJobHandler({
    socket,
    completed,
    inFlight,
    printCustomer: async () => {
      prints += 1;
      await physicalPrint;
    },
    rememberCompleted: (jobId, target) => {
      completed.set(`${jobId}:${target}`, 123);
    },
  });

  const first = handler(job());
  const second = handler(job());

  assert.equal(prints, 1);
  assert.equal(inFlight.has("job-1:customer"), true);

  resolvePrint();
  await Promise.all([first, second]);

  assert.equal(prints, 1);
  assert.equal(inFlight.size, 0);
  assert.equal(completed.has("job-1:customer"), true);
  assert.deepEqual(
    ackEvents(socket).map(({ payload }) => payload.success),
    [true, true],
  );
});

test("completed delivery survives state-file reload and suppresses reprint after restart", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sanq-printer-agent-"));
  const filePath = path.join(directory, "completed.json");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const beforeRestart = new Map();
  rememberCompletedPrintDelivery("job-1", "customer", {
    completed: beforeRestart,
    filePath,
    maxEntries: 10,
    now: 123,
  });

  const afterRestart = readCompletedPrintDeliveries(filePath);
  assert.equal(afterRestart.get("job-1:customer"), 123);

  const socket = createFakeSocket();
  let prints = 0;
  const handler = createPrintJobHandler({
    socket,
    completed: afterRestart,
    inFlight: new Map(),
    printCustomer: async () => {
      prints += 1;
    },
  });

  await handler(job());

  assert.equal(prints, 0);
  assert.deepEqual(ackEvents(socket).map(({ payload }) => payload.success), [true]);
});

test("persistence failure after physical print remains in-memory completed and ACKs success", async () => {
  const socket = createFakeSocket();
  const completed = new Map();
  let prints = 0;
  const handler = createPrintJobHandler({
    socket,
    completed,
    inFlight: new Map(),
    printCustomer: async () => {
      prints += 1;
    },
    rememberCompleted: () => {
      throw new Error("disk unavailable");
    },
  });

  await handler(job());
  await handler(job());

  assert.equal(prints, 1);
  assert.equal(completed.has("job-1:customer"), true);
  assert.deepEqual(
    ackEvents(socket).map(({ payload }) => payload.success),
    [true, true],
  );
});

test("every socket reconnect re-joins the configured store room", () => {
  const socket = createFakeSocket();
  registerCloudConnectionHandlers(socket, "store-a");

  const connect = socket.handlers.get("connect");
  assert.equal(typeof connect, "function");

  connect();
  connect();

  assert.deepEqual(
    socket.emitted.filter(({ event }) => event === "joinStore"),
    [
      { event: "joinStore", payload: { storeId: "store-a" } },
      { event: "joinStore", payload: { storeId: "store-a" } },
    ],
  );
});
