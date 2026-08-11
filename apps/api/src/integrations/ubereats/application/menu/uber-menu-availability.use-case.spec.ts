import { UberMenuAvailabilityUseCase } from './uber-menu-availability.use-case';
import type { UberMenuAvailabilityPort } from '../ports/uber-use-case.ports';

describe('UberMenuAvailabilityUseCase', () => {
  it('delegates item and option commands to the availability port', async () => {
    const syncItem = jest.fn().mockResolvedValue({ ok: true });
    const syncOption = jest.fn().mockResolvedValue({ ok: true });
    const port = {
      syncUberMenuItemAvailability: syncItem,
      syncUberOptionItemAvailability: syncOption,
    } as unknown as UberMenuAvailabilityPort;
    const useCase = new UberMenuAvailabilityUseCase(port);
    const item = { menuItemStableId: 'item-1', isAvailable: true };
    const option = { optionChoiceStableId: 'option-1', isAvailable: false };

    await useCase.syncUberMenuItemAvailability(item);
    await useCase.syncUberOptionItemAvailability(option);

    expect(syncItem).toHaveBeenCalledWith(item);
    expect(syncOption).toHaveBeenCalledWith(option);
  });
});
