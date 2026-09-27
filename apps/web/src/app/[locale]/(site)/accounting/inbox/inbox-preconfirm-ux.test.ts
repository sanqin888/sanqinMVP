import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Accounting Inbox pre-confirm UX closeout', () => {
  it('shows recognition confidence and explains Expense review vs posting', () => {
    const source = readFileSync(
      resolve(__dirname, 'inbox-items-list.tsx'),
      'utf8',
    );

    expect(source).toContain("识别置信度");
    expect(source).toContain('parse.confidence');
    expect(source).toContain('打开审核页不会入账');
    expect(source).toContain('查看并审核费用');
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
    expect(source).toContain('已确认 · 受保护');
    expect(source).toContain('Confirmed · protected');
  });
});
