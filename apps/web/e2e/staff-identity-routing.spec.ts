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

function expectUnauthenticatedPosEntry(page: Page): void {
  const url = new URL(page.url());
  expect(url.pathname).toBe("/en/staff/login");
  expect(url.searchParams.get("next")).toBe("/en/store/pos");
  expect(url.searchParams.has("needDevice")).toBe(false);
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
    "STAFF POS admission fails closed until the browser has device credentials",
    async ({ page }) => {
      await page.goto("/en/store/pos");
      await page.waitForURL(
        (url) =>
          url.pathname === "/en/staff/login" &&
          url.searchParams.get("next") === "/en/store/pos",
      );
      expectUnauthenticatedPosEntry(page);
      await expect(page.getByText("POS 设备绑定")).toBeVisible();

      await page
        .locator('input[type="email"]')
        .fill("e2e-staff@example.invalid");
      await page.locator('input[type="password"]').fill(staffPassword());

      const loginResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/v1/auth/login") &&
          response.request().method() === "POST",
      );
      await page.locator('form button[type="submit"]').click();
      const loginResponse = await loginResponsePromise;

      expect(loginResponse.status()).toBe(403);
      expectUnauthenticatedPosEntry(page);
      await expect(page.getByText("POS 设备绑定")).toBeVisible();

      const me = await fetchAuthMe(page);
      expect(me.status).toBe(401);
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
