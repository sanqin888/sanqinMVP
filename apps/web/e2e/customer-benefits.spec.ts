import { expect, test, type Page } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type AuthMePayload = {
  role?: unknown;
  userStableId?: unknown;
  mfaVerifiedAt?: unknown;
};

type MembershipSummaryPayload = {
  userStableId?: unknown;
  tier?: unknown;
  points?: unknown;
  balance?: unknown;
  availableDiscountCents?: unknown;
};

type MembershipCoupon = {
  couponStableId?: unknown;
  title?: unknown;
  discountCents?: unknown;
  minSpendCents?: unknown;
  status?: unknown;
};

const CUSTOMER_PHONE_E164 = "+14165550111";
const CUSTOMER_LOGIN_CODE = "654321";
const CUSTOMER_STABLE_ID = "c000000000000000000000007";
const COUPON_STABLE_ID = "c000000000000000000000008";

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

test.describe("A5-C1 Customer identity and benefits", () => {
  // Login OTP requests and deterministic challenge consumption are one-shot
  // semantics; an automatic retry would no longer start from the same fixture.
  test.describe.configure({ retries: 0 });

  test("membership login UI requests an SMS challenge through the production route", async ({
    page,
  }) => {
    await page.goto("/en/membership/login", {
      waitUntil: "domcontentloaded",
    });

    await page.getByPlaceholder("Enter your phone number").fill("4165550199");

    const requestCodePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/login/phone/request") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send code" }).click();
    const requestCodeResponse = await requestCodePromise;

    expect(requestCodeResponse.ok()).toBe(true);
    await expect(
      page.getByText("Code sent to +1 4165550199"),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Enter 6-digit code")).toBeVisible();
  });

  test("a real Customer session exposes canonical points, balance, and coupon reads", async ({
    page,
  }) => {
    await page.goto("/en/membership/login", {
      waitUntil: "domcontentloaded",
    });

    const verified = await fetchEnvelope<{ isNewUser?: boolean }>(
      page,
      "/api/v1/auth/login/phone/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: CUSTOMER_PHONE_E164,
          code: CUSTOMER_LOGIN_CODE,
          language: "en",
        }),
      },
    );

    expect(verified.status).toBe(201);
    expect(verified.payload.details?.isNewUser).toBe(false);

    await page.goto("/en/membership");
    await expect(page.getByText("Member Center", { exact: true })).toBeVisible();

    const me = await fetchEnvelope<AuthMePayload>(page, "/api/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.payload.details?.role).toBe("CUSTOMER");
    expect(me.payload.details?.userStableId).toBe(CUSTOMER_STABLE_ID);
    expect(typeof me.payload.details?.mfaVerifiedAt).toBe("string");

    const summary = await fetchEnvelope<MembershipSummaryPayload>(
      page,
      "/api/v1/membership/summary",
    );
    expect(summary.status).toBe(200);
    expect(summary.payload.details).toMatchObject({
      userStableId: CUSTOMER_STABLE_ID,
      tier: "SILVER",
      points: 10,
      balance: 20,
      availableDiscountCents: 1000,
    });

    await expect(page.getByText("$20.00", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Points can redeem up to $10.00."),
    ).toBeVisible();

    const coupons = await fetchEnvelope<MembershipCoupon[]>(
      page,
      "/api/v1/membership/coupons?locale=en",
    );
    expect(coupons.status).toBe(200);
    expect(coupons.payload.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          couponStableId: COUPON_STABLE_ID,
          title: "A5 E2E $1 Coupon",
          discountCents: 100,
          minSpendCents: 500,
          status: "active",
        }),
      ]),
    );

    await page.getByRole("button", { name: "Coupons" }).click();
    await expect(page.getByText(/A5 E2E \$1 Coupon/)).toBeVisible();
    await expect(page.getByText("Save $1.00", { exact: true })).toBeVisible();
  });
});
