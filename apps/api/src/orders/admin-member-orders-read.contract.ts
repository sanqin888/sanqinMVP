export type AdminMemberOrderSummaryDto = {
  orderStableId: string;
  clientRequestId: string | null;
  createdAt: string;
  status: string;
  totalCents: number;
  fulfillmentType: string | null;
  deliveryType: string | null;
};

export type AdminMemberTopPurchasedItemDto = {
  productStableId: string;
  displayName: string;
  purchaseCount: number;
};

export type AdminMemberOrdersReadResult = {
  orders: AdminMemberOrderSummaryDto[];
};

export type AdminMemberTopPurchasedItemsResult = {
  items: AdminMemberTopPurchasedItemDto[];
};
