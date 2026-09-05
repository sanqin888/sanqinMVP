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

const existingUser = {
  id: 'user-db-id',
  userStableId: 'user-stable-id',
  firstName: 'Old',
  lastName: 'Name',
  email: 'old@example.com',
  phone: '14165550100',
  phoneVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  birthdayYear: 1990,
  birthdayMonth: 1,
  language: UserLanguage.EN,
};

describe('CustomerService admin profile administration', () => {
  it('preserves the distinct admin birthday override semantics', async () => {
    const { service, findUnique, update } = createService();
    const currentYear = new Date().getUTCFullYear();
    findUnique.mockResolvedValueOnce(existingUser);
    update.mockResolvedValue({
      userStableId: existingUser.userStableId,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      email: existingUser.email,
      phone: existingUser.phone,
      birthdayYear: currentYear,
      birthdayMonth: 12,
      phoneVerifiedAt: existingUser.phoneVerifiedAt,
    });

    await service.updateProfileAsAdmin({
      userStableId: existingUser.userStableId,
      birthdayYear: currentYear,
      birthdayMonth: 12,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userStableId: existingUser.userStableId },
        data: expect.objectContaining({
          birthdayYear: currentYear,
          birthdayMonth: 12,
        }),
      }),
    );
  });

  it('allows an admin to clear an existing birthday', async () => {
    const { service, findUnique, update } = createService();
    findUnique.mockResolvedValueOnce(existingUser);
    update.mockResolvedValue({
      userStableId: existingUser.userStableId,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      email: existingUser.email,
      phone: existingUser.phone,
      birthdayYear: null,
      birthdayMonth: null,
      phoneVerifiedAt: existingUser.phoneVerifiedAt,
    });

    await service.updateProfileAsAdmin({
      userStableId: existingUser.userStableId,
      birthdayYear: null,
      birthdayMonth: null,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          birthdayYear: null,
          birthdayMonth: null,
        }),
      }),
    );
  });

  it('normalizes a changed phone and clears phone verification', async () => {
    const { service, findUnique, update } = createService();
    findUnique
      .mockResolvedValueOnce(existingUser)
      .mockResolvedValueOnce(null);
    update.mockResolvedValue({
      userStableId: existingUser.userStableId,
      firstName: existingUser.firstName,
      lastName: existingUser.lastName,
      email: existingUser.email,
      phone: '14165550199',
      birthdayYear: existingUser.birthdayYear,
      birthdayMonth: existingUser.birthdayMonth,
      phoneVerifiedAt: null,
    });

    const result = await service.updateProfileAsAdmin({
      userStableId: existingUser.userStableId,
      phone: '+1 (416) 555-0199',
    });

    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { phone: '14165550199' },
      select: { id: true },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phone: '14165550199',
          phoneVerifiedAt: null,
        }),
      }),
    );
    expect(result.phoneVerifiedAt).toBeNull();
  });

  it('keeps the existing invalid-birthday response semantics', async () => {
    const { service, findUnique } = createService();
    findUnique.mockResolvedValueOnce(existingUser);

    await expect(
      service.updateProfileAsAdmin({
        userStableId: existingUser.userStableId,
        birthdayYear: 2000,
        birthdayMonth: 13,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves the Admin address missing-member error message', async () => {
    const { service, findUnique } = createService();
    findUnique.mockResolvedValueOnce(null);

    await expect(
      service.listAddressesAsAdmin({ userStableId: 'missing-user' }),
    ).rejects.toMatchObject({ message: 'member not found' });
  });
});
