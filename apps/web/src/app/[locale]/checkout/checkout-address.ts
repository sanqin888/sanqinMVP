export type CheckoutAddressCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
};

export const DEFAULT_CHECKOUT_CITY = "Toronto";
export const DEFAULT_CHECKOUT_PROVINCE = "ON";

export function createNewAddressState(customer: CheckoutAddressCustomer) {
  return {
    customer: {
      ...customer,
      addressLine1: "",
      addressLine2: "",
      city: DEFAULT_CHECKOUT_CITY,
      province: DEFAULT_CHECKOUT_PROVINCE,
      postalCode: "",
    },
    selectedAddressStableId: null,
    selectedCoordinates: null,
    selectedPlaceId: null,
    addressValidation: {
      distanceKm: null,
      isChecking: false,
      error: null,
    },
  };
}

export function isNewAddressActivationKey(key: string) {
  return key === "Enter" || key === " ";
}
