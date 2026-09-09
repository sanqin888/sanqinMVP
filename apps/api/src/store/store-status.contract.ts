export const STORE_STATUS_READER = Symbol('STORE_STATUS_READER');

export type StoreStatusReadSnapshot = {
  isOpenBySchedule: boolean;
  isTemporarilyClosed: boolean;
  timezone: string;
  today: {
    date: string;
    closeMinutes: number | null;
  };
};

export interface StoreStatusReaderPort {
  getCurrentStatus(storeStableId: string): Promise<StoreStatusReadSnapshot>;
}
