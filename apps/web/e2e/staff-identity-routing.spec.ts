import { expect, test, type Page } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type AuthMePayload = {
  role?: unknown;
  userStableId?: unknown;
};

const STAFF_PASSWORD_ENV = "SANQ_E2E_STAFF_PASSWORD";

function staffPassword(): string {
  const value = process.env[STAFF_PASSWORD_ENV]?.trim();
  if (!value) {
    throw new Error(`${STAFF_PASSWORD_ENV} is required for Staff browser E2E`);
  }
  return value;
}

async function submitStaffLogin(page: Page, email: string): Promise<void> {
  await page.goto("/en/staff/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(staffPassword());
  await page.locator('form button[type="submit"]').click();
}

async function fetchAuthMe(page: Page): Promise<{
  status: number;
  payload: ApiEnvelope<AuthMePayload>;
}> {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "include",
    });
    return {
      status: response.status,
      payload: (await response.json()) as ApiEnvelope<AuthMePayload>,
    };
  });
}

function expectPosDeviceAdmissionBoundary(page: Page): void {
  const url = new URL(page.url());
  expect(url.pathname).toBe("/en/staff/login");
  expect(url.searchParams.get("next")).toBe("/en/store/pos");
  expect(url.searchParams.get("needDevice")).toBe("1");
}

test.describe("A5-B2-A Staff identity and surface routing", () => {
  test("ADMIN password login establishes the canonical Admin session", async ({
    page,
  }) => {
    await submitStaffLogin(page, "e2e-admin@example.invalid");
    await page.waitForURL(/\/en\/admin(?:$|[/?#])/);

    const me = await fetchAuthMe(page);
    expect(me.status).toBe(200);
    expect(me.payload.code).toBe("OK");
    expect(me.payload.details?.role).toBe("ADMIN");
    expect(typeof me.payload.details?.userStableId).toBe("string");
  });

  test(
    "ACCOUNTANT lands on Accounting, canonicalizes the root, and cannot enter Admin",
    async ({ page }) => {
      await submitStaffLogin(page, "e2e-accountant@example.invalid");
      await page.waitForURL(/\/en\/accounting\/dashboard(?:$|[/?#])/);

      await page.goto("/en/accounting");
      await page.waitForURL(/\/en\/accounting\/dashboard(?:$|[/?#])/);

      await page.goto("/en/admin");
      await page.waitForURL(/\/en\/accounting\/dashboard(?:$|[/?#])/);

      const me = await fetchAuthMe(page);
      expect(me.status).toBe(200);
      expect(me.payload.details?.role).toBe("ACCOUNTANT");
    },
  );

  test(
    "STAFF is routed to the existing POS device-admission boundary and denied Admin/Accounting",
    async ({ page }) => {
      await submitStaffLogin(page, "e2e-staff@example.invalid");
      await page.waitForURL(
        (url) =>
          url.pathname === "/en/staff/login" &&
          url.searchParams.get("needDevice") === "1",
      );
      expectPosDeviceAdmissionBoundary(page);

      const me = await fetchAuthMe(page);
      expect(me.status).toBe(200);
      expect(me.payload.details?.role).toBe("STAFF");

      await page.goto("/en/admin");
      await page.waitForURL(
        (url) =>
          url.pathname === "/en/staff/login" &&
          url.searchParams.get("needDevice") === "1",
      );
      expectPosDeviceAdmissionBoundary(page);

      await page.goto("/en/accounting");
      await page.waitForURL(
        (url) =>
          url.pathname === "/en/staff/login" &&
          url.searchParams.get("needDevice") === "1",
      );
      expectPosDeviceAdmissionBoundary(page);
    },
  );

  test(
    "Admin sign-out clears the cookie and revokes the server session",
    async ({ page, context }) => {
      await submitStaffLogin(page, "e2e-admin@example.invalid");
      await page.waitForURL(/\/en\/admin(?:$|[/?#])/);

      const before = await context.cookies();
      const sessionCookie = before.find(
        (cookie) => cookie.name === "session_id",
      );
      expect(sessionCookie).toBeDefined();

      await page.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL(
        (url) =>
          url.pathname === "/en/staff/login" &&
          url.searchParams.get("next") === "/en/admin",
      );

      const after = await context.cookies();
      expect(after.some((cookie) => cookie.name === "session_id")).toBe(false);

      if (!sessionCookie) {
        throw new Error("Expected session_id before logout");
      }
      await context.addCookies([
        {
          name: sessionCookie.name,
          value: sessionCookie.value,
          url: new URL(page.url()).origin,
        },
      ]);

      const me = await fetchAuthMe(page);
      expect(me.status).toBe(401);
    },
  );
});
