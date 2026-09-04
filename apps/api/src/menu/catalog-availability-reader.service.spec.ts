import { CatalogAvailabilityReaderService } from './catalog-availability-reader.service';

describe('CatalogAvailabilityReaderService', () => {
  it('projects canonical item availability facts for external-channel consumers', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      stableId: 'item-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: new Date('2090-01-02T03:04:05.000Z'),
      fixedComponents: [{ id: 'component-db-1' }],
    });
    const service = new CatalogAvailabilityReaderService({
      menuItem: { findFirst },
    } as never);

    await expect(
      service.getMenuItemAvailabilitySnapshot(' item-1 '),
    ).resolves.toEqual({
      stableId: 'item-1',
      visibility: 'PUBLIC',
      publishToUberEats: true,
      tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
      hasFixedComponents: true,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { stableId: 'item-1', deletedAt: null },
      select: {
        stableId: true,
        visibility: true,
        publishToUberEats: true,
        tempUnavailableUntil: true,
        fixedComponents: { select: { id: true } },
      },
    });
  });

  it('projects option suspend-until without exposing Prisma models', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      stableId: 'option-1',
      tempUnavailableUntil: new Date('2090-01-02T03:04:05.000Z'),
    });
    const service = new CatalogAvailabilityReaderService({
      menuOptionTemplateChoice: { findFirst },
    } as never);

    await expect(
      service.getOptionAvailabilitySnapshot('option-1'),
    ).resolves.toEqual({
      stableId: 'option-1',
      tempUnavailableUntil: '2090-01-02T03:04:05.000Z',
    });
  });
});
