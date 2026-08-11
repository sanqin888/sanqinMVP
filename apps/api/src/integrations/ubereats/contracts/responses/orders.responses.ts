import type {
  UberListResponse,
  UberMutationResponse,
} from './ubereats.responses';

export class UberPendingOrderResponse {
  externalOrderId!: string;
  status!: string;
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
