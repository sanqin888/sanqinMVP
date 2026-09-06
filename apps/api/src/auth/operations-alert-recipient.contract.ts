export const OPERATIONS_ALERT_RECIPIENTS = Symbol(
  'OPERATIONS_ALERT_RECIPIENTS',
);

export type OperationsAlertRecipient = {
  userStableId: string;
  email: string | null;
  phone: string | null;
  language: 'ZH' | 'EN';
};

export interface OperationsAlertRecipientPort {
  listActiveAdminRecipients(): Promise<OperationsAlertRecipient[]>;
}
