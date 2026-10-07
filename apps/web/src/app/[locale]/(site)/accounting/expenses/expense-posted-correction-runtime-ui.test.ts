import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const recordsSource = readFileSync(
  resolve(__dirname, 'expense-records-panel.tsx'),
  'utf8',
);
const panelSource = readFileSync(
  resolve(__dirname, 'expense-posted-correction-panel.tsx'),
  'utf8',
);
const workflowSource = readFileSync(
  resolve(__dirname, 'expense-posted-correction-workflow.ts'),
  'utf8',
);
const editorSource = readFileSync(
  resolve(__dirname, 'expense-posted-correction-editor.tsx'),
  'utf8',
);
const historySource = readFileSync(
  resolve(__dirname, 'expense-posted-correction-history.tsx'),
  'utf8',
);

describe('Expense posted correction runtime UI', () => {
  it('mounts a separate correction panel without reopening ExpenseEditor for confirmed source facts', () => {
    expect(pageSource).toContain('<ExpensePostedCorrectionPanel');
    expect(pageSource).toContain('<ExpenseEditor');
    expect(pageSource).toContain('setEditingDocument(null)');
    expect(panelSource).toContain('confirmed Expense source row');
    expect(panelSource).not.toContain('<ExpenseEditor');
  });

  it('offers correction only for records whose batched state proves canonical posting', () => {
    expect(recordsSource).toContain(
      'document.correctionState.canonicalPosted',
    );
    expect(recordsSource).toContain('Correct posted record');
    expect(recordsSource).toContain('onCorrectPostedRecord(document)');
  });

  it('uses the Expense-specific lifecycle API and current-effective seed', () => {
    expect(workflowSource).toContain('/accounting/journal/expense/');
    expect(workflowSource).toContain('/corrections/');
    expect(workflowSource).toContain('/preview');
    expect(workflowSource).toContain('/ready');
    expect(workflowSource).toContain('/post');
    expect(workflowSource).toContain('/cancel');
    expect(workflowSource).toContain('next.currentEffective?.draftInput');
    expect(workflowSource).toContain(
      'record.currentEffective.targetAuthorityHash',
    );
  });

  it('preserves v2 inherit/explicit-clear and historical v1 allocation semantics', () => {
    expect(editorSource).toContain('fundingTouched');
    expect(editorSource).toContain('显式清空');
    expect(editorSource).toContain('历史 v1 付款分配');
    expect(editorSource).toContain('不会偷偷转换为 v2 split funding');
    expect(workflowSource).toContain('allocationsTouched');
    expect(workflowSource).toContain('paymentAllocations: allocations.map');
  });

  it('renders compensating Delta/NOOP and distinguishes Original from Current Effective', () => {
    expect(historySource).toContain('Compensating delta');
    expect(historySource).toContain('NOOP / authority-only');
    expect(historySource).toContain('Original persisted fact');
    expect(historySource).toContain('Current Effective corrected authority');
    expect(historySource).toContain('journalOutputs');
    expect(historySource).toContain('postedByActorRef');
  });

  it('requires full planHash acknowledgement and enters UNKNOWN/no-retry after ambiguous POST', () => {
    expect(panelSource).toContain(
      'confirmationText.trim() === active.planHash',
    );
    expect(panelSource).toContain('acknowledged');
    expect(workflowSource).toContain('expectedPlanHash: active.planHash');
    expect(workflowSource).toContain('fresh authoritative record');
    expect(workflowSource).toContain('UNKNOWN / no-retry');
    expect(workflowSource).toContain('setPostUnknown(true)');
  });

  it('does not expose frozen date/currency/funding-version edits', () => {
    expect(panelSource).toContain('Frozen fields');
    expect(panelSource).toContain('occurredAt');
    expect(panelSource).toContain('currency');
    expect(panelSource).toContain('funding attribution v');
    expect(editorSource).not.toContain('occurredAt');
    expect(editorSource).not.toContain('currency');
  });
});
