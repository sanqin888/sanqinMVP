import type { AccountingInboxItem } from '../contracts/inbox';
import {
  findAccountingInboxItemByStableId,
  retainReviewingInboxItemStableId,
} from './reviewing-inbox-item';

function makeInboxItem(
  inboxItemStableId: string,
  parseRunStableId: string,
  extractedText: string,
): AccountingInboxItem {
  return {
    inboxItemStableId,
    status: 'PENDING_REVIEW',
    classification: 'EXPENSE_DOCUMENT',
    selectedProvider: null,
    trustDecision: 'NOT_APPLICABLE',
    materializedEntityType: null,
    materializedEntityStableId: null,
    version: 1,
    createdAt: '2026-09-17T00:00:00.000Z',
    artifact: {
      artifactStableId: `artifact_${inboxItemStableId}`,
      acquisitionMode: 'MANUAL_UPLOAD',
      kind: 'IMAGE',
      originalFilename: 'receipt.jpg',
      storedUrl: '/receipt.jpg',
      bodyText: null,
      senderEmail: null,
      emailSubject: null,
      financialDocument: null,
      parseRuns: [
        {
          parseRunStableId,
          status: 'SUCCESS',
          resultJson: { extractedText },
          errorMessage: null,
        },
      ],
    },
  };
}

describe('findAccountingInboxItemByStableId', () => {
  it('derives the review item from the latest items collection instead of keeping the opened snapshot', () => {
    const openedSnapshot = makeInboxItem('inbox_a', 'parse_old', 'old evidence');
    const reviewingStableId = openedSnapshot.inboxItemStableId;

    expect(
      findAccountingInboxItemByStableId([openedSnapshot], reviewingStableId)
        ?.artifact.parseRuns[0]?.parseRunStableId,
    ).toBe('parse_old');

    const refreshedItem = makeInboxItem(
      'inbox_a',
      'parse_new',
      'fresh Textract evidence',
    );
    const refreshedReviewing = findAccountingInboxItemByStableId(
      [refreshedItem],
      reviewingStableId,
    );

    expect(refreshedReviewing).toBe(refreshedItem);
    expect(refreshedReviewing?.artifact.parseRuns[0]?.parseRunStableId).toBe(
      'parse_new',
    );
    expect(refreshedReviewing?.artifact.parseRuns[0]?.resultJson?.extractedText).toBe(
      'fresh Textract evidence',
    );
  });

  it('clears the stored review stable ID when the item disappears after refresh', () => {
    const item = makeInboxItem('inbox_a', 'parse_old', 'old evidence');

    expect(retainReviewingInboxItemStableId([item], 'inbox_a')).toBe('inbox_a');
    expect(retainReviewingInboxItemStableId([], 'inbox_a')).toBeNull();
    expect(findAccountingInboxItemByStableId([], 'inbox_a')).toBeNull();
  });
});
