import {
  buildCheckoutContactPayload,
  reconcileVerifiedContacts,
  selectVerifiedCheckoutContact,
} from "./contact-verification";

declare const describe: (name: string, suite: () => void) => void;
declare const it: (name: string, test: () => void) => void;
declare const expect: (value: unknown) => {
  toBe(expected: unknown): void;
  toBeNull(): void;
  toEqual(expected: unknown): void;
};

describe("checkout contact verification", () => {
  it("clears a verified email after the email changes", () => {
    expect(
      reconcileVerifiedContacts("new@example.com", "+14165550100", {
        verifiedEmail: "old@example.com",
        verifiedPhone: null,
      }).verifiedEmail,
    ).toBeNull();
  });

  it("clears a verified phone after the phone changes", () => {
    expect(
      reconcileVerifiedContacts("", "+14165550101", {
        verifiedEmail: null,
        verifiedPhone: "+14165550100",
      }).verifiedPhone,
    ).toBeNull();
  });

  it("accepts an explicitly verified member email prefill", () => {
    expect(
      selectVerifiedCheckoutContact("member@example.com", "", {
        verifiedEmail: "member@example.com",
        verifiedPhone: null,
      }),
    ).toBe("email");
  });

  it("prefers verified email while a phone is also present", () => {
    expect(
      selectVerifiedCheckoutContact("member@example.com", "+14165550100", {
        verifiedEmail: "member@example.com",
        verifiedPhone: "+14165550100",
      }),
    ).toBe("email");

    expect(
      buildCheckoutContactPayload("member@example.com", "+14165550100"),
    ).toEqual({
      email: "member@example.com",
      phone: "+14165550100",
    });
  });
});
