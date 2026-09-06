import type {
  OperationsAlertRecipient,
  OperationsAlertRecipientPort,
} from './operations-alert-recipient.contract';
import type { PrismaService } from './identity-prisma';

export class OperationsAlertRecipientService implements OperationsAlertRecipientPort {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveAdminRecipients(): Promise<OperationsAlertRecipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      },
      select: {
        userStableId: true,
        email: true,
        phone: true,
        language: true,
      },
    });

    return users.flatMap((user) => {
      const email = user.email?.trim() || null;
      const phone = user.phone?.trim() || null;
      if (!email && !phone) return [];
      return [
        {
          userStableId: user.userStableId,
          email,
          phone,
          language: user.language === 'ZH' ? ('ZH' as const) : ('EN' as const),
        },
      ];
    });
  }
}
