import { UserLanguage } from '@prisma/client';
import { CustomerService } from './customer.service';

type CustomerMarketingNotificationSeam = {
  triggerMarketingOptInPrograms(user: {
    id: string;
    userStableId: string;
  }): Promise<void>;
};

function createService() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const couponTriggerService = {
    issueProgramsForUser: jest.fn().mockResolvedValue(undefined),
  };
  const customerLifecycleNotification = {
    notifySubscriptionWelcome: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CustomerService(
    prisma as never,
    couponTriggerService as never,
    customerLifecycleNotification as never,
  );

  return {
    service,
    prisma,
    couponTriggerService,
    customerLifecycleNotification,
  };
}

const invokeMarketingOptIn = (service: CustomerService) =>
  (
    service as unknown as CustomerMarketingNotificationSeam
  ).triggerMarketingOptInPrograms({
    id: 'user-db-id',
    userStableId: 'customer-stable-1',
  });

describe('CustomerService marketing consent', () => {
  it('keeps consent in Customer before delivery', async () => {
    const {
      service,
      prisma,
      couponTriggerService,
      customerLifecycleNotification,
    } = createService();
    prisma.user.findUnique.mockResolvedValue({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      firstName: 'San',
      lastName: 'Qin',
      language: UserLanguage.EN,
      marketingEmailOptIn: true,
    });

    await invokeMarketingOptIn(service);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-db-id' },
      select: {
        userStableId: true,
        email: true,
        firstName: true,
        lastName: true,
        language: true,
        marketingEmailOptIn: true,
      },
    });
    expect(
      customerLifecycleNotification.notifySubscriptionWelcome,
    ).toHaveBeenCalledWith({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      firstName: 'San',
      lastName: 'Qin',
      language: 'EN',
    });
    expect(couponTriggerService.issueProgramsForUser).toHaveBeenCalledWith(
      'MARKETING_OPT_IN',
      'customer-stable-1',
    );
  });

  it('skips delivery without consent but keeps coupon trigger', async () => {
    const {
      service,
      prisma,
      couponTriggerService,
      customerLifecycleNotification,
    } = createService();
    prisma.user.findUnique.mockResolvedValue({
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      firstName: null,
      lastName: null,
      language: UserLanguage.ZH,
      marketingEmailOptIn: false,
    });

    await invokeMarketingOptIn(service);

    expect(
      customerLifecycleNotification.notifySubscriptionWelcome,
    ).not.toHaveBeenCalled();
    expect(couponTriggerService.issueProgramsForUser).toHaveBeenCalledWith(
      'MARKETING_OPT_IN',
      'customer-stable-1',
    );
  });

  it('triggers welcome and benefits only on false to true transition', async () => {
    const {
      service,
      prisma,
      couponTriggerService,
      customerLifecycleNotification,
    } = createService();
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-db-id',
        marketingEmailOptIn: false,
        email: 'member@example.com',
      })
      .mockResolvedValueOnce({
        userStableId: 'customer-stable-1',
        email: 'member@example.com',
        firstName: 'San',
        lastName: 'Qin',
        language: UserLanguage.EN,
        marketingEmailOptIn: true,
      });
    prisma.user.update.mockResolvedValue({
      id: 'user-db-id',
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      marketingEmailOptIn: true,
      marketingEmailOptInAt: new Date(),
    });

    await service.updateMarketingConsent({
      userStableId: 'customer-stable-1',
      marketingEmailOptIn: true,
    });

    expect(
      customerLifecycleNotification.notifySubscriptionWelcome,
    ).toHaveBeenCalledTimes(1);
    expect(couponTriggerService.issueProgramsForUser).toHaveBeenCalledTimes(1);
  });

  it('clears consent timestamp without welcome or benefit triggers on opt-out', async () => {
    const {
      service,
      prisma,
      couponTriggerService,
      customerLifecycleNotification,
    } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-db-id',
      marketingEmailOptIn: true,
      email: 'member@example.com',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-db-id',
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      marketingEmailOptIn: false,
      marketingEmailOptInAt: null,
    });

    await service.updateMarketingConsent({
      userStableId: 'customer-stable-1',
      marketingEmailOptIn: false,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          marketingEmailOptIn: false,
          marketingEmailOptInAt: null,
        },
      }),
    );
    expect(
      customerLifecycleNotification.notifySubscriptionWelcome,
    ).not.toHaveBeenCalled();
    expect(couponTriggerService.issueProgramsForUser).not.toHaveBeenCalled();
  });

  it('does not repeat welcome or benefit trigger when already opted in', async () => {
    const {
      service,
      prisma,
      couponTriggerService,
      customerLifecycleNotification,
    } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-db-id',
      marketingEmailOptIn: true,
      email: 'member@example.com',
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-db-id',
      userStableId: 'customer-stable-1',
      email: 'member@example.com',
      marketingEmailOptIn: true,
      marketingEmailOptInAt: new Date(),
    });

    await service.updateMarketingConsent({
      userStableId: 'customer-stable-1',
      marketingEmailOptIn: true,
    });

    expect(
      customerLifecycleNotification.notifySubscriptionWelcome,
    ).not.toHaveBeenCalled();
    expect(couponTriggerService.issueProgramsForUser).not.toHaveBeenCalled();
  });
});
