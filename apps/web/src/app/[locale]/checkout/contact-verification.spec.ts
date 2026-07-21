import {
  buildCheckoutContactPayload,
  reconcileVerifiedContacts,
  resolveDeliveryPhoneState,
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

describe("resolveDeliveryPhoneState", () => {
  it("客人输入有效新号码时优先使用新号码", () => {
    expect(
      resolveDeliveryPhoneState({
        enteredPhone: "4165550199",
        memberPhone: "4165550188",
        memberPhoneVerified: true,
      }),
    ).toEqual({
      hasSubmittedPhone: true,
      submittedPhoneValid: true,
      usesVerifiedMemberFallback: false,
      hasDeliveryPhone: true,
    });
  });

  it("客人留空时允许使用会员已验证号码", () => {
    expect(
      resolveDeliveryPhoneState({
        enteredPhone: "",
        memberPhone: "4165550188",
        memberPhoneVerified: true,
      }),
    ).toEqual({
      hasSubmittedPhone: false,
      submittedPhoneValid: false,
      usesVerifiedMemberFallback: true,
      hasDeliveryPhone: true,
    });
  });

  it("会员号码未验证时不能作为外送兜底", () => {
    expect(
      resolveDeliveryPhoneState({
        enteredPhone: "",
        memberPhone: "4165550188",
        memberPhoneVerified: false,
      }).hasDeliveryPhone,
    ).toBe(false);
  });

  it("客人输入无效号码时不静默回退会员旧号码", () => {
    expect(
      resolveDeliveryPhoneState({
        enteredPhone: "12345",
        memberPhone: "4165550188",
        memberPhoneVerified: true,
      }),
    ).toEqual({
      hasSubmittedPhone: true,
      submittedPhoneValid: false,
      usesVerifiedMemberFallback: false,
      hasDeliveryPhone: false,
    });
  });
});
