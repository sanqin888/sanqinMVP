import { BadRequestException } from '@nestjs/common';
import { UserLanguage } from '@prisma/client';
import { CustomerService } from './customer.service';

function createService() {
  const findUnique = jest.fn();
  const update = jest.fn();
  const service = new CustomerService(
    {
      user: { findUnique, update },
    } as never,
    { issueProgramsForUser: jest.fn() } as never,
    { notifySubscriptionWelcome: jest.fn() } as never,
  );
  return { service, findUnique, update };
}

describe('CustomerService profile', () => {
  it('allows a legacy month-only member to confirm year and month once', async () => {
    const { service, findUnique, update } = createService();
    findUnique.mockResolvedValue({
      userStableId: 'member-legacy',
      firstName: 'Legacy',
      lastName: 'Member',
      birthdayYear: null,
      birthdayMonth: 5,
      language: UserLanguage.ZH,
    });
    update.mockResolvedValue({
      firstName: 'Legacy',
      lastName: 'Member',
      birthdayYear: 1990,
      birthdayMonth: 6,
      language: UserLanguage.ZH,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-legacy',
        birthdayYear: 1990,
        birthdayMonth: 6,
      }),
    ).resolves.toMatchObject({
      birthdayYear: 1990,
      birthdayMonth: 6,
    });

    expect(update).toHaveBeenCalledWith({
      where: { userStableId: 'member-legacy' },
      data: {
        birthdayYear: 1990,
        birthdayMonth: 6,
      },
      select: {
        firstName: true,
        lastName: true,
        birthdayYear: true,
        birthdayMonth: true,
        language: true,
      },
    });
  });

  it('keeps a complete year-month birthday locked', async () => {
    const { service, findUnique, update } = createService();
    findUnique.mockResolvedValue({
      userStableId: 'member-complete',
      firstName: 'Complete',
      lastName: 'Member',
      birthdayYear: 1990,
      birthdayMonth: 5,
      language: UserLanguage.EN,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-complete',
        birthdayYear: 1991,
        birthdayMonth: 6,
      }),
    ).resolves.toMatchObject({
      birthdayYear: 1990,
      birthdayMonth: 5,
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the minimum-age rule when a legacy member confirms birthday', async () => {
    const { service, findUnique, update } = createService();
    const now = new Date();
    findUnique.mockResolvedValue({
      userStableId: 'member-minor',
      firstName: 'Minor',
      lastName: 'Member',
      birthdayYear: null,
      birthdayMonth: 5,
      language: UserLanguage.EN,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-minor',
        birthdayYear: now.getUTCFullYear() - 12,
        birthdayMonth: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });

  it('updates trimmed names and language without changing birthday', async () => {
    const { service, findUnique, update } = createService();
    findUnique.mockResolvedValue({
      userStableId: 'member-profile',
      firstName: 'Old',
      lastName: 'Name',
      birthdayYear: 1990,
      birthdayMonth: 5,
      language: UserLanguage.ZH,
    });
    update.mockResolvedValue({
      firstName: 'New',
      lastName: 'Member',
      birthdayYear: 1990,
      birthdayMonth: 5,
      language: UserLanguage.EN,
    });

    await expect(
      service.updateProfile({
        userStableId: 'member-profile',
        firstName: ' New ',
        lastName: ' Member ',
        language: 'en',
      }),
    ).resolves.toEqual({
      firstName: 'New',
      lastName: 'Member',
      birthdayYear: 1990,
      birthdayMonth: 5,
      language: 'en',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          firstName: 'New',
          lastName: 'Member',
          language: UserLanguage.EN,
        },
      }),
    );
  });
});
