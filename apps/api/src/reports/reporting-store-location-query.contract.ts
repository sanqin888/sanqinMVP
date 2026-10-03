export const REPORTING_STORE_LOCATION_QUERY = Symbol(
  'REPORTING_STORE_LOCATION_QUERY',
);

export type ReportingStoreLocationContextV1 = {
  storeStableId: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  countryCode: string;
  province: string | null;
};

export interface ReportingStoreLocationQueryPort {
  getStoreLocationContext(
    storeStableId: string,
  ): Promise<ReportingStoreLocationContextV1>;
}
