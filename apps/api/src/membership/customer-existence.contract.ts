export const CUSTOMER_EXISTENCE_READER = Symbol('CUSTOMER_EXISTENCE_READER');

export interface CustomerExistenceReaderPort {
  customerExists(userStableId: string): Promise<boolean>;
}
