import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type AuthMePayload = {
  role?: unknown;
  userStableId?: unknown;
};

type PosStoreContextPayload = {
  storeStableId?: unknown;
  storeName?: unknown;
  timezone?: unknown;
};

const STAFF_PASSWORD_ENV = "SANQ_E2E_STAFF_PASSWORD";
const POS_ENROLLMENT_CODE_ENV = "SANQ_E2E_POS_ENROLLMENT_CODE";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for POS browser E2E`);
  }
  return value;
}

async function fetchEnvelope<T>(
  page: Page,
  path: string,
): Promise<{ status: number; payload: ApiEnvelope<T> }> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, {
      cache: "no-store",
      credentials: "include",
    });
    return {
      status: response.status,
      payload: (await response.json()) as ApiEnvelope<T>,
    };
  }, path);
}

function cookieNames(contextCookies: Awaited<ReturnType<BrowserContext["cookies"]>>) {
  return new Set(contextCookies.map((cookie) => cookie.name));
}

test.describe("A5-D1 POS device claim and Staff admission", () => {
  // Enrollment is intentionally one-time and claim rotates the device key.
  // Automatic retry would no longer begin from the same fixture state.
  test.describe.configure({ retries: 0 });

  test("claims the seeded POS device, establishes the Staff session, and admits the bound store", async ({
    page,
    context,
  }) => {
    await page.goto("/en/store/pos", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForURL(
      (url) =>
        url.pathname === "/en/staff/login" &&
        url.searchParams.get("next") === "/en/store/pos",
    );

    await expect(page.getByText("POS 设备绑定")).toBeVisible();
    await page
      .getByPlaceholder("ENROLL-XXXX")
      .fill(requiredEnv(POS_ENROLLMENT_CODE_ENV));

    const claimPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/pos/devices/claim") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "绑定", exact: true }).click();
    const claimResponse = await claimPromise;

    expect(claimResponse.status()).toBe(201);
    await expect(page.getByText("设备已绑定，可继续登录。")).toBeVisible();

    const claimedCookies = cookieNames(await context.cookies());
    expect(claimedCookies.has("posDeviceId")).toBe(true);
    expect(claimedCookies.has("posDeviceKey")).toBe(true);
    expect(claimedCookies.has("session_id")).toBe(false);

    await page
      .locator('input[type="email"]')
      .fill("e2e-staff@example.invalid");
    await page
      .locator('input[type="password"]')
      .fill(requiredEnv(STAFF_PASSWORD_ENV));

    const loginPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/login") &&
        response.request().method() === "POST",
    );
    await page.locator('form button[type="submit"]').click();
    const loginResponse = await loginPromise;

    expect(loginResponse.status()).toBe(201);
    await page.waitForURL((url) => url.pathname === "/en/store/pos");
    await expect(page.getByText("Store POS", { exact: true })).toBeVisible();

    const admittedCookies = cookieNames(await context.cookies());
    expect(admittedCookies.has("posDeviceId")).toBe(true);
    expect(admittedCookies.has("posDeviceKey")).toBe(true);
    expect(admittedCookies.has("session_id")).toBe(true);

    const me = await fetchEnvelope<AuthMePayload>(page, "/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.payload.details?.role).toBe("STAFF");
    expect(typeof me.payload.details?.userStableId).toBe("string");

    const store = await fetchEnvelope<PosStoreContextPayload>(
      page,
      "/api/v1/pos/store-context",
    );
    expect(store.status).toBe(200);
    expect(store.payload.details).toMatchObject({
      storeStableId: "e2e_store",
      storeName: "SanQ E2E Store",
      timezone: "America/Toronto",
    });
  });
});
