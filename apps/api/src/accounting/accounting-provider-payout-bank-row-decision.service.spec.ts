import { AccountingFinancialProvider } from './accounting-contracts';
import { AccountingProviderPayoutBankMatchService } from './accounting-provider-payout-bank-match.service';
import { AccountingProviderPayoutBankRowDecisionService } from './accounting-provider-payout-bank-row-decision.service';
import { providerPayoutBankRowFingerprint } from './accounting-provider-payout-bank-row-decision.policy';

const preview = () => ({
  version: 1 as const,
  scope: 'PROVIDER_PAYOUT_BANK_MATCH_PREVIEW' as const,
  artifactStableId: 'acctart_bank_1',
  filename: 'cibc.csv',
  storeStableId: '4750_Yonge_Street',
  destinationBankAccountStableId: 'account_cibc',
  currency: 'CAD' as const,
  deposits: [
    {
      rowNumber: 9,
      occurredOn: '2026-06-09',
      amountCents: 28448,
      description: 'UBER',
      providerHint: AccountingFinancialProvider.UBER_EATS,
      status: 'EXACT_EXISTING_PAYOUT' as const,
      candidates: [
        {
          payoutStableId: 'payout_uber',
          provider: AccountingFinancialProvider.UBER_EATS,
          payoutDate: '2026-06-09',
          amountCents: 28448,
          providerReference: null,
          journalEntryStableId: 'journal_uber',
          dateDistanceDays: 0,
          providerHintMatch: true,
        },
      ],
    },
    {
      rowNumber: 10,
      occurredOn: '2026-06-10',
      amountCents: 86057,
      description: 'FANTUAN',
      providerHint: AccountingFinancialProvider.FANTUAN,
      status: 'UNMATCHED' as const,
      candidates: [],
    },
    {
      rowNumber: 11,
      occurredOn: '2026-06-29',
      amountCents: 125091,
      description: 'MOBILE DEPOSIT',
      providerHint: null,
      status: 'UNMATCHED' as const,
      candidates: [],
    },
  ],
  source: {
    depositRowCount: 3,
    withdrawalRowCount: 0,
    invalidRowCount: 0,
    invalidRows: [],
  },
  counts: {
    exactExisting: 1,
    ambiguousExisting: 0,
    possibleExisting: 0,
    unmatched: 2,
  },
});

function makeService() {
  const sourceArtifact = {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'CSV',
    inboxItem: {
      status: 'CONFIRMED',
      classification: 'OTHER_DOCUMENT',
      duplicateOfArtifactId: null,
    },
  };
  const tx = {
    accountingProviderPayoutBankRowDecision: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: '22222222-2222-4222-8222-222222222222',
          ...data,
          createdAt: new Date('2026-09-23T21:00:00.000Z'),
          updatedAt: new Date('2026-09-23T21:00:00.000Z'),
        }),
      ),
      update: jest.fn(),
    },
    accountingAuditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    accountingSourceArtifact: {
      findUnique: jest.fn().mockResolvedValue(sourceArtifact),
    },
    accountingProviderPayoutBankRowDecision: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const bankMatch = {
    preview: jest.fn().mockResolvedValue(preview()),
  };
  return {
    service: new AccountingProviderPayoutBankRowDecisionService(
      prisma as never,
      bankMatch as unknown as AccountingProviderPayoutBankMatchService,
    ),
    prisma,
    tx,
    bankMatch,
  };
}

