import { parseAccountingStructuredExpenseCsv } from './accounting-structured-expense-csv';

describe('parseAccountingStructuredExpenseCsv', () => {
  it('parses a multi-row bill history using semantic date and amount headers', () => {
    const parsed = parseAccountingStructuredExpenseCsv(
      [
        'Account Number,Bill Date,Service,Billing Name,Nickname,Amount Due,',
        '1234,2026-07-28,Business services,SANQIN RESTAURANT,Main,84.69,',
        '1234,2026-06-28,Business services,SANQIN RESTAURANT,Main,84.69,',
      ].join('\n'),
    );

    expect(parsed).toEqual({
      matched: true,
      headers: [
        'account number',
        'bill date',
        'service',
        'billing name',
        'nickname',
        'amount due',
      ],
      rows: [
        {
          rowNumber: 2,
          occurredAt: '2026-07-28',
          totalCents: 8469,
          description: 'Business services',
          counterparty: 'SANQIN RESTAURANT',
        },
        {
          rowNumber: 3,
          occurredAt: '2026-06-28',
          totalCents: 8469,
          description: 'Business services',
          counterparty: 'SANQIN RESTAURANT',
        },
      ],
      invalidRows: [],
    });
  });

  it('accepts generic aliases, BOM, quoted commas, underscores, and month-first dates', () => {
    const parsed = parseAccountingStructuredExpenseCsv(
      '\uFEFFtransaction_date,transaction_amount,vendor,description\r\n' +
        '09/15/2026,"$1,234.56",Example Supplier,"Repair, parts and labour"\r\n',
    );

    expect(parsed).toEqual({
      matched: true,
      headers: [
        'transaction date',
        'transaction amount',
        'vendor',
        'description',
      ],
      rows: [
        {
          rowNumber: 2,
          occurredAt: '2026-09-15',
          totalCents: 123456,
          description: 'Repair, parts and labour',
          counterparty: 'Example Supplier',
        },
      ],
      invalidRows: [],
    });
  });

  it('normalizes common camelCase export headers', () => {
    const parsed = parseAccountingStructuredExpenseCsv(
      'InvoiceDate,AmountDue,Merchant\n2026-08-01,45.67,Example Services\n',
    );

    expect(parsed).toEqual({
      matched: true,
      headers: ['invoice date', 'amount due', 'merchant'],
      rows: [
        {
          rowNumber: 2,
          occurredAt: '2026-08-01',
          totalCents: 4567,
          description: null,
          counterparty: 'Example Services',
        },
      ],
      invalidRows: [],
    });
  });

  it('fails closed when the table does not identify both date and amount semantics', () => {
    expect(
      parseAccountingStructuredExpenseCsv(
        'Metric,Amount\nMarketplace Fees,-12.34\nNet Total,87.66\n',
      ),
    ).toEqual({ matched: false });
  });

  it('does not treat bare date-and-amount columns as sufficient expense evidence', () => {
    expect(
      parseAccountingStructuredExpenseCsv(
        'Date,Amount\n2026-08-01,12.34\n2026-08-02,23.45\n',
      ),
    ).toEqual({ matched: false });
  });

  it('preserves invalid-row evidence instead of silently dropping an incomplete batch', () => {
    const parsed = parseAccountingStructuredExpenseCsv(
      [
        'Invoice Date,Invoice Total,Supplier',
        '2026-08-01,12.34,Vendor A',
        'not-a-date,25.00,Vendor B',
      ].join('\n'),
    );

    expect(parsed).toEqual({
      matched: true,
      headers: ['invoice date', 'invoice total', 'supplier'],
      rows: [
        {
          rowNumber: 2,
          occurredAt: '2026-08-01',
          totalCents: 1234,
          description: null,
          counterparty: 'Vendor A',
        },
      ],
      invalidRows: [{ rowNumber: 3, reason: 'INVALID_DATE' }],
    });
  });

  it('fails closed on malformed quoted CSV instead of guessing cells', () => {
    expect(
      parseAccountingStructuredExpenseCsv(
        'Date,Amount,Description\n2026-08-01,12.34,"unterminated\n',
      ),
    ).toEqual({ matched: false });
  });
});
