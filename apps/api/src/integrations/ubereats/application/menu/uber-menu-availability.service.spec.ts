import { UberMenuAvailabilityService } from './uber-menu-availability.service';
import type { UberMenuAvailabilityPort } from '../ports/uber-use-case.ports';

describe('UberMenuAvailabilityService', () => {
  it('delegates item and option commands to the availability port', async () => {
    const port = {
      syncUberMenuItemAvailability: jest.fn().mockResolvedValue({ ok: true }),
      syncUberOptionItemAvailability: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as UberMenuAvailabilityPort;
    const useCase = new UberMenuAvailabilityService(port);
    const item = { menuItemStableId: 'item-1', isAvailable: true };
    const option = { optionChoiceStableId: 'option-1', isAvailable: false };

    await useCase.syncUberMenuItemAvailability(item);
    await useCase.syncUberOptionItemAvailability(option);

    expect(port.syncUberMenuItemAvailability).toHaveBeenCalledWith(item);
    expect(port.syncUberOptionItemAvailability).toHaveBeenCalledWith(option);
  });
});
