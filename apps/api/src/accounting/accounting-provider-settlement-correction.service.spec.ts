import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  AccountingPostedCorrectionReasonCode,
  AccountingPostedCorrectionTargetKind,
} from './accounting-posted-financial-correction.contract';
import { AccountingProviderSettlementCorrectionService } from './accounting-provider-settlement-correction.service';

const sha = (value: string) => value.repeat(64).slice(0, 64);

const currentRecord = {
  version: 1 as const,
  status: 'READY' as const,
  blockReason: null,
  document: {
    documentStableId: 'provider_doc_1',
    revision: 1,
    provider: 'UBER_EATS' as const,
    documentType: 'STATEMENT' as const,
    storeStableId: '4750_Yonge_Street',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    currency: 'CAD',
  },
  currentEffective: {
    targetAuthorityHash: sha('a'),
    draftInput: {
      version: 1 as const,
      expectedBaseAuthorityHash: sha('a'),
      lines: [],
    },
  },
  corrections: [],
};

const makeService = () => {
  const prisma = {
    accountingProviderFinancialDocument: {
      findUnique: jest.fn(),
    },
    accountingCorrectionCase: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
  };
  const correction = {
    createDraft: jest.fn(),
    reviseDraft: jest.fn(),
    previewCase: jest.fn(),
    markReady: jest.fn(),
    executeCase: jest.fn(),
    cancelCase: jest.fn(),
  };
  const adapter = {
    targetKind: AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
    readCurrentEffectiveTarget: jest.fn(),
  };
  const service = new AccountingProviderSettlementCorrectionService(
    prisma as never,
    correction as never,
    adapter as never,
  );
  return { service, prisma, correction, adapter };
};

