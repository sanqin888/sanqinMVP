import { UserLanguage } from '@prisma/client';
import { MembershipService } from './membership.service';

type MembershipMarketingNotificationSeam = {
  triggerMarketingOptInPrograms(user: {
    id: string;
    userStableId: string;
  }): Promise<void>;
};

describe('MembershipService marketing notification characterization', () => {
  const createService = () => {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    const couponTriggerService = {
      issueProgramsForUser: jest.fn().mockResolvedValue(undefined),
    };
    const customerLifecycleNotification = {
      notifySubscriptionWelcome: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MembershipService(
      prisma as never,
      {} as never,
      couponTriggerService as never,
      customerLifecycleNotification as never,
    );

    return {
      service,
      prisma,
      couponTriggerService,
      customerLifecycleNotification,
    };
  };

  const invokeMarketingOptIn = (service: MembershipService) =>
    (
      service as unknown as MembershipMarketingNotificationSeam
    ).triggerMarketingOptInPrograms({
      id: 'user-db-id',
      userStableId: 'customer-stable-1',
    });

  it('keeps consent in Membership before delivery', async () => {
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
});
