export const REPORTING_ORDER_FACTS_QUERY = Symbol(
  'REPORTING_ORDER_FACTS_QUERY',
);

export type ReportingOrderItemComponentFactV1 = {
  productStableId: string;
  nameEn: string | null;
  nameZh: string | null;
  quantityPerParent: number;
};

export type ReportingOrderItemFactV1 = {
  qty: number;
  productStableId: string;
  displayName: string | null;
  nameEn: string | null;
  nameZh: string | null;
  components: ReportingOrderItemComponentFactV1[];
};

export interface ReportingOrderFactsQueryPort {
  readItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ReportingOrderItemFactV1[]>;
}
