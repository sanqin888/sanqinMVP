import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
const posApiSource = readFileSync(
  resolve(__dirname, "../../../../../../lib/api/pos.ts"),
  "utf8",
);

describe("POS order management historical query", () => {
  it("defaults order management to today's store-local orders", () => {
    expect(pageSource).toContain('time: "today"');
    expect(pageSource).toContain("utcRangeForYmdInTimeZone");
  });

  it("uses the paginated server-side search instead of filtering only the latest 30 orders", () => {
    expect(pageSource).toContain("fetchPosOrderSearch<BackendOrder>");
    expect(pageSource).not.toContain("fetchRecentOrders<BackendOrder[]>(30)");
    expect(posApiSource).toContain("/pos/orders/search?");
    expect(posApiSource).toContain('qs.set("pageSize"');
  });
});
