import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(__dirname, "page.tsx"), "utf8");

describe("POS durable order lifecycle cutover", () => {
  it("creates the order once and no longer drives first print or first status advance from the browser", () => {
    expect(pageSource).toContain('apiFetch<CreatePosOrderResponse>("/pos/orders"');
    expect(pageSource).not.toContain("printOrderCloud(");
    expect(pageSource).not.toContain("advanceOrder(");
  });

  it("keeps cash received on the create request so durable AUTO print can rebuild change from the Order snapshot", () => {
    expect(pageSource).toContain("cashReceivedCents: cashMeta.cashReceivedCents");
  });

  it("routes zero-external loyalty orders through internal benefits instead of the cash dialog", () => {
    expect(pageSource).toContain("const isFullyPaidByInternalBenefits =");
    expect(pageSource).toContain("loyaltyRedeemCents > 0 || balanceToUseCents > 0");
    expect(pageSource).toContain(
      '(paymentMethod === "store_balance" && isFullyPaidByInternalBenefits)',
    );
    expect(pageSource).not.toContain(
      "totalAfterPointsCents > 0 && remainingTotalCents === 0",
    );
  });
});
