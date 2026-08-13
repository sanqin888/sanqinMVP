import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  UberMenuWriteCommands,
  UberMenuWriteTransactionPort,
} from '../../application/menu/uber-menu-draft.ports';
import { UberMenuConfigWritePrismaAdapter } from './uber-menu-config-write-prisma.adapter';
import { UberMenuDraftMutationPrismaAdapter } from './uber-menu-draft-mutation-prisma.adapter';
import { UberTelemetryService } from './uber-telemetry.service';

/** Prisma is confined to infrastructure; every callback is one database commit. */
@Injectable()
export class UberMenuWriteTransactionPrismaAdapter implements UberMenuWriteTransactionPort<UberMenuWriteCommands> {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    work: (commands: UberMenuWriteCommands) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.executeOnce(work);
    } catch (error: unknown) {
      // A concurrent first insert can lose the composite-unique race. Replay
      // outside the aborted transaction so Prisma P2002 never leaks outward.
      if (!this.isUniqueConflict(error)) throw error;
      return this.executeOnce(work);
    }
  }

  private executeOnce<T>(
    work: (commands: UberMenuWriteCommands) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      const client = transaction as Prisma.TransactionClient & PrismaService;
      const telemetry = new UberTelemetryService(client);
      const config = new UberMenuConfigWritePrismaAdapter(client, telemetry);
      const draft = new UberMenuDraftMutationPrismaAdapter(client, telemetry);
      const commands: UberMenuWriteCommands = {
        upsertUberItemChannelConfig: (input) =>
          config.upsertUberItemChannelConfig(input),
        upsertUberOptionItemConfig: (input) =>
          config.upsertUberOptionItemConfig(input),
        updateUberDraftItem: (id, input) =>
          draft.updateUberDraftItem(id, input),
        updateUberDraftGroup: (command) => draft.updateUberDraftGroup(command),
        updateUberDraftOption: (id, input) =>
          draft.updateUberDraftOption(id, input),
        bindUberDraftOptionChildGroup: (command) =>
          draft.bindUberDraftOptionChildGroup(command),
        unbindUberDraftOptionChildGroup: (command) =>
          draft.unbindUberDraftOptionChildGroup(command),
      };
      return work(commands);
    });
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
