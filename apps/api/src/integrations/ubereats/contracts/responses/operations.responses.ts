import type {
  UberListResponse,
  UberMutationResponse,
} from './ubereats.responses';

export class UberOpsTicketResponse {
  ticketStableId!: string;
  type!: string;
  status!: string;
  priority!: string;
  title!: string;
  externalOrderId!: string | null;
  menuItemStableId!: string | null;
  retryCount!: number;
  createdAt!: string;
  updatedAt!: string;
}
export type UberOpsTicketListResponse = UberListResponse<UberOpsTicketResponse>;
export type UberOperationMutationResponse = UberMutationResponse;
