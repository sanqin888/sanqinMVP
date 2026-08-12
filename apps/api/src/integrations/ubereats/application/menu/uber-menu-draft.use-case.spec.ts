import { UberMenuDraftUseCase } from './uber-menu-draft.use-case';
import type { UberMenuDraftReadPort } from '../ports/uber-menu-draft.ports';

describe('UberMenuDraftUseCase', () => {
  it('delegates getUberMenuDraft to the menu workflow boundary', async () => {
    const workflow = {
      getUberMenuDraft: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = new UberMenuDraftUseCase(
      {} as never,
      {} as never,
      workflow as unknown as UberMenuDraftReadPort,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.getUberMenuDraft('store-1')).resolves.toEqual({
      ok: true,
    });
    expect(workflow.getUberMenuDraft).toHaveBeenCalledWith('store-1');
  });

  it.each([
    [
      'menu item',
      'upsertUberItemChannelConfig',
      { menuItemStableId: 'missing' },
    ],
    [
      'option choice',
      'upsertUberOptionItemConfig',
      { optionChoiceStableId: 'missing' },
    ],
  ])(
    'rejects a missing %s in the application use case',
    async (_, method, input) => {
      const references = {
        findMenuItemByStableId: jest.fn().mockResolvedValue(null),
        findOptionChoiceByStableId: jest.fn().mockResolvedValue(null),
      };
      const service = new UberMenuDraftUseCase(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        references as never,
      );
      await expect(
        (service[method as keyof UberMenuDraftUseCase] as never)(input),
      ).rejects.toMatchObject({
        code: 'UBER_MENU_INPUT_INVALID',
      });
    },
  );

  it('rejects a missing provisioned store mapping in the application use case', async () => {
    const service = new UberMenuDraftUseCase(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findProvisionedStoreMapping: jest.fn().mockResolvedValue(null),
      } as never,
    );
    await expect(
      service.resolveUberStoreIdOrThrow('store-1'),
    ).rejects.toMatchObject({
      code: 'UBER_MENU_INPUT_INVALID',
    });
  });
});
