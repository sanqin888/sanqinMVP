import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoyaltyEventProcessor {
  private readonly logger = new Logger(LoyaltyEventProcessor.name);

  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly prisma: PrismaService,
  ) {}

  // ✅ 监听统一的支付成功事件
  @OnEvent('order.paid.verified')
  async handleOrderPaid(payload: {
    orderId: string;
    userId?: string;
    amountCents: number;
  }) {
    const { orderId, userId } = payload;

    this.logger.log(`[Loyalty] Processing points for order: ${orderId}`);

    // 1. 基础校验：如果没有用户ID，通常无法积分 (除非你有手机号积分逻辑)
    if (!userId) {
      this.logger.debug(
        `[Loyalty] Skipped order ${orderId}: No userId linked.`,
      );
      return;
    }

    try {
      // 2. 查单 (为了确保订单状态正确，且防止重复处理)
      // 注意：Prisma 的 findUnique 很重要
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true },
      });

      if (!order) {
        this.logger.warn(`[Loyalty] Order not found: ${orderId}`);
        return;
      }

      // 3. 调用积分服务计算并入账
      // 假设你的 LoyaltyService 有一个 grantPointsForOrder 方法
      // 如果没有，你需要根据你的业务逻辑调用相应的方法，例如 addPoints
      const result = await this.loyaltyService.grantPointsForOrder(order);

      this.logger.log(
        `[Loyalty] Points granted for ${orderId}: ${result.pointsEarned} pts`,
      );
    } catch (error) {
      this.logger.error(
        `[Loyalty] Failed to process loyalty for ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      // 积分失败通常不需要抛出异常阻断流程，记录错误即可，后续可人工补录
    }
  }
}
