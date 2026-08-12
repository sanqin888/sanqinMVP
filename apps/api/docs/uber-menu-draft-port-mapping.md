# Uber menu draft 端口迁移映射

草稿相关 HTTP 调用方只有 `UberEatsMenuController`；代码库中没有 GraphQL resolver 或其他运行时调用方。统一后的应用边界是 `UberMenuDraftUseCase`，端口定义集中在 `uber-menu-draft.ports.ts`。

| HTTP 操作 | 统一 use case 方法 | 端口方法 | 实现 |
| --- | --- | --- | --- |
| `GET menu/channel/items` | `listUberItemChannelConfigs` | `UberMenuConfigQueryPort.listUberItemChannelConfigs` | `UberMenuConfigQueryPrismaAdapter` |
| `POST menu/channel/items/:id` | `upsertUberItemChannelConfig` | `UberMenuConfigWritePort.upsertUberItemChannelConfig` | `UberMenuConfigWritePrismaAdapter` |
| `GET menu/channel/options` | `listUberOptionItemConfigs` | `UberMenuConfigQueryPort.listUberOptionItemConfigs` | `UberMenuConfigQueryPrismaAdapter` |
| `POST menu/channel/options/:id` | `upsertUberOptionItemConfig` | `UberMenuConfigWritePort.upsertUberOptionItemConfig` | `UberMenuConfigWritePrismaAdapter` |
| `GET menu/draft` | `getUberMenuDraft` | `UberMenuDraftReadPort.getUberMenuDraft` | `UberMenuDraftReadPrismaAdapter` |
| `PATCH menu/draft/items/:id` | `updateUberDraftItem` | `UberMenuDraftMutationPort.updateUberDraftItem` | `UberMenuDraftMutationPrismaAdapter` |
| `PATCH menu/draft/groups/:id` | `updateUberDraftGroup` | `UberMenuDraftMutationPort.updateUberDraftGroup` | `UberMenuDraftMutationPrismaAdapter` |
| `PATCH menu/draft/options/:id` | `updateUberDraftOption` | `UberMenuDraftMutationPort.updateUberDraftOption` | `UberMenuDraftMutationPrismaAdapter` |
| `POST menu/draft/options/:id/child-groups` | `bindUberDraftOptionChildGroup` | `UberMenuDraftMutationPort.bindUberDraftOptionChildGroup` | `UberMenuDraftMutationPrismaAdapter` |
| `DELETE menu/draft/options/:id/child-groups/:groupId` | `unbindUberDraftOptionChildGroup` | `UberMenuDraftMutationPort.unbindUberDraftOptionChildGroup` | `UberMenuDraftMutationPrismaAdapter` |
| `GET menu/draft/diff` | `getUberMenuDraftDiff` | `UberMenuDraftDiffPort.getUberMenuDraftDiff` | `UberMenuDraftDiffPrismaAdapter` |

已删除的 `UberMenuDraftConfigUseCase` 没有 controller、resolver 或其他运行时调用方；其 `listItems`、`listOptions`、`updateItem`、`updateGroup`、`updateOption` 分别被上表中的 channel 查询和 draft mutation 方法覆盖。旧 query/command repository 也因此不再注册。
