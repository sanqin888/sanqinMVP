import { ApiError } from "@/lib/api/client";
import {
  canDenyUberOrder,
  getUberCancellationErrorMessage,
} from "./uber-cancellation";

declare const describe: (name: string, suite: () => void) => void;
declare const it: (name: string, test: () => void) => void;
declare const expect: (value: unknown) => {
  toBe(expected: unknown): void;
};

describe("Uber order cancellation", () => {
  it("allows a pending Uber order to use the DENY action", () => {
    expect(canDenyUberOrder("pending")).toBe(true);
  });

  it("keeps making and ready Uber orders read-only", () => {
    expect(canDenyUberOrder("making")).toBe(false);
    expect(canDenyUberOrder("ready")).toBe(false);
  });

  it("shows the server's manual handling message after a 409 status race", () => {
    const message =
      "该 Uber 订单已接单；请联系 Uber 支持人工处理。订单本地状态未更改。";
    const error = new ApiError("Conflict", 409, {
      code: "UBER_ACCEPTED_CANCELLATION_UNSUPPORTED",
      message,
      manualActionRequired: true,
    });

    expect(getUberCancellationErrorMessage(error, "fallback")).toBe(message);
  });
});
