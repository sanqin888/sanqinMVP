import { expect, test, type Page, type Response } from "@playwright/test";

type ApiEnvelope<T> = {
  code?: unknown;
  message?: unknown;
  details?: T;
};

type PricingQuote = {
  subtotalCents?: unknown;
  couponDiscountCents?: unknown;
  loyaltyRedeemCents?: unknown;
  taxCents?: unknown;
  totalCents?: unknown;
};

type PaymentSession = {
  completedOrderStableId?: unknown;
  externalPaymentCents?: unknown;
};

type OrderDetails = {
  orderStableId?: unknown;
  status?: unknown;
  paymentMethod?: unknown;
  subtotalCents?: unknown;
  couponDiscountCents?: unknown;
  loyaltyRedeemCents?: unknown;
  taxCents?: unknown;
  totalCents?: unknown;
  balancePaidCents?: unknown;
  externalPaidCents?: unknown;
};

const CUSTOMER_PHONE_E164 = "+14165550112";
const CUSTOMER_LOGIN_CODE = "654322";
const CUSTOMER_STABLE_ID = "c000000000000000000000010";
const COUPON_STABLE_ID = "c000000000000000000000011";
const MENU_ITEM_STABLE_ID = "c000000000000000000000002";

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

function matchesFinalPricingQuote(response: Response): boolean {
  if (
    !response.url().endsWith("/api/v1/orders/pricing/quote") ||
    response.request().method() !== "POST"
  ) {
    return false;
  }

  try {
    const body = response.request().postDataJSON() as {
      userStableId?: unknown;
      couponStableId?: unknown;
      redeemValueCents?: unknown;
      items?: Array<{ productStableId?: unknown; qty?: unknown }>;
    };
    return (
      body.userStableId === CUSTOMER_STABLE_ID &&
      body.couponStableId === COUPON_STABLE_ID &&
      body.redeemValueCents === 100 &&
      body.items?.some(
        (item) =>
          item.productStableId === MENU_ITEM_STABLE_ID && item.qty === 1,
      ) === true
    );
  } catch {
    return false;
  }
}

test.describe("A5-C2 Customer controlled checkout", () => {
  // The fixture uses a real one-time membership-login challenge and creates a
  // real paid Order. Automatic retry would no longer begin from the same state.
  test.describe.configure({ retries: 0 });

  test("coupon + points quote can complete as a zero-external stored-balance Order", async ({
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

    await page.evaluate((productStableId) => {
      window.localStorage.setItem(
        "sanqin-cart",
        JSON.stringify([
          {
            cartLineId: productStableId,
            productStableId,
            quantity: 1,
            notes: "",
          },
        ]),
      );
    }, MENU_ITEM_STABLE_ID);

    await page.goto("/en/checkout", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByText("Pick a coupon to apply to this order."),
    ).toBeVisible();
    await expect(
      page.getByText("You have 10.00 pts. You can redeem up to $5.00 this order."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Choose coupon" }).click();
    await expect(page.getByText("A5 C2 E2E $1 Coupon", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apply", exact: true }).click();

    const finalQuotePromise = page.waitForResponse(matchesFinalPricingQuote);
    await page.getByLabel("Points to use this order").fill("1");
    const finalQuoteResponse = await finalQuotePromise;

    expect(finalQuoteResponse.ok()).toBe(true);
    const quoteEnvelope =
      (await finalQuoteResponse.json()) as ApiEnvelope<PricingQuote>;
    expect(quoteEnvelope.details).toMatchObject({
      subtotalCents: 500,
      couponDiscountCents: 100,
      loyaltyRedeemCents: 100,
      taxCents: 39,
      totalCents: 339,
    });

    await expect(
      page.getByText("Points discount", { exact: true }).locator(".."),
    ).toContainText("-$1.00");

    await page.getByLabel("Balance to use").fill("3.39");
    await expect(
      page.getByText("Still to pay", { exact: true }).locator(".."),
    ).toContainText("$0.00");

    const paymentSessionPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/clover/pay/online/session") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Pay $3.39 with balance", exact: true })
      .click();
    const paymentSessionResponse = await paymentSessionPromise;

    expect(paymentSessionResponse.ok()).toBe(true);
    const paymentEnvelope =
      (await paymentSessionResponse.json()) as ApiEnvelope<PaymentSession>;
    expect(paymentEnvelope.details?.externalPaymentCents).toBe(0);
    expect(typeof paymentEnvelope.details?.completedOrderStableId).toBe("string");

    const orderStableId = paymentEnvelope.details?.completedOrderStableId;
    if (typeof orderStableId !== "string") {
      throw new Error("completedOrderStableId is required");
    }

    await page.waitForURL(
      (url) => url.pathname === `/en/thank-you/${orderStableId}`,
    );
    expect(page.url()).not.toContain("/wallet/");

    const order = await fetchEnvelope<OrderDetails>(
      page,
      `/api/v1/orders/${orderStableId}`,
    );
    expect(order.status).toBe(200);
    expect(order.payload.details).toMatchObject({
      orderStableId,
      status: "paid",
      paymentMethod: "STORE_BALANCE",
      subtotalCents: 500,
      couponDiscountCents: 100,
      loyaltyRedeemCents: 100,
      taxCents: 39,
      totalCents: 339,
      balancePaidCents: 339,
      externalPaidCents: 0,
    });
  });
});
