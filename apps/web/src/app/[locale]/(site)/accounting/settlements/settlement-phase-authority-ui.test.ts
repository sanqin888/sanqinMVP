import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

describe('Accounting provider settlement phase authority UX', () => {
  it('keeps Inbox recognition separate while reviewing editable posting values and reconciliation', () => {
    expect(source).toContain('待入账值尚未核算');
    expect(source).toContain('当前待入账值由收件箱确认结果预填');
    expect(source).toContain('<ProviderFinancialReviewPanel');
    expect(source).toContain('纵向业务核算');
    expect(source).toContain('横向借贷平衡');
    expect(source).toContain('controlTotalChecks.map');
    expect(source).toContain('将要入账的结算预览（只读）');
    expect(source).toContain('将要入账的处理决定');
    expect(source).toContain('将要写入的 Journal');
    expect(source).toContain('documentPlan.draftJournal');
    expect(source).not.toContain('机器 Sales');
    expect(source).not.toContain('机器 Tax on Sales');
    expect(source).not.toContain('机器平台佣金 / 费用');
    expect(source).not.toContain('机器净结算');
    expect(source).not.toContain('机器 Canonical');
    expect(source).not.toContain('<StatementLines');
  });

  it('auto-reconciles the Inbox handoff and invalidates stale reconciliation on edits', () => {
    expect(source).toContain('autoReconciledDocumentStableId');
    expect(source).toContain('linkedProviderDocumentStableIdFromHash()');
    expect(source).toContain('void runShadowPreview(target.document)');
    expect(source).toContain('reviewPendingByDocumentStableId');
    expect(source).toContain('旧核算结果已失效');
    expect(source).toContain('未确认修改不会参与核算，也不会开放入账');
  });

  it('renders posted settlements from persisted Journal rows without falling back to recognition', () => {
    expect(source).toContain('数据库已入账 Journal');
    expect(source).toContain('postingState?.journal');
    expect(source).toContain('journal.lines.map');
    expect(source).toContain('line.accountName');
    expect(source).toContain('line.debitCents');
    expect(source).toContain('line.creditCents');
    expect(source).toContain('不会回退显示识别数字');
    expect(source).not.toContain('canonical 明细用于审计');
  });
});
