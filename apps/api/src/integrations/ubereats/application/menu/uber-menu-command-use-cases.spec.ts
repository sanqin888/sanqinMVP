import type {
  MenuItemExistenceQueryPort,
  OptionChoiceExistenceQueryPort,
  UberDraftGroupCommandPort,
  UberDraftItemCommandPort,
  UberDraftOptionCommandPort,
  UberItemChannelConfigCommandPort,
  UberMenuWriteTransactionPort,
  UberOptionChildGroupBindCommandPort,
  UberOptionChildGroupUnbindCommandPort,
  UberOptionItemConfigCommandPort,
} from './uber-menu-draft.ports';
import { BindUberDraftOptionChildGroupUseCase } from './bind-uber-draft-option-child-group.use-case';
import { UnbindUberDraftOptionChildGroupUseCase } from './unbind-uber-draft-option-child-group.use-case';
import { UpdateUberDraftGroupUseCase } from './update-uber-draft-group.use-case';
import { UpdateUberDraftItemUseCase } from './update-uber-draft-item.use-case';
import { UpdateUberDraftOptionUseCase } from './update-uber-draft-option.use-case';
import { UpsertUberItemChannelConfigUseCase } from './upsert-uber-item-channel-config.use-case';
import { UpsertUberOptionItemConfigUseCase } from './upsert-uber-option-item-config.use-case';

describe('Uber menu command use cases', () => {
  const transaction = <TCommands>(
    commands: TCommands,
  ): UberMenuWriteTransactionPort<TCommands> => ({
    execute: (work) => work(commands),
  });

  it('exposes only execute as the public command method', () => {
    const useCaseTypes = [
      UpsertUberItemChannelConfigUseCase,
      UpsertUberOptionItemConfigUseCase,
      UpdateUberDraftItemUseCase,
      UpdateUberDraftGroupUseCase,
      UpdateUberDraftOptionUseCase,
      BindUberDraftOptionChildGroupUseCase,
      UnbindUberDraftOptionChildGroupUseCase,
    ];

    for (const UseCase of useCaseTypes) {
      expect(Object.getOwnPropertyNames(UseCase.prototype)).toEqual([
        'constructor',
        'execute',
      ]);
    }
  });

  it('validates item references before entering item write boundaries', async () => {
    const upsert = jest.fn();
    const update = jest.fn();
    const missing = new Error('missing item');
    const references = {
      menuItemExists: jest.fn().mockRejectedValue(missing),
    } satisfies MenuItemExistenceQueryPort;

    const upsertCommands: UberItemChannelConfigCommandPort = {
      upsertUberItemChannelConfig: upsert,
    };
    const updateCommands: UberDraftItemCommandPort = {
      updateUberDraftItem: update,
    };

    await expect(
      new UpsertUberItemChannelConfigUseCase(
        transaction(upsertCommands),
        references,
      ).execute({ menuItemStableId: 'missing', priceCents: 100 }),
    ).rejects.toBe(missing);
    await expect(
      new UpdateUberDraftItemUseCase(
        transaction(updateCommands),
        references,
      ).execute('missing', {}),
    ).rejects.toBe(missing);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('validates option references before entering option write boundaries', async () => {
    const upsert = jest.fn();
    const update = jest.fn();
    const missing = new Error('missing option');
    const references = {
      optionChoiceExists: jest.fn().mockRejectedValue(missing),
    } satisfies OptionChoiceExistenceQueryPort;

    const upsertCommands: UberOptionItemConfigCommandPort = {
      upsertUberOptionItemConfig: upsert,
    };
    const updateCommands: UberDraftOptionCommandPort = {
      updateUberDraftOption: update,
    };

    await expect(
      new UpsertUberOptionItemConfigUseCase(
        transaction(upsertCommands),
        references,
      ).execute({ optionChoiceStableId: 'missing', priceDeltaCents: 100 }),
    ).rejects.toBe(missing);
    await expect(
      new UpdateUberDraftOptionUseCase(
        transaction(updateCommands),
        references,
      ).execute('missing', {}),
    ).rejects.toBe(missing);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('delegates each draft command once to its matching port operation', async () => {
    const updateGroup = jest.fn().mockResolvedValue('updated');
    const bind = jest.fn().mockResolvedValue('bound');
    const unbind = jest.fn().mockResolvedValue('unbound');
    const groupCommands: UberDraftGroupCommandPort = {
      updateUberDraftGroup: updateGroup,
    };
    const bindCommands: UberOptionChildGroupBindCommandPort = {
      bindUberDraftOptionChildGroup: bind,
    };
    const unbindCommands: UberOptionChildGroupUnbindCommandPort = {
      unbindUberDraftOptionChildGroup: unbind,
    };

    await expect(
      new UpdateUberDraftGroupUseCase(transaction(groupCommands)).execute(
        'group-1',
        {},
      ),
    ).resolves.toBe('updated');
    await expect(
      new BindUberDraftOptionChildGroupUseCase(
        transaction(bindCommands),
      ).execute('option-1', 'group-1', 'store-1'),
    ).resolves.toBe('bound');
    await expect(
      new UnbindUberDraftOptionChildGroupUseCase(
        transaction(unbindCommands),
      ).execute('option-1', 'group-1', 'store-1'),
    ).resolves.toBe('unbound');
    expect(updateGroup).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(unbind).toHaveBeenCalledTimes(1);
  });
});
