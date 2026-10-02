import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Accounting Inbox pre-confirm UX closeout', () => {
  it('shows recognition confidence and explains Expense review vs posting', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );

    expect(source).toContain("识别置信度");
    expect(source).toContain('expenseParse.confidence');
    expect(source).toContain('从待处理移入费用审核');
    expect(source).toContain('确认并审核');
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
    expect(source).toContain('点击后会从待处理移入费用审核');
    expect(pageSource).toContain("method: 'DELETE'");
  });

  it('distinguishes settlement statements from supporting/control evidence', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );
    const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

    expect(source).toContain('确认后会转入“平台结算”');
    expect(source).toContain('原始证据将受保护');
    expect(source).toContain('此动作本身不会生成会计分录');
    expect(source).toContain('辅助 / 控制证据 · 确认后直接归档');
    expect(source).toContain('确认并归档辅助证据');
    expect(source).toContain('无需进一步操作');
    expect(pageSource).toContain("confirmedDocumentType !== 'STATEMENT'");
    expect(pageSource).toContain('辅助 / 控制证据已确认并直接入库');
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
