import {
  INestApplication,
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  // 用 Node 进程事件做优雅关停，避免 $on('beforeExit') 的类型问题
  enableShutdownHooks(app: INestApplication): void {
    process.once('beforeExit', () => {
      void app.close();
    });
  }
}
