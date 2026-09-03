import { MessagingTemplateType } from '@prisma/client';
import { EmailService } from './email.service';

describe('EmailService stable user identity', () => {
  it('resolves the MessagingSend user relation from userStableId', async () => {
    const provider = {
      sendEmail: jest
        .fn()
        .mockResolvedValue({ ok: true, messageId: 'provider-1' }),
    };
    const businessConfigService = {
      getMessagingSnapshot: jest.fn().mockResolvedValue({
        emailFromName: 'SanQ',
        emailFromAddress: 'noreply@sanq.ca',
      }),
    };
    const messagingSendCreate = jest.fn().mockResolvedValue({ id: 'send-1' });
    const prisma = {
      messagingSend: {
        create: messagingSendCreate,
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new EmailService(
      provider as never,
      businessConfigService as never,
      prisma as never,
    );

    await expect(
      service.sendEmail({
        to: 'john@example.com',
        subject: 'Gift',
        text: 'Gift',
        templateType: MessagingTemplateType.SIGNUP_WELCOME,
        userStableId: 'customer-stable-1',
        skipSuppression: true,
      }),
    ).resolves.toMatchObject({ ok: true, sendId: 'send-1' });

    expect(messagingSendCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user: { connect: { userStableId: 'customer-stable-1' } },
        }),
      }),
    );
  });
});
