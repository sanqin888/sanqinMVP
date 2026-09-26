export const CLOVER_CLOSEOUT_RAW_CODES = {
  SALES: 'CLOVER_CLOSEOUT_SALES',
  REFUNDS: 'CLOVER_CLOSEOUT_REFUNDS',
  NET: 'CLOVER_CLOSEOUT_NET',
  TAX: 'CLOVER_CLOSEOUT_TAX',
  TIPS: 'CLOVER_CLOSEOUT_TIPS',
} as const;

export const CLOVER_CLOSEOUT_EMAIL_SENDER = 'app@clover.com';
export const CLOVER_CLOSEOUT_BOUNDARY_EVIDENCE_START_DATE = '2026-05-29';

export function isCloverCloseoutEmailEvidence(
  senderEmail: string | null | undefined,
  subject: string | null | undefined,
): boolean {
  return (
    senderEmail?.trim().toLowerCase() === CLOVER_CLOSEOUT_EMAIL_SENDER &&
    /Closeout Report for\s+[A-Za-z]{3}\s+\d{1,2},\s+\d{4}/i.test(subject ?? '')
  );
}
