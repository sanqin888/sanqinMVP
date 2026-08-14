import type {
  MenuItemExistenceQueryPort,
  OptionChoiceExistenceQueryPort,
} from './uber-menu-draft.ports';
import {
  ensureMenuItemExists,
  ensureOptionChoiceExists,
} from './uber-menu-reference-validator.service';

describe('Uber menu reference validation', () => {
  it('rejects a missing menu item through its dedicated capability', async () => {
    const menuItems: MenuItemExistenceQueryPort = {
      menuItemExists: jest.fn().mockResolvedValue(false),
    };

    await expect(
      ensureMenuItemExists(menuItems, 'missing-item'),
    ).rejects.toMatchObject({ code: 'UBER_MENU_INPUT_INVALID' });
  });

  it('rejects a missing option choice through its dedicated capability', async () => {
    const optionChoices: OptionChoiceExistenceQueryPort = {
      optionChoiceExists: jest.fn().mockResolvedValue(false),
    };

    await expect(
      ensureOptionChoiceExists(optionChoices, 'missing-option'),
    ).rejects.toMatchObject({ code: 'UBER_MENU_INPUT_INVALID' });
  });
});
