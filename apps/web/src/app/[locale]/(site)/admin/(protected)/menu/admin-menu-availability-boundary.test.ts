import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(
      `Unable to locate Admin menu source boundary: ${start} -> ${end}`,
    );
  }

  return pageSource.slice(startIndex, endIndex);
}

describe('Admin menu availability transport boundary', () => {
  it('keeps ordinary item saves from carrying availability fields', () => {
    const ordinarySave = sourceBetween(
      'async function handleSaveItem',
      'async function setItemAvailability',
    );

    expect(ordinarySave).not.toMatch(/\bisAvailable\s*:/);
    expect(ordinarySave).not.toMatch(/\btempUnavailableUntil\s*:/);
  });

  it('keeps availability changes on the dedicated availability endpoint', () => {
    const availabilityUpdate = sourceBetween(
      'async function setItemAvailability',
      'async function applyAvailabilityChoice',
    );

    expect(availabilityUpdate).toContain('/availability');
    expect(availabilityUpdate).toContain('body: JSON.stringify({ mode })');
  });
});
