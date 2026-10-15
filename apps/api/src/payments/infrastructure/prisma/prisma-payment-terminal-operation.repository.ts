import { Injectable } from '@nestjs/common';
import { Prisma, type PaymentTerminalOperation as Row } from '@prisma/client';

import { PrismaService } from '../../../prisma/prisma.service';
import type {
  PaymentTerminalOperationRepository,
  TerminalCancelClaim,
  TerminalOperation,
} from '../../application/payment-terminal-operation.repository';

@Injectable()
export class PrismaPaymentTerminalOperationRepository
  implements PaymentTerminalOperationRepository
{
  constructor(private readonly prisma: PrismaService) {}

  private map(row: Row): TerminalOperation {
    return {
      terminalId: row.terminalId,
      storeStableId: row.storeStableId,
      attemptId: row.attemptId,
      paymentTransactionId: row.paymentTransactionId,
      externalPaymentId: row.externalPaymentId,
      state: row.state,
      cancelRequestedAt: row.cancelRequestedAt,
    };
  }

  async findByAttemptId(attemptId: string): Promise<TerminalOperation | null> {
    const row = await this.prisma.paymentTerminalOperation.findUnique({
      where: { attemptId },
    });
    return row ? this.map(row) : null;
  }

  async reserve(
    terminalId: string,
    storeStableId: string,
    attemptId: string,
  ): Promise<boolean> {
    const current = await this.prisma.paymentTerminalOperation.findUnique({
      where: { terminalId },
    });
    if (!current) {
      try {
        await this.prisma.paymentTerminalOperation.create({
          data: { terminalId, storeStableId, attemptId, state: 'RESERVED' },
        });
        return true;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) return false;
        throw error;
      }
    }
    if (current.attemptId === attemptId) {
      return current.storeStableId === storeStableId &&
        current.state === 'RESERVED';
    }
    if (current.state !== 'FINALIZED') return false;
    const replaced = await this.prisma.paymentTerminalOperation.updateMany({
      where: {
        terminalId,
        attemptId: current.attemptId,
        state: 'FINALIZED',
      },
      data: {
        storeStableId,
        attemptId,
        paymentTransactionId: null,
        externalPaymentId: null,
        state: 'RESERVED',
        cancelRequestedAt: null,
        cancelAcknowledgedAt: null,
      },
    });
    return replaced.count === 1;
  }

  async claimDispatch(
    attemptId: string,
    paymentTransactionId: string,
    externalPaymentId: string,
  ): Promise<boolean> {
    const claimed = await this.prisma.paymentTerminalOperation.updateMany({
      where: {
        attemptId,
        state: 'RESERVED',
        paymentTransactionId: null,
      },
      data: {
        paymentTransactionId,
        externalPaymentId,
        state: 'SALE_IN_FLIGHT',
      },
    });
    return claimed.count === 1;
  }

  async requestCancel(
    attemptId: string,
    storeStableId: string,
  ): Promise<TerminalCancelClaim> {
    const current = await this.findByAttemptId(attemptId);
    if (!current || current.storeStableId !== storeStableId) {
      return { operation: null, sendDeviceCancel: false, requested: false };
    }
    if (current.state === 'RESERVED' || current.state === 'SALE_IN_FLIGHT') {
      const claimed = await this.prisma.paymentTerminalOperation.updateMany({
        where: {
          attemptId,
          storeStableId,
          state: current.state,
        },
        data: {
          state: 'CANCEL_REQUESTED',
          cancelRequestedAt: new Date(),
        },
      });
      if (claimed.count === 1) {
        return {
          operation: { ...current, state: 'CANCEL_REQUESTED' },
          sendDeviceCancel: current.state === 'SALE_IN_FLIGHT',
          requested: true,
        };
      }
    }
    return {
      operation: await this.findByAttemptId(attemptId),
      sendDeviceCancel: false,
      requested: false,
    };
  }

  async acknowledgeCancel(attemptId: string): Promise<void> {
    await this.prisma.paymentTerminalOperation.updateMany({
      where: { attemptId, state: 'CANCEL_REQUESTED' },
      data: { state: 'CANCEL_ACKED', cancelAcknowledgedAt: new Date() },
    });
  }

  async complete(attemptId: string): Promise<void> {
    await this.prisma.paymentTerminalOperation.updateMany({
      where: {
        attemptId,
        state: {
          in: [
            'RESERVED',
            'SALE_IN_FLIGHT',
            'CANCEL_REQUESTED',
            'CANCEL_ACKED',
          ],
        },
      },
      data: { state: 'FINALIZED' },
    });
  }
}
