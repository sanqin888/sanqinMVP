export const REPORTING_TOP_ITEMS_QUERY = Symbol('REPORTING_TOP_ITEMS_QUERY');

export type ReportingTopItemAggregate = {
  stableId: string;
  name: string;
  quantity: number;
};

export interface ReportingTopItemsQueryPort {
  getTopItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<ReportingTopItemAggregate[]>;
}
