import type {
  UberMenuDraftCommandPort,
  UberMenuDraftQueryPort,
} from '../ports/uber-menu-draft.ports';
import { UberMenuDraftConfigUseCase } from './uber-menu-draft-config.use-case';

describe('UberMenuDraftConfigUseCase', () => {
  const queries = {} as UberMenuDraftQueryPort;
  const commands: jest.Mocked<UberMenuDraftCommandPort> = {
    updateItem: jest.fn(),
    updateGroup: jest.fn(),
    updateOption: jest.fn(),
  };
  const useCase = new UberMenuDraftConfigUseCase(queries, commands);

  beforeEach(() => jest.clearAllMocks());

  it('only sends supported typed fields and returns a stable result', async () => {
    await expect(
      useCase.updateItem('store-1', 'item-1', {
        priceCents: 1299,
        displayName: undefined,
      }),
    ).resolves.toEqual({
      entity: 'item',
      storeId: 'store-1',
      stableId: 'item-1',
      updated: true,
    });
    expect(commands.updateItem).toHaveBeenCalledWith('store-1', 'item-1', {
      priceCents: 1299,
    });
  });

  it('rejects invalid or empty changes before persistence', async () => {
    await expect(
      useCase.updateGroup('store-1', 'group-1', {
        minSelect: 2,
        maxSelect: 1,
      }),
    ).rejects.toThrow('minSelect <= maxSelect');
    await expect(
      useCase.updateOption('store-1', 'option-1', {}),
    ).rejects.toThrow('at least one supported draft field');
    expect(commands.updateGroup).not.toHaveBeenCalled();
    expect(commands.updateOption).not.toHaveBeenCalled();
  });
});
