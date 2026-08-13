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

  execute<T>(
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
        updateUberDraftGroup: (id, input) =>
          draft.updateUberDraftGroup(id, input),
        updateUberDraftOption: (id, input) =>
          draft.updateUberDraftOption(id, input),
        bindUberDraftOptionChildGroup: (optionId, groupId, storeId) =>
          draft.bindUberDraftOptionChildGroup(optionId, groupId, storeId),
        unbindUberDraftOptionChildGroup: (optionId, groupId, storeId) =>
          draft.unbindUberDraftOptionChildGroup(optionId, groupId, storeId),
      };
      return work(commands);
    });
  }
}
