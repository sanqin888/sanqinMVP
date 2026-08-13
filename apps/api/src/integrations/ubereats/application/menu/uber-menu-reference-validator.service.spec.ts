import type { UberMenuReferenceQueryPort } from './uber-menu-draft.ports';
import { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';

describe('UberMenuReferenceValidator', () => {
  const references = (overrides: Partial<UberMenuReferenceQueryPort> = {}) =>
    ({
      findMenuItemByStableId: jest.fn().mockResolvedValue(null),
      findOptionChoiceByStableId: jest.fn().mockResolvedValue(null),
      findProvisionedStoreMapping: jest.fn().mockResolvedValue(null),
      readBusinessSchedule: jest.fn().mockResolvedValue(null),
      ...overrides,
    }) as UberMenuReferenceQueryPort;

  it('rejects missing menu items and option choices', async () => {
    const validator = new UberMenuReferenceValidator(references());
    await expect(
      validator.ensureMenuItemExists('missing-item'),
    ).rejects.toMatchObject({
      code: 'UBER_MENU_INPUT_INVALID',
    });
    await expect(
      validator.ensureOptionChoiceExists('missing-option'),
    ).rejects.toMatchObject({ code: 'UBER_MENU_INPUT_INVALID' });
  });

  it('resolves only a provisioned store mapping', async () => {
    const validator = new UberMenuReferenceValidator(references());
    await expect(
      validator.resolveProvisionedUberStoreId('store-1'),
    ).rejects.toMatchObject({ code: 'UBER_MENU_INPUT_INVALID' });
  });
});
