import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  managedRefundNotice,
  managedRefundUncertainNotice,
} from "./managed-refund-notice";

const confirmed = {
  status: "SUCCEEDED" as const,
  operation: "VOID" as const,
  failureCode: null,
  failureMessage: null,
};

describe("POS managed VOID/refund result", () => {
  it.each(["zh", "en"] as const)(
    "distinguishes a true void and converted refund in %s",
    (locale) => {
      const voided = managedRefundNotice(
        { ...confirmed, reversalOutcome: "VOIDED" },
        locale,
      );
      const refunded = managedRefundNotice(
        { ...confirmed, reversalOutcome: "REFUNDED" },
        locale,
      );
      expect(voided.tone).toBe("success");
      expect(refunded.tone).toBe("success");
      expect(voided.message).not.toBe(refunded.message);
      expect(voided.message).toContain(
        locale === "zh" ? "撤销已确认" : "Void confirmed",
      );
      expect(refunded.message).toContain(
        locale === "zh" ? "原请求为撤销" : "converted",
      );
    },
  );

  it.each([
    "CREATED",
    "PROCESSING",
    "UNKNOWN",
    "RECONCILING",
    "FAILED",
    "CANCELLED",
    "DECLINED",
  ] as const)(
    "never displays financial success for %s, even if a refund ID observation exists elsewhere",
    (status) => {
      const notice = managedRefundNotice(
        { ...confirmed, status, reversalOutcome: "REFUNDED" },
        "zh",
      );
      expect(notice.tone).toBe("error");
      expect(notice.message).not.toContain("已确认");
      expect(notice.message).toContain("勿");
    },
  );

  it("does not infer a true void from an older API's requested operation alone", () => {
    expect(managedRefundNotice(confirmed, "en").message).toContain(
      "void/refund type",
    );
    expect(managedRefundNotice(confirmed, "en").message).not.toBe(
      "Void confirmed.",
    );
  });

  it("retains normal refund and zero-external-tender success messages", () => {
    expect(
      managedRefundNotice(
        { ...confirmed, operation: "REFUND", reversalOutcome: "REFUNDED" },
        "zh",
      ),
    ).toEqual({ tone: "success", message: "退款已确认。" });
    expect(
      managedRefundNotice({ ...confirmed, operation: null }, "en").tone,
    ).toBe("success");
  });

  it.each(["zh", "en"] as const)(
    "warns against another financial request after response loss in %s",
    (locale) => {
      const notice = managedRefundUncertainNotice(locale);
      expect(notice.tone).toBe("error");
      expect(notice.message).toContain(
        locale === "zh" ? "勿重复撤销" : "do not submit another",
      );
    },
  );

  it("keeps the HTTP-loss and received-response UI paths on the same safe notice boundary", () => {
    const pageSource = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(pageSource).toContain("managedRefundNotice(managed, locale)");
    expect(pageSource).toContain("if (managedCardRequestStarted)");
    expect(pageSource).toContain("managedRefundUncertainNotice(locale)");
  });
});