describe('AccountingProviderPayoutBankRowDecisionService', () => {
  it('persists one reviewed decision for every recognized deposit row', async () => {
    const { service, tx } = makeService();

    const result = await service.confirmScope(
      {
        artifactStableId: 'acctart_bank_1',
        storeStableId: '4750_Yonge_Street',
        destinationBankAccountStableId: 'account_cibc',
        includedRowNumbers: [9, 10],
      },
      'user_accountant_1',
    );

    expect(result.confirmed).toBe(true);
    expect(result.decisions).toEqual([
      expect.objectContaining({
        rowNumber: 9,
        decision: 'MATCH_EXISTING_PAYOUT',
        matchedPayoutStableId: 'payout_uber',
      }),
      expect.objectContaining({
        rowNumber: 10,
        decision: 'READY_FOR_POSTING',
      }),
      expect.objectContaining({
        rowNumber: 11,
        decision: 'EXCLUDED',
      }),
    ]);
    expect(
      tx.accountingProviderPayoutBankRowDecision.create,
    ).toHaveBeenCalledTimes(3);
    expect(tx.accountingAuditLog.create).toHaveBeenCalledTimes(3);
  });

  it('restores a confirmed scope only when persisted row fingerprints still match current evidence parsing', async () => {
    const { service, prisma } = makeService();
    const current = preview().deposits[0];
    prisma.accountingProviderPayoutBankRowDecision.findMany.mockResolvedValue([
      {
        decisionStableId: 'bankrow_1',
        rowNumber: current.rowNumber,
        rowFingerprint: providerPayoutBankRowFingerprint(current),
        occurredOn: new Date('2026-06-09T00:00:00.000Z'),
        amountCents: current.amountCents,
        description: current.description,
        providerHint: current.providerHint,
        decision: 'MATCH_EXISTING_PAYOUT',
        matchedPayoutStableId: 'payout_uber',
        confirmedByActorRef: 'user_accountant_1',
        confirmedAt: new Date('2026-09-23T21:00:00.000Z'),
      },
    ]);

    const result = await service.getScope({
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
    });

    expect(result.confirmed).toBe(false);
    expect(result.decisions[0]).toMatchObject({
      rowNumber: 9,
      decision: 'MATCH_EXISTING_PAYOUT',
    });

    prisma.accountingProviderPayoutBankRowDecision.findMany.mockResolvedValue([
      {
        decisionStableId: 'bankrow_stale',
        rowNumber: 9,
        rowFingerprint: 'stale',
        occurredOn: new Date('2026-06-09T00:00:00.000Z'),
        amountCents: 28448,
        description: 'UBER',
        providerHint: AccountingFinancialProvider.UBER_EATS,
        decision: 'MATCH_EXISTING_PAYOUT',
        matchedPayoutStableId: 'payout_uber',
        confirmedByActorRef: 'user_accountant_1',
        confirmedAt: new Date('2026-09-23T21:00:00.000Z'),
      },
    ]);
    const stale = await service.getScope({
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
    });
    expect(stale.confirmed).toBe(false);
    expect(stale.decisions).toEqual([]);
  });

  it('revalidates a READY decision against the current confirmed scope before posting', async () => {
    const { service, prisma } = makeService();
    const current = {
      decisionStableId: 'bankrow_ready',
      rowNumber: 10,
      rowFingerprint: 'fingerprint',
      occurredOn: '2026-06-10',
      amountCents: 86057,
      description: 'FANTUAN',
      providerHint: AccountingFinancialProvider.FANTUAN,
      decision: 'READY_FOR_POSTING' as const,
      matchedPayoutStableId: null,
      confirmedByActorRef: 'user_accountant_1',
      confirmedAt: '2026-09-23T21:00:00.000Z',
    };
    prisma.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue({
      ...current,
      occurredOn: new Date('2026-06-10T00:00:00.000Z'),
      confirmedAt: new Date('2026-09-23T21:00:00.000Z'),
      artifact: { artifactStableId: 'acctart_bank_1' },
    });
    jest.spyOn(service, 'getScope').mockResolvedValue({
      version: 1,
      scope: 'PROVIDER_PAYOUT_BANK_ROW_DECISIONS',
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
      currency: 'CAD',
      confirmed: true,
      decisions: [current],
    });

    await expect(
      service.requireCurrentPostingDecision('bankrow_ready'),
    ).resolves.toMatchObject({
      decisionStableId: 'bankrow_ready',
      decision: 'READY_FOR_POSTING',
    });
  });

  it('requires scope reconfirmation when a persisted READY decision is no longer current', async () => {
    const { service, prisma } = makeService();
    prisma.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue({
      decisionStableId: 'bankrow_ready',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
      decision: 'READY_FOR_POSTING',
      artifact: { artifactStableId: 'acctart_bank_1' },
    });
    jest.spyOn(service, 'getScope').mockResolvedValue({
      version: 1,
      scope: 'PROVIDER_PAYOUT_BANK_ROW_DECISIONS',
      artifactStableId: 'acctart_bank_1',
      storeStableId: '4750_Yonge_Street',
      destinationBankAccountStableId: 'account_cibc',
      currency: 'CAD',
      confirmed: false,
      decisions: [],
    });

    await expect(
      service.requireCurrentPostingDecision('bankrow_ready'),
    ).rejects.toThrow('reconfirm the settlement scope');
  });

  it('allows idempotent replay of an already matched decision without revalidating READY scope', async () => {
    const { service, prisma } = makeService();
    prisma.accountingProviderPayoutBankRowDecision.findUnique.mockResolvedValue({
      decisionStableId: 'bankrow_match',
      rowNumber: 9,
      rowFingerprint: 'fingerprint',
      occurredOn: new Date('2026-06-09T00:00:00.000Z'),
      amountCents: 28448,
      description: 'UBER',
      providerHint: AccountingFinancialProvider.UBER_EATS,
      decision: 'MATCH_EXISTING_PAYOUT',
      matchedPayoutStableId: 'payout_uber',
      confirmedByActorRef: 'user_accountant_1',
      confirmedAt: new Date('2026-09-23T21:00:00.000Z'),
      artifact: { artifactStableId: 'acctart_bank_1' },
    });
    const getScope = jest.spyOn(service, 'getScope');

    await expect(
      service.requireCurrentPostingDecision('bankrow_match'),
    ).resolves.toMatchObject({
      decision: 'MATCH_EXISTING_PAYOUT',
      matchedPayoutStableId: 'payout_uber',
    });
    expect(getScope).not.toHaveBeenCalled();
  });

  it('rejects decisions for evidence that has not completed Inbox review', async () => {
    const { service, prisma, bankMatch } = makeService();
    prisma.accountingSourceArtifact.findUnique.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'CSV',
      inboxItem: {
        status: 'PENDING_REVIEW',
        classification: 'OTHER_DOCUMENT',
        duplicateOfArtifactId: null,
      },
    });

    await expect(
      service.confirmScope(
        {
          artifactStableId: 'acctart_bank_1',
          storeStableId: '4750_Yonge_Street',
          destinationBankAccountStableId: 'account_cibc',
          includedRowNumbers: [9],
        },
        'user_accountant_1',
      ),
    ).rejects.toThrow('retained reviewed CSV evidence');
    expect(bankMatch.preview).not.toHaveBeenCalled();
  });
});
