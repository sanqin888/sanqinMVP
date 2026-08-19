import {
  createNewAddressState,
  isNewAddressActivationKey,
} from "./checkout-address";

declare const describe: (name: string, testSuite: () => void) => void;
declare const it: {
  (name: string, test: () => void): void;
  each: (values: string[]) => (name: string, test: (key: string) => void) => void;
};
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
  toMatchObject: (expected: unknown) => void;
};

describe("使用新地址", () => {
  const savedAddressCustomer = {
    firstName: "San",
    lastName: "Qin",
    email: "member@example.com",
    phone: "4165550100",
    addressLine1: "100 Member Street",
    addressLine2: "Unit 8",
    city: "Markham",
    province: "BC",
    postalCode: "L3R 0B8",
    notes: "Leave at the door",
  };

  it("从已预填的会员地址切换为空值，并丢弃旧地址定位和校验结果", () => {
    const result = createNewAddressState(savedAddressCustomer);

    expect(result).toMatchObject({
      selectedAddressStableId: null,
      selectedCoordinates: null,
      selectedPlaceId: null,
      addressValidation: {
        distanceKm: null,
        isChecking: false,
        error: null,
      },
      customer: {
        addressLine1: "",
        addressLine2: "",
        city: "Toronto",
        province: "ON",
        postalCode: "",
      },
    });
    expect(result.customer).toMatchObject({
      firstName: savedAddressCustomer.firstName,
      lastName: savedAddressCustomer.lastName,
      email: savedAddressCustomer.email,
      phone: savedAddressCustomer.phone,
      notes: savedAddressCustomer.notes,
    });
  });

  it.each(["Enter", " "])("支持 %p 键触发", (key) => {
    expect(isNewAddressActivationKey(key)).toBe(true);
  });

  it("忽略其他按键", () => {
    expect(isNewAddressActivationKey("Escape")).toBe(false);
  });
});
