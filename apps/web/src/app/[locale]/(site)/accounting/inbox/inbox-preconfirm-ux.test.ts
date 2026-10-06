import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Accounting Inbox pre-confirm UX closeout', () => {
  it('shows recognition confidence and explains Expense review vs posting', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );

    expect(source).toContain('识别置信度');
    expect(source).toContain('expenseParse.confidence');
    expect(source).toContain('确认识别并进入审核');
    expect(source).toContain('核算与最终确认都在审核阶段完成');
  });

  it('blocks notification-only expense email review until a formal source document is linked', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );
    const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

    expect(source).toContain('缺少正式会计凭证');
    expect(source).toContain('上传正式账单');
    expect(source).toContain('正式账单已补齐');
    expect(source).toContain('更换正式账单');
    expect(source).toContain("item.expenseEvidenceReadiness.status === 'READY'");
    expect(pageSource).toContain('/expense-evidence');
    expect(pageSource).toContain('/expense/review');
    expect(pageSource).toContain(
      '/accounting/expenses?status=PENDING_REVIEW&limit=100',
    );
    expect(pageSource).toContain('费用审核区');
    expect(source).toContain('disabled');
    expect(source).toContain('点击后进入费用审核');
    expect(pageSource).toContain("method: 'DELETE'");
  });

  it('groups same-message Gmail body and attachments into one review card', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );

    expect(source).toContain('同一封 Gmail · 正文与附件合并审核');
    expect(source).toContain('费用主凭证');
    expect(source).toContain('辅助证据');
    expect(source).toContain('gmailMessage.evidence.map');
    expect(source).toContain('gmailPrimaryEvidence');
  });

  it('distinguishes settlement statements from supporting/control evidence', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );
    const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

    expect(source).toContain('确认识别并进入审核');
    expect(source).toContain('这里只确认识别内容大致正确，不做核算、不记账');
    expect(source).toContain('确认识别并归档');
    expect(source).toContain('辅助 / 控制证据确认后直接归档');
    expect(pageSource).toContain("confirmedDocumentType !== 'STATEMENT'");
    expect(pageSource).toContain('辅助 / 控制证据的识别结果已确认并归档');
    expect(pageSource).toContain('/accounting/settlements#provider-');
  });

  it('keeps reconciliation out of Inbox and only confirms recognition there', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );

    expect(source).toContain('识别条目');
    expect(source).toContain('费用识别结果');
    expect(source).not.toContain('账单自动验算');
    expect(source).not.toContain('providerStatementConfirmationBlocked');
    expect(source).not.toContain('providerValidation?.canConfirm');
    expect(source).not.toContain('<ProviderFinancialReviewPanel');
  });

  it('labels manual uploads as deletable before confirmation and protected after confirmation', () => {
    const source = readFileSync(
      resolve(__dirname, 'manual-upload-library.tsx'),
      'utf8',
    );

    expect(source).toContain('未确认 · 可永久删除');
    expect(source).toContain('已关联通知邮件 · 受保护');
    expect(source).toContain('Linked to notification · protected');
    expect(source).toContain('已确认 · 受保护');
    expect(source).toContain('Confirmed · protected');
  });
});
