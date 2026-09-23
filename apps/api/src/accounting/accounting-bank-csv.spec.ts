import { AccountingFinancialProvider } from './accounting-contracts';
import { parseAccountingBankCsv } from './accounting-bank-csv';

describe('parseAccountingBankCsv', () => {
  it('recognizes the real CIBC headerless four-column export shape', () => {
    const parsed = parseAccountingBankCsv(
      [
        '2026-06-30,Branch Transaction ACC FEE- SELF SERV,20.00,',
        '2026-06-30,Electronic Funds Transfer MISC PAYMENT Uber Holdings Canad,,165.51',
        '2026-06-24,Electronic Funds Transfer MISC PAYMENT FANTUAN,,770.93',
        '2026-06-10,Electronic Funds Transfer MISC PAYMENT DP29351880018 FIRST DATA CANADA(K),,67.04',
        '2026-06-09,Electronic Funds Transfer MISC PAYMENT DFG7E2VDAVAMTFY UBER HOLDINGS CANADA INC,,284.48',
        '2026-06-10,Electronic Funds Transfer MISC PAYMENT FANTUAN,,860.57',
      ].join('\n'),
    );

    expect(parsed).toMatchObject({
      matched: true,
      headers: ['date', 'description', 'withdrawals', 'deposits'],
      withdrawalRowCount: 1,
      invalidRows: [],
      depositRows: [
        {
          rowNumber: 2,
          occurredOn: '2026-06-30',
          amountCents: 16551,
          providerHint: AccountingFinancialProvider.UBER_EATS,
        },
        {
          rowNumber: 3,
          occurredOn: '2026-06-24',
          amountCents: 77093,
          providerHint: AccountingFinancialProvider.FANTUAN,
        },
        {
          rowNumber: 4,
          occurredOn: '2026-06-10',
          amountCents: 6704,
          providerHint: AccountingFinancialProvider.CLOVER,
        },
        {
          rowNumber: 5,
          occurredOn: '2026-06-09',
          amountCents: 28448,
          providerHint: AccountingFinancialProvider.UBER_EATS,
        },
        {
          rowNumber: 6,
          occurredOn: '2026-06-10',
          amountCents: 86057,
          providerHint: AccountingFinancialProvider.FANTUAN,
        },
      ],
    });
  });

  it('rejects a generic headerless four-column table that lacks the CIBC transaction signature', () => {
    expect(
      parseAccountingBankCsv(
        '2026-06-09,UBER EATS PAYOUT,,284.48\n2026-06-10,FANTUAN,,860.57\n',
      ),
    ).toEqual({ matched: false });
  });

  it('recognizes a strong CIBC-style Withdrawals/Deposits CSV and keeps only deposits', () => {
    const parsed = parseAccountingBankCsv(
      [
        'Date,Description,Withdrawals ($),Deposits ($),Balance ($)',
        '06/09/2026,UBER EATS PAYOUT,,284.48,5000.00',
        '06/10/2026,FANTUAN SETTLEMENT,,860.57,5860.57',
        '06/11/2026,RENT,1200.00,,4660.57',
      ].join('\n'),
    );

    expect(parsed).toEqual({
      matched: true,
      headers: [
        'date',
        'description',
        'withdrawals',
        'deposits',
        'balance',
      ],
      depositRows: [
        {
          rowNumber: 2,
          occurredOn: '2026-06-09',
          amountCents: 28448,
          description: 'UBER EATS PAYOUT',
          providerHint: AccountingFinancialProvider.UBER_EATS,
        },
        {
          rowNumber: 3,
          occurredOn: '2026-06-10',
          amountCents: 86057,
          description: 'FANTUAN SETTLEMENT',
          providerHint: AccountingFinancialProvider.FANTUAN,
        },
      ],
      withdrawalRowCount: 1,
      invalidRows: [],
      truncated: false,
    });
  });

  it('recognizes Funds Out/Funds In headers and detects Clover hints', () => {
    const parsed = parseAccountingBankCsv(
      'Transaction Date,Transaction Details,Funds Out,Funds In\n2026-09-22,CLOVER DEP,,$123.45\n',
    );

    expect(parsed).toMatchObject({
      matched: true,
      depositRows: [
        {
          occurredOn: '2026-09-22',
          amountCents: 12345,
          providerHint: AccountingFinancialProvider.CLOVER,
        },
      ],
    });
  });

  it('fails closed for generic date/amount/description tables', () => {
    expect(
      parseAccountingBankCsv(
        'Date,Amount,Description\n2026-09-22,123.45,UBER EATS\n',
      ),
    ).toEqual({ matched: false });
  });

  it('fails closed for generic Debit/Credit columns without a strong bank signature', () => {
    expect(
      parseAccountingBankCsv(
        'Date,Description,Debit,Credit\n2026-09-22,UBER EATS,,123.45\n',
      ),
    ).toEqual({ matched: false });
  });

  it('preserves malformed deposit evidence instead of silently dropping it', () => {
    const parsed = parseAccountingBankCsv(
      [
        'Date,Description,Withdrawals,Deposits',
        'not-a-date,UBER EATS,,284.48',
        '2026-06-10,FANTUAN,10.00,20.00',
      ].join('\n'),
    );

    expect(parsed).toMatchObject({
      matched: true,
      depositRows: [],
      invalidRows: [
        { rowNumber: 2, reason: 'INVALID_DATE' },
        { rowNumber: 3, reason: 'BOTH_DIRECTIONS' },
      ],
    });
  });
});
