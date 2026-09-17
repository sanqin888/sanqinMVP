import type { AccountingInboxItem } from './inbox-model';

export function findAccountingInboxItemByStableId(
  items: AccountingInboxItem[],
  inboxItemStableId: string | null,
): AccountingInboxItem | null {
  if (!inboxItemStableId) return null;
  return (
    items.find((item) => item.inboxItemStableId === inboxItemStableId) ?? null
  );
}

export function retainReviewingInboxItemStableId(
  items: AccountingInboxItem[],
  inboxItemStableId: string | null,
): string | null {
  if (!inboxItemStableId) return null;
  return items.some((item) => item.inboxItemStableId === inboxItemStableId)
    ? inboxItemStableId
    : null;
}
