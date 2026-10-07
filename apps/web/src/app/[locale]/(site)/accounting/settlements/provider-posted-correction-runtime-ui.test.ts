import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
const panelSource = readFileSync(
  resolve(__dirname, 'provider-posted-correction-panel.tsx'),
  'utf8',
);

describe('Provider posted correction runtime UI', () => {
  it('mounts the correction workflow inside the persisted posted-Journal card', () => {
    expect(pageSource).toContain('if (journal)');
    expect(pageSource).toContain('<ProviderPostedCorrectionPanel');
    expect(pageSource).toContain('document={document}');
  });

  it('uses the Provider-specific post-posting API rather than reopening Human Review', () => {
    expect(panelSource).toContain(
      '/accounting/journal/provider-settlement/',
    );
    expect(panelSource).toContain('/corrections/');
    expect(panelSource).toContain('/preview');
    expect(panelSource).toContain('/ready');
    expect(panelSource).toContain('/post');
    expect(panelSource).not.toContain('/review-revisions');
    expect(panelSource).not.toContain('/parser-reevaluation');
  });

  it('requires Preview plus full-planHash acknowledgement before a real POST', () => {
    expect(panelSource).toContain('confirmationText.trim() === active.planHash');
    expect(panelSource).toContain('acknowledged');
    expect(panelSource).toContain('expectedPlanHash: active.planHash');
    expect(panelSource).toContain('fresh record');
    expect(panelSource).toContain('UNKNOWN');
  });

  it('shows current-effective authority and correction history without provider/month special cases', () => {
    expect(panelSource).toContain('Current Effective');
    expect(panelSource).toContain('Correction history');
    expect(panelSource).toContain('journalOutputs');
    expect(panelSource).not.toContain('FANTUAN');
    expect(panelSource).not.toContain('2026-09');
    expect(panelSource).not.toContain('September');
  });
});
