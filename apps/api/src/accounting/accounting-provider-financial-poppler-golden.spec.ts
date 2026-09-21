import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AccountingFinancialDocumentType,
  AccountingFinancialProvider,
} from './accounting-contracts';
import { parsePopplerBboxLayout } from './accounting-pdf-extractor';
import { parseProviderFinancialEvidence } from './accounting-provider-financial.parser';
import { buildProviderSettlementDocumentPlan } from './accounting-provider-settlement.policy';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'test-fixtures', name), 'utf8');

const lineByName = (
  parsed: NonNullable<ReturnType<typeof parseProviderFinancialEvidence>>,
  rawName: string,
) => parsed.lines.find((line) => line.rawName === rawName);

describe('Accounting Poppler provider golden', () => {
  it('preserves the sanitized July Uber column geometry through provider control totals', () => {
    const text = fixture('uber-july-native-poppler.txt');
    const documentExtraction = parsePopplerBboxLayout(
      fixture('uber-july-native-poppler.bbox.xml'),
    );

    expect(documentExtraction).toEqual(
      expect.objectContaining({
        inputKind: 'PDF',
        engine: 'POPPLER',
        layoutMode: 'GEOMETRY',
        truncated: false,
      }),
    );

    const salesLabel = documentExtraction.lines.find(
      (line) => line.text === 'Sales (84 Orders)',
    );
    const salesAmount = documentExtraction.lines.find(
      (line) => line.text === '$2,603.36',
    );
    const taxLabel = documentExtraction.lines.find(
      (line) => line.text === 'Tax on Sales',
    );
    const taxAmount = documentExtraction.lines.find(
      (line) => line.text === '$338.48',
    );
    expect(salesLabel?.geometry?.top).toBeCloseTo(
      salesAmount?.geometry?.top ?? -1,
    );
    expect(taxLabel?.geometry?.top).toBeCloseTo(taxAmount?.geometry?.top ?? -1);
    expect(salesAmount?.geometry?.left ?? 0).toBeGreaterThan(
      (salesLabel?.geometry?.left ?? 0) + (salesLabel?.geometry?.width ?? 0),
    );
    expect(taxAmount?.geometry?.left ?? 0).toBeGreaterThan(
      (taxLabel?.geometry?.left ?? 0) + (taxLabel?.geometry?.width ?? 0),
    );

    const parsed = parseProviderFinancialEvidence({
      providerHint: AccountingFinancialProvider.UBER_EATS,
      documentTypeHint: AccountingFinancialDocumentType.STATEMENT,
      text,
      documentExtraction,
    });

    expect(parsed).not.toBeNull();
    expect(lineByName(parsed!, 'Sales')?.amountCents).toBe(260336);
    expect(lineByName(parsed!, 'Tax on Sales')?.amountCents).toBe(33848);
    expect(lineByName(parsed!, 'Net Total')?.amountCents).toBe(143194);
    expect(lineByName(parsed!, 'Sales')?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'LAYOUT_ROW_PAIR',
        engine: 'POPPLER',
        labelLine: { page: 1, text: 'Sales (84 Orders)' },
        amountLine: { page: 1, text: '$2,603.36' },
      },
    });
    expect(lineByName(parsed!, 'Tax on Sales')?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'LAYOUT_ROW_PAIR',
        engine: 'POPPLER',
        labelLine: { page: 1, text: 'Tax on Sales' },
        amountLine: { page: 1, text: '$338.48' },
      },
    });
    expect(lineByName(parsed!, 'Net Total')?.rawPayload).toMatchObject({
      extractionEvidence: {
        strategy: 'LAYOUT_ROW_PAIR',
        engine: 'POPPLER',
        labelLine: { page: 1, text: 'Net Total' },
        amountLine: { page: 1, text: '$1,431.94*' },
      },
    });
    expect(
      parsed?.lines.some(
        (line) => line.rawName === 'Sales' && line.amountCents === 12000,
      ),
    ).toBe(false);

    const plan = buildProviderSettlementDocumentPlan({
      document: {
        documentStableId: 'acctfindoc_sanitized_uber_july',
        revision: 1,
        provider: parsed!.provider,
        documentType: parsed!.documentType,
        storeStableId: 'sanitized_store',
        periodStart: parsed!.periodStart,
        periodEnd: parsed!.periodEnd,
        currency: parsed!.currency,
        lines: parsed!.lines.map((line, index) => ({
          lineStableId: `acctfinline_sanitized_${index + 1}`,
          lineNo: index + 1,
          rawName: line.rawName,
          component: line.component,
          postingTreatment: line.postingTreatment,
          amountCents: line.amountCents,
        })),
      },
      salesAuthority: 'STATEMENT_AUTHORITATIVE',
      occurredAt: new Date('2026-08-01T03:59:59.999Z'),
    });

    expect(plan.controlTotalChecks).toHaveLength(5);
    expect(
      plan.controlTotalChecks.every((check) => check.status === 'MATCHED'),
    ).toBe(true);
    expect(
      plan.controlTotalChecks.find(
        (check) => check.key === 'UBER_TOTAL_EARNINGS',
      ),
    ).toEqual(
      expect.objectContaining({
        expectedCents: 294184,
        calculatedCents: 294184,
        deltaCents: 0,
      }),
    );
    expect(
      plan.controlTotalChecks.find((check) => check.key === 'UBER_NET_TOTAL'),
    ).toEqual(
      expect.objectContaining({
        expectedCents: 143194,
        calculatedCents: 143194,
        deltaCents: 0,
      }),
    );
  });
});
