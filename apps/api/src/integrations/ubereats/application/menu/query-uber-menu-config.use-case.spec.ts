import type { UberMenuConfigQueryPort } from './uber-menu-draft.ports';
import { QueryUberMenuConfigUseCase } from './query-uber-menu-config.use-case';

describe('QueryUberMenuConfigUseCase', () => {
  it('delegates each configuration view to its query port', async () => {
    const listItems = jest.fn().mockResolvedValue({ items: [] });
    const listPublished = jest.fn().mockResolvedValue({ items: [] });
    const listOptions = jest.fn().mockResolvedValue({ items: [] });
    const useCase = new QueryUberMenuConfigUseCase({
      listUberItemChannelConfigs: listItems,
      listUberPublishedMenuItems: listPublished,
      listUberOptionItemConfigs: listOptions,
    } as UberMenuConfigQueryPort);

    await useCase.listItemChannelConfigs('store-1');
    await useCase.listPublishedMenuItems('store-1');
    await useCase.listOptionItemConfigs('store-1');

    expect(listItems).toHaveBeenCalledWith('store-1');
    expect(listPublished).toHaveBeenCalledWith('store-1');
    expect(listOptions).toHaveBeenCalledWith('store-1');
  });
});
