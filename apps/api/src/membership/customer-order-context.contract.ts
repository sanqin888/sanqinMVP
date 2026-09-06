export const CUSTOMER_ORDER_CONTEXT_READER = Symbol(
  'CUSTOMER_ORDER_CONTEXT_READER',
);

export type CustomerOrderContactContext = {
  userStableId: string;
  verifiedEmail: string | null;
  verifiedPhone: string | null;
  language: 'ZH' | 'EN' | null;
};

export type CustomerOrderDeliveryAddress = {
  addressStableId: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  placeId: string | null;
  latitude: number | null;
  longitude: number | null;
};

export interface CustomerOrderContextReaderPort {
  getOrderCustomerContext(
    userStableId: string,
  ): Promise<CustomerOrderContactContext | null>;
  getSavedDeliveryAddress(input: {
    userStableId: string;
    addressStableId: string;
  }): Promise<CustomerOrderDeliveryAddress | null>;
}
