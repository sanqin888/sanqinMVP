import type { UberMenuConfigWritePort } from './uber-menu-draft.ports';
import type { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';
import { WriteUberMenuConfigUseCase } from './write-uber-menu-config.use-case';

describe('WriteUberMenuConfigUseCase', () => {
  const input = { menuItemStableId: 'item-1', priceCents: 100 };

  it('does not enter the write transaction when the reference is missing', async () => {
    const writes = { upsertUberItemChannelConfig: jest.fn() };
    const missing = Object.assign(new Error('missing'), {
      code: 'UBER_MENU_INPUT_INVALID',
    });
    const references = {
      ensureMenuItemExists: jest.fn().mockRejectedValue(missing),
    };
    const useCase = new WriteUberMenuConfigUseCase(
      writes as unknown as UberMenuConfigWritePort,
      references as unknown as UberMenuReferenceValidator,
    );
    await expect(useCase.upsertItemChannelConfig(input)).rejects.toBe(missing);
    expect(writes.upsertUberItemChannelConfig).not.toHaveBeenCalled();
  });

  it('propagates transaction failure without retrying the command', async () => {
    const failure = new Error('transaction rolled back');
    const write = jest.fn().mockRejectedValue(failure);
    const useCase = new WriteUberMenuConfigUseCase(
      {
        upsertUberItemChannelConfig: write,
      } as unknown as UberMenuConfigWritePort,
      {
        ensureMenuItemExists: jest.fn().mockResolvedValue(undefined),
      } as unknown as UberMenuReferenceValidator,
    );
    await expect(useCase.upsertItemChannelConfig(input)).rejects.toBe(failure);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
