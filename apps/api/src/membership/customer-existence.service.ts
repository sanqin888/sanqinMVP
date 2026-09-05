import { Injectable } from '@nestjs/common';
import { PrismaService } from './membership-prisma';
import type { CustomerExistenceReaderPort } from './customer-existence.contract';

@Injectable()
export class CustomerExistenceService implements CustomerExistenceReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async customerExists(userStableId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { userStableId },
      select: { userStableId: true },
    });
    return Boolean(user);
  }
}
