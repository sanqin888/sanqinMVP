import type {
  UberDraftGroupCommandPort,
  UberDraftItemCommandPort,
  UberDraftOptionCommandPort,
  UberItemChannelConfigCommandPort,
  UberOptionChildGroupBindingCommandPort,
  UberOptionItemConfigCommandPort,
} from './uber-menu-draft.ports';
import type { UberMenuReferenceValidator } from './uber-menu-reference-validator.service';
import { BindUberDraftOptionChildGroupUseCase } from './bind-uber-draft-option-child-group.use-case';
import { UnbindUberDraftOptionChildGroupUseCase } from './unbind-uber-draft-option-child-group.use-case';
import { UpdateUberDraftGroupUseCase } from './update-uber-draft-group.use-case';
import { UpdateUberDraftItemUseCase } from './update-uber-draft-item.use-case';
import { UpdateUberDraftOptionUseCase } from './update-uber-draft-option.use-case';
import { UpsertUberItemChannelConfigUseCase } from './upsert-uber-item-channel-config.use-case';
import { UpsertUberOptionItemConfigUseCase } from './upsert-uber-option-item-config.use-case';

describe('Uber menu command use cases', () => {
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
      ensureMenuItemExists: jest.fn().mockRejectedValue(missing),
    } as unknown as UberMenuReferenceValidator;

    const upsertCommands: UberItemChannelConfigCommandPort = {
      upsertUberItemChannelConfig: upsert,
    };
    const updateCommands: UberDraftItemCommandPort = {
      updateUberDraftItem: update,
    };

    await expect(
      new UpsertUberItemChannelConfigUseCase(
        upsertCommands,
        references,
      ).execute({ menuItemStableId: 'missing', priceCents: 100 }),
    ).rejects.toBe(missing);
    await expect(
      new UpdateUberDraftItemUseCase(updateCommands, references).execute(
        'missing',
        {},
      ),
    ).rejects.toBe(missing);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('validates option references before entering option write boundaries', async () => {
    const upsert = jest.fn();
    const update = jest.fn();
    const missing = new Error('missing option');
    const references = {
      ensureOptionChoiceExists: jest.fn().mockRejectedValue(missing),
    } as unknown as UberMenuReferenceValidator;

    const upsertCommands: UberOptionItemConfigCommandPort = {
      upsertUberOptionItemConfig: upsert,
    };
    const updateCommands: UberDraftOptionCommandPort = {
      updateUberDraftOption: update,
    };

    await expect(
      new UpsertUberOptionItemConfigUseCase(upsertCommands, references).execute(
        { optionChoiceStableId: 'missing', priceDeltaCents: 100 },
      ),
    ).rejects.toBe(missing);
    await expect(
      new UpdateUberDraftOptionUseCase(updateCommands, references).execute(
        'missing',
        {},
      ),
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
    const bindingCommands: UberOptionChildGroupBindingCommandPort = {
      bindUberDraftOptionChildGroup: bind,
      unbindUberDraftOptionChildGroup: unbind,
    };

    await expect(
      new UpdateUberDraftGroupUseCase(groupCommands).execute('group-1', {}),
    ).resolves.toBe('updated');
    await expect(
      new BindUberDraftOptionChildGroupUseCase(bindingCommands).execute(
        'option-1',
        'group-1',
        'store-1',
      ),
    ).resolves.toBe('bound');
    await expect(
      new UnbindUberDraftOptionChildGroupUseCase(bindingCommands).execute(
        'option-1',
        'group-1',
        'store-1',
      ),
    ).resolves.toBe('unbound');
    expect(updateGroup).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(unbind).toHaveBeenCalledTimes(1);
  });
});