describe('AccountingProviderSettlementCorrectionService', () => {
  it('returns current-effective Provider authority beside correction history', async () => {
    const { service, prisma, adapter } = makeService();
    prisma.accountingProviderFinancialDocument.findUnique.mockResolvedValue({
      documentStableId: 'provider_doc_1',
      revision: 1,
      provider: 'UBER_EATS',
      documentType: 'STATEMENT',
      storeStableId: '4750_Yonge_Street',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T00:00:00.000Z'),
      currency: 'CAD',
    });
    adapter.readCurrentEffectiveTarget.mockResolvedValue({
      targetAuthorityHash: sha('a'),
      targetJson: { version: 1 },
      draftInput: {
        version: 1,
        expectedBaseAuthorityHash: sha('a'),
        lines: [],
      },
    });

    await expect(service.readRecord('provider_doc_1')).resolves.toEqual(
      currentRecord,
    );
    expect(prisma.accountingCorrectionCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            {
              targetKind:
                AccountingPostedCorrectionTargetKind.PROVIDER_SETTLEMENT,
              targetStableId: { in: ['provider_doc_1'] },
            },
          ],
        },
      }),
    );
  });

  it('turns owner conflicts into an explicit blocked posted-record state', async () => {
    const { service, prisma, adapter } = makeService();
    prisma.accountingProviderFinancialDocument.findUnique.mockResolvedValue({
      documentStableId: 'provider_doc_clover',
      revision: 1,
      provider: 'CLOVER',
      documentType: 'STATEMENT',
      storeStableId: '4750_Yonge_Street',
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T00:00:00.000Z'),
      currency: 'CAD',
    });
    adapter.readCurrentEffectiveTarget.mockRejectedValue(
      new ConflictException('specialized correction blocks common correction'),
    );

    const result = await service.readRecord('provider_doc_clover');

    expect(result.status).toBe('BLOCKED');
    expect(result.blockReason).toContain('specialized correction');
    expect(result.currentEffective).toBeNull();
  });

  it('creates a Provider correction through the common lifecycle with stale-editor binding', async () => {
    const { service, correction, adapter } = makeService();
    jest.spyOn(service, 'readRecord').mockResolvedValue(currentRecord as never);
    correction.createDraft.mockResolvedValue({});

    await service.createDraft(
      'provider_doc_1',
      {
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        note: 'Correct statement sales total',
        target: currentRecord.currentEffective.draftInput,
      },
      'user_1',
    );

    expect(correction.createDraft).toHaveBeenCalledWith(
      {
        targetStableId: 'provider_doc_1',
        targetVersion: 1,
        reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
        note: 'Correct statement sales total',
        targetJson: currentRecord.currentEffective.draftInput,
      },
      'user_1',
      adapter,
    );
  });

  it('rejects a second active Provider correction for the same Statement', async () => {
    const { service, correction } = makeService();
    jest.spyOn(service, 'readRecord').mockResolvedValue({
      ...currentRecord,
      corrections: [
        {
          correctionStableId: 'correction_active',
          status: 'DRAFT',
        },
      ],
    } as never);

    await expect(
      service.createDraft(
        'provider_doc_1',
        {
          reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
          target: currentRecord.currentEffective.draftInput,
        },
        'user_1',
      ),
    ).rejects.toThrow(
      'Provider Statement already has an active DRAFT or READY correction',
    );
    expect(correction.createDraft).not.toHaveBeenCalled();
  });

  it('rejects a create request whose editor hash is older than current effective authority', async () => {
    const { service, correction } = makeService();
    jest.spyOn(service, 'readRecord').mockResolvedValue(currentRecord as never);

    await expect(
      service.createDraft(
        'provider_doc_1',
        {
          reasonCode: AccountingPostedCorrectionReasonCode.AMOUNT_ERROR,
          target: {
            ...currentRecord.currentEffective.draftInput,
            expectedBaseAuthorityHash: sha('b'),
          },
        },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(correction.createDraft).not.toHaveBeenCalled();
  });

  it('never lets a correctionStableId from another Statement cross the route boundary', async () => {
    const { service, prisma, correction } = makeService();
    prisma.accountingCorrectionCase.findFirst.mockResolvedValue(null);

    await expect(
      service.previewCase('provider_doc_1', 'correction_other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(correction.previewCase).not.toHaveBeenCalled();
  });

  it('binds structural v2 draft creation to the separate immutable structural hash', async () => {
    const { service, correction, adapter } = makeService();
    const structuralHash = sha('c');
    jest.spyOn(service, 'readRecord').mockResolvedValue({
      ...currentRecord,
      currentEffective: {
        ...currentRecord.currentEffective,
        structuralBaseAuthorityHash: structuralHash,
      },
    } as never);
    const target = {
      version: 2,
      expectedBaseAuthorityHash: structuralHash,
      changes: [],
    };
    await service.createDraft(
      'provider_doc_1',
      {
        reasonCode: AccountingPostedCorrectionReasonCode.MISSING_COMPONENT,
        target,
      },
      'user_1',
    );
    expect(correction.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ targetJson: target }),
      'user_1',
      adapter,
    );
    await expect(
      service.createDraft(
        'provider_doc_1',
        {
          reasonCode: AccountingPostedCorrectionReasonCode.MISSING_COMPONENT,
          target: { ...target, expectedBaseAuthorityHash: sha('a') },
        },
        'user_1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves v2 current-effective read-only lines without fabricating a v1 draft', async () => {
    const { service, prisma, adapter } = makeService();
    prisma.accountingProviderFinancialDocument.findUnique.mockResolvedValue({
      ...currentRecord.document,
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-30T00:00:00.000Z'),
    });
    adapter.readCurrentEffectiveTarget.mockResolvedValue({
      targetAuthoritySchema: 'accounting.provider-settlement-correction-target.v2',
      targetAuthorityHash: sha('c'),
      structuralBaseAuthorityHash: null,
      draftInput: null,
      effectiveLines: [
        {
          effectiveLineStableId: 'correction-line:fee',
          effectiveLineNo: 2,
          origin: 'CORRECTION_ADDED',
          sourceLine: null,
          evidenceDocumentStableId: 'provider_doc_1',
          rawCode: null,
          rawName: 'Marketing Fee',
          component: 'ADVERTISING',
          postingTreatment: 'POSTABLE',
          taxRole: 'NONE',
          amountCents: -28200,
          occurredAt: null,
        },
      ],
    });
    const record = await service.readRecord('provider_doc_1');
    expect(record.currentEffective?.draftInput).toBeNull();
    expect(record.currentEffective?.effectiveLines).toEqual([
      expect.objectContaining({
        origin: 'CORRECTION_ADDED',
        sourceLine: null,
        amountCents: -28200,
      }),
    ]);
  });

  it('delegates READY and POST to A3 with the Provider adapter and returns fresh state', async () => {
    const { service, prisma, correction, adapter } = makeService();
    prisma.accountingCorrectionCase.findFirst.mockResolvedValue({
      correctionStableId: 'correction_1',
      targetStableId: 'provider_doc_1',
    });
    correction.markReady.mockResolvedValue({});
    correction.executeCase.mockResolvedValue({
      correction: {},
      replayed: false,
    });
    jest.spyOn(service, 'readRecord').mockResolvedValue(currentRecord as never);

    await service.markReady(
      'provider_doc_1',
      'correction_1',
      {
        expectedVersion: 2,
        expectedPlanHash: sha('c'),
      },
      'user_1',
    );
    const posted = await service.executeCase(
      'provider_doc_1',
      'correction_1',
      { expectedPlanHash: sha('c') },
      'user_1',
    );

    expect(correction.markReady).toHaveBeenCalledWith(
      'correction_1',
      {
        expectedVersion: 2,
        expectedPlanHash: sha('c'),
      },
      'user_1',
      adapter,
    );
    expect(correction.executeCase).toHaveBeenCalledWith(
      'correction_1',
      { expectedPlanHash: sha('c') },
      'user_1',
      adapter,
    );
    expect(posted).toEqual({
      replayed: false,
      record: currentRecord,
    });
  });
});
