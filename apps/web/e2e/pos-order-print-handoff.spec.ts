import { expect, test, type Page } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type PosBoardOrder = {
  orderStableId?: unknown;
  channel?: unknown;
  status?: unknown;
  fulfillmentTiming?: unknown;
};

type PosOrder = {
  orderStableId?: unknown;
  channel?: unknown;
  status?: unknown;
};

type PrintJobStatus = {
  jobId?: unknown;
  orderStableId?: unknown;
  storeId?: unknown;
  kind?: unknown;
  customerRequested?: unknown;
  kitchenRequested?: unknown;
  customerStatus?: unknown;
  kitchenStatus?: unknown;
  customerFailureReason?: unknown;
  kitchenFailureReason?: unknown;
};

const STAFF_PASSWORD_ENV = "SANQ_E2E_STAFF_PASSWORD";
const D2_ENROLLMENT_CODE_ENV = "SANQ_E2E_D2_POS_ENROLLMENT_CODE";
const D2_ORDER_STABLE_ID = "c000000000000000000000015";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for POS durable handoff browser E2E`);
  }
  return value;
}

async function fetchEnvelope<T>(
  page: Page,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; payload: ApiEnvelope<T> }> {
  return page.evaluate(
    async ({ requestPath, requestInit }) => {
      const response = await fetch(requestPath, {
        cache: "no-store",
        credentials: "include",
        ...requestInit,
      });
      return {
        status: response.status,
        payload: (await response.json()) as ApiEnvelope<T>,
      };
    },
    { requestPath: path, requestInit: init },
  );
}

async function establishD2PosSession(page: Page): Promise<void> {
  await page.goto("/en/staff/login?next=%2Fen%2Fstore%2Fpos", {
    waitUntil: "domcontentloaded",
  });

  const claim = await fetchEnvelope<{ success?: boolean }>(
    page,
    "/api/v1/pos/devices/claim",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollmentCode: requiredEnv(D2_ENROLLMENT_CODE_ENV),
        meta: {
          userAgent: "A5-D2-Playwright",
          platform: "browser-e2e",
          language: "en-CA",
          screen: { width: 1366, height: 768, devicePixelRatio: 1 },
        },
      }),
    },
  );
  expect(claim.status).toBe(201);
  expect(claim.payload.details?.success).toBe(true);

  const login = await fetchEnvelope<{ role?: unknown }>(
    page,
    "/api/v1/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "e2e-staff@example.invalid",
        password: requiredEnv(STAFF_PASSWORD_ENV),
        purpose: "pos",
      }),
    },
  );
  expect(login.status).toBe(201);
  expect(login.payload.details?.role).toBe("STAFF");
}

async function waitForDurablePrintJob(page: Page): Promise<PrintJobStatus> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const result = await fetchEnvelope<PrintJobStatus | null>(
      page,
      `/api/v1/pos/orders/${D2_ORDER_STABLE_ID}/print-status`,
    );
    expect(result.status).toBe(200);

    const job = result.payload.details;
    if (job && job.kind === "AUTO") {
      return job;
    }
    await page.waitForTimeout(100);
  }

  throw new Error("AUTO PosPrintJob was not materialized within the E2E deadline");
}

test.describe("A5-D2 Web order acceptance and durable PrintJob handoff", () => {
  // Device enrollment is one-time and the controlled order is state-mutating.
  test.describe.configure({ retries: 0 });

  test("a paid Web order is visible to POS, accepted through the canonical transition, and materializes an AUTO PrintJob", async ({
    page,
  }) => {
    await establishD2PosSession(page);

    const board = await fetchEnvelope<PosBoardOrder[]>(
      page,
      "/api/v1/pos/orders/board?status=paid&channel=web&sinceMinutes=180&limit=80",
    );
    expect(board.status).toBe(200);
    expect(board.payload.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderStableId: D2_ORDER_STABLE_ID,
          channel: "web",
          status: "paid",
          fulfillmentTiming: "IMMEDIATE",
        }),
      ]),
    );

    const accepted = await fetchEnvelope<PosOrder>(
      page,
      `/api/v1/pos/orders/${D2_ORDER_STABLE_ID}/advance`,
      { method: "POST" },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.payload.details).toMatchObject({
      orderStableId: D2_ORDER_STABLE_ID,
      channel: "web",
      status: "making",
    });

    const job = await waitForDurablePrintJob(page);
    expect(job).toMatchObject({
      orderStableId: D2_ORDER_STABLE_ID,
      storeId: "e2e_store",
      kind: "AUTO",
      customerRequested: true,
      kitchenRequested: true,
      customerStatus: "PENDING",
      kitchenStatus: "PENDING",
      customerFailureReason: "CLIENT_OFFLINE",
      kitchenFailureReason: "CLIENT_OFFLINE",
    });
    expect(typeof job.jobId).toBe("string");

    const current = await fetchEnvelope<PosOrder>(
      page,
      `/api/v1/pos/orders/${D2_ORDER_STABLE_ID}`,
    );
    expect(current.status).toBe(200);
    expect(current.payload.details).toMatchObject({
      orderStableId: D2_ORDER_STABLE_ID,
      channel: "web",
      status: "making",
    });
  });
});
