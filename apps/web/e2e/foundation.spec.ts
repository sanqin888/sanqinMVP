import { expect, test, type Page } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type PublicMenuPayload = {
  categories?: Array<{
    stableId?: unknown;
    items?: Array<{ stableId?: unknown }>;
  }>;
};

type BrowserFetchResult = {
  ok: boolean;
  status: number;
  body: string;
};

const E2E_MENU_CATEGORY_STABLE_ID = "c000000000000000000000001";
const E2E_MENU_ITEM_STABLE_ID = "c000000000000000000000002";

async function browserFetch(page: Page, path: string): Promise<BrowserFetchResult> {
  return page.evaluate(async (requestPath) => {
    const response = await fetch(requestPath, {
      cache: "no-store",
      credentials: "include",
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    };
  }, path);
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

test.describe("A5-B1 browser E2E foundation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/staff/login", { waitUntil: "domcontentloaded" });
  });

  test("Chromium -> Web BFF reaches the real API process", async ({ page }) => {
    const response = await browserFetch(page, "/api/v1/health");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    const payload = parseJson<
      ApiEnvelope<{ status?: unknown; timestamp?: unknown }>
    >(response.body);

    expect(payload.code).toBe("OK");
    expect(payload.message).toBe("success");
    expect(payload.details?.status).toBe("ok");
    expect(typeof payload.details?.timestamp).toBe("string");
  });

  test("Chromium -> BFF -> API -> PostgreSQL returns the seeded public menu fixture", async ({
    page,
  }) => {
    const response = await browserFetch(page, "/api/v1/menu/public");

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    const payload = parseJson<ApiEnvelope<PublicMenuPayload>>(response.body);
    expect(payload.code).toBe("OK");

    const category = payload.details?.categories?.find(
      (item) => item.stableId === E2E_MENU_CATEGORY_STABLE_ID,
    );
    expect(category).toBeDefined();
    expect(
      category?.items?.some(
        (item) => item.stableId === E2E_MENU_ITEM_STABLE_ID,
      ),
    ).toBe(true);
  });
});
