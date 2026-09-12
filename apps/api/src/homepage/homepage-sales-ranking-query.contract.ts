export const HOMEPAGE_SALES_RANKING_QUERY = Symbol(
  'HOMEPAGE_SALES_RANKING_QUERY',
);

export type HomepageSalesRankingItem = {
  stableId: string;
  name: string;
  quantity: number;
};

export interface HomepageSalesRankingQueryPort {
  getTopItemsForRange(
    startDate: Date,
    endDate: Date,
  ): Promise<HomepageSalesRankingItem[]>;
}
