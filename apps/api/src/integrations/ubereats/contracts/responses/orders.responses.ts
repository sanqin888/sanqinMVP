import type {
  UberListResponse,
  UberMutationResponse,
} from './ubereats.responses';

export class UberPendingOrderResponse {
  externalOrderId!: string;
  orderStableId!: string | null;
  pickupCode!: string | null;
  status!: string;
  totalCents!: number;
  storeId!: string | null;
  createdAt!: string | null;
  updatedAt!: string | null;
}
export type UberOrdersListResponse = UberListResponse<UberPendingOrderResponse>;
export type UberOrderMutationResponse = UberMutationResponse;
export class UberOrderSummaryResponse {
  total!: number;
  contractVersion!: '2';
}
