import { expect, test, type Page } from "@playwright/test";
import { POS_DISPLAY_STORAGE_KEY } from "../src/lib/pos-display";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

const STAFF_PASSWORD_ENV = "SANQ_E2E_STAFF_PASSWORD";
const D3_ENROLLMENT_CODE_ENV = "SANQ_E2E_D3_POS_ENROLLMENT_CODE";
const E2E_MENU_ITEM_STABLE_ID = "c000000000000000000000002";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for POS display/PWA browser E2E`);
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

async function establishD3PosSession(page: Page): Promise<string> {
  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-CA,en;q=0.9",
  });
  // Start from the manifest URL itself. In CI the middleware redirect also
  // establishes the canonical browser origin used for host-only auth/device
  // cookies, so all subsequent workstation pages must stay on that origin.
  await page.goto("/store/pos", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForURL(
    (url) =>
      url.pathname === "/en/staff/login" &&
      url.searchParams.get("next") === "/en/store/pos",
  );
  const workstationOrigin = new URL(page.url()).origin;

  const claim = await fetchEnvelope<{ success?: boolean }>(
    page,
    "/api/v1/pos/devices/claim",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollmentCode: requiredEnv(D3_ENROLLMENT_CODE_ENV),
        meta: {
          userAgent: "A5-D3-Playwright",
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
  return workstationOrigin;
}

async function setAutoAccept(page: Page, enabled: boolean): Promise<number> {
  const result = await fetchEnvelope<unknown>(
    page,
    "/api/v1/pos/orders/settings/auto-accept",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
  return result.status;
}

test.describe("A5-D3 POS display and PWA continuity", () => {
  // Device enrollment is intentionally one-time.
  test.describe.configure({ retries: 0 });

  test("language-neutral POS launch, same-profile Customer Display projection, and reload preserve the workstation state", async ({
    page: posPage,
    context,
  }) => {
    const workstationOrigin = await establishD3PosSession(posPage);

    // The disposable store normally exercises auto-accept. Disable it only while
    // this full POS page is mounted so D3 cannot consume D2's seeded paid Web order.
    expect(await setAutoAccept(posPage, false)).toBe(200);

    try {
      const displayPage = await context.newPage();
      await displayPage.goto(
        new URL("/en/store/display", workstationOrigin).toString(),
        {
          waitUntil: "domcontentloaded",
        },
      );
      await expect(displayPage.getByText("Welcome", { exact: true })).toBeVisible();

      await posPage.goto(
        new URL("/store/pos", workstationOrigin).toString(),
        {
          waitUntil: "domcontentloaded",
        },
      );
      await posPage.waitForURL(
        (url) => url.pathname === "/en/store/pos",
      );
      await expect(posPage.getByText("Store POS", { exact: true })).toBeVisible();

      const manifestLink = posPage.locator(
        'link[rel="manifest"][href="/pos.webmanifest"]',
      );
      await expect(manifestLink).toHaveCount(1);

      const manifest = await posPage.evaluate(async () => {
        const response = await fetch("/pos.webmanifest", { cache: "no-store" });
        return {
          status: response.status,
          body: (await response.json()) as {
            id?: unknown;
            start_url?: unknown;
            scope?: unknown;
            display?: unknown;
          },
        };
      });
      expect(manifest.status).toBe(200);
      expect(manifest.body).toMatchObject({
        id: "/pwa/pos",
        start_url: "/store/pos",
        scope: "/",
        display: "standalone",
      });

      const serviceWorkerRegistrations = await posPage.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return [];
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.map((registration) => registration.scope);
      });
      expect(serviceWorkerRegistrations).toEqual([]);

      const menuItem = posPage
        .getByRole("button")
        .filter({ hasText: "E2E Item" })
        .first();
      await expect(menuItem).toBeVisible();
      await menuItem.click();

      await expect(
        displayPage.getByText("Please review your order", { exact: true }),
      ).toBeVisible();
      await expect(displayPage.getByText("E2E Item", { exact: true })).toBeVisible();
      await expect(displayPage.getByText("$5.65", { exact: true })).toBeVisible();

      const snapshotBeforeReload = await posPage.evaluate((storageKey) => {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? (JSON.parse(raw) as unknown) : null;
      }, POS_DISPLAY_STORAGE_KEY);
      expect(snapshotBeforeReload).toMatchObject({
        items: [
          expect.objectContaining({
            stableId: E2E_MENU_ITEM_STABLE_ID,
            quantity: 1,
            lineTotalCents: 500,
          }),
        ],
        subtotalCents: 500,
        taxCents: 65,
        totalCents: 565,
      });

      await posPage.reload({ waitUntil: "domcontentloaded" });
      await posPage.waitForURL((url) => url.pathname === "/en/store/pos");
      await expect(posPage.getByText("Store POS", { exact: true })).toBeVisible();

      const cookieNames = new Set(
        (await context.cookies()).map((cookie) => cookie.name),
      );
      expect(cookieNames.has("session_id")).toBe(true);
      expect(cookieNames.has("posDeviceId")).toBe(true);
      expect(cookieNames.has("posDeviceKey")).toBe(true);

      const storeContext = await fetchEnvelope<{
        storeStableId?: unknown;
        storeName?: unknown;
      }>(posPage, "/api/v1/pos/store-context");
      expect(storeContext.status).toBe(200);
      expect(storeContext.payload.details).toMatchObject({
        storeStableId: "e2e_store",
        storeName: "SanQ E2E Store",
      });

      const snapshotAfterReload = await posPage.evaluate((storageKey) => {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? (JSON.parse(raw) as unknown) : null;
      }, POS_DISPLAY_STORAGE_KEY);
      expect(snapshotAfterReload).toMatchObject({
        items: [
          expect.objectContaining({
            stableId: E2E_MENU_ITEM_STABLE_ID,
            quantity: 1,
            lineTotalCents: 500,
          }),
        ],
        totalCents: 565,
      });

      await expect(displayPage.getByText("E2E Item", { exact: true })).toBeVisible();
      await expect(displayPage.getByText("$5.65", { exact: true })).toBeVisible();

    } finally {
      // Restore the shared disposable StoreConfig even if an assertion fails so
      // other browser journeys never depend on D3 execution order.
      await setAutoAccept(posPage, true).catch(() => 0);
    }
  });
});
