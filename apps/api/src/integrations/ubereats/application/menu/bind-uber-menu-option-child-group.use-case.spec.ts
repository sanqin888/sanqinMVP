import type { UberMenuDraftMutationPort } from './uber-menu-draft.ports';
import { BindUberMenuOptionChildGroupUseCase } from './bind-uber-menu-option-child-group.use-case';

describe('BindUberMenuOptionChildGroupUseCase', () => {
  it('keeps repeated binding at the idempotent command boundary', async () => {
    const result = {
      ok: true,
      storeId: 'store-1',
      optionItemId: 'option-1',
      groupId: 'group-1',
    };
    const bind = jest.fn().mockResolvedValue(result);
    const useCase = new BindUberMenuOptionChildGroupUseCase({
      bindUberDraftOptionChildGroup: bind,
    } as unknown as UberMenuDraftMutationPort);

    await expect(
      useCase.bind('option-1', 'group-1', 'store-1'),
    ).resolves.toEqual(result);
    await expect(
      useCase.bind('option-1', 'group-1', 'store-1'),
    ).resolves.toEqual(result);
    expect(bind).toHaveBeenNthCalledWith(2, 'option-1', 'group-1', 'store-1');
  });
});
