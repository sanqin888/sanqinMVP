# Uber menu draft 端口映射

草稿与 channel 配置相关的 HTTP 调用方只有 `UberEatsMenuController`。Controller 只负责把已通过 pipe/DTO 校验的 HTTP 输入交给对应 use case 并调用 presenter；引用校验、事务和持久化协调均位于 application/infrastructure 边界。

## HTTP 到 application 的映射

| HTTP 操作                                                       | Controller 注入的 use case                          | application 端口方法                                                    | infrastructure 实现                  |
| --------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------ |
| `GET menu/channel/items`                                        | `QueryUberMenuConfigUseCase.listItemChannelConfigs` | `UberMenuConfigQueryPort.listUberItemChannelConfigs`                    | `UberMenuConfigQueryPrismaAdapter`   |
| `GET menu/published/items`                                      | `QueryUberMenuConfigUseCase.listPublishedMenuItems` | `UberMenuConfigQueryPort.listUberPublishedMenuItems`                    | `UberMenuConfigQueryPrismaAdapter`   |
| `POST menu/channel/items/:menuItemStableId`                     | `UpsertUberItemChannelConfigUseCase.execute`        | `UberItemChannelConfigCommandPort.upsertUberItemChannelConfig`          | `UberMenuConfigWritePrismaAdapter`   |
| `GET menu/channel/options`                                      | `QueryUberMenuConfigUseCase.listOptionItemConfigs`  | `UberMenuConfigQueryPort.listUberOptionItemConfigs`                     | `UberMenuConfigQueryPrismaAdapter`   |
| `POST menu/channel/options/:optionChoiceStableId`               | `UpsertUberOptionItemConfigUseCase.execute`         | `UberOptionItemConfigCommandPort.upsertUberOptionItemConfig`            | `UberMenuConfigWritePrismaAdapter`   |
| `GET menu/draft`                                                | `ReadUberMenuDraftUseCase.execute`                  | `UberMenuDraftReadPort.getUberMenuDraft`                                | `UberMenuDraftReadPrismaAdapter`     |
| `PATCH menu/draft/items/:itemId`                                | `UpdateUberDraftItemUseCase.execute`                | `UberDraftItemCommandPort.updateUberDraftItem`                          | `UberMenuDraftMutationPrismaAdapter` |
| `PATCH menu/draft/groups/:groupId`                              | `UpdateUberDraftGroupUseCase.execute`               | `UberDraftGroupCommandPort.updateUberDraftGroup`                        | `UberMenuDraftMutationPrismaAdapter` |
| `PATCH menu/draft/options/:optionItemId`                        | `UpdateUberDraftOptionUseCase.execute`              | `UberDraftOptionCommandPort.updateUberDraftOption`                      | `UberMenuDraftMutationPrismaAdapter` |
| `GET menu/draft/diff`                                           | `QueryUberMenuDraftDiffUseCase.execute`             | `UberMenuDraftDiffPort.getUberMenuDraftDiff`                            | `UberMenuDraftDiffPrismaAdapter`     |

## Nest token 到实现的映射

| application token                             | 实现                                     |
| --------------------------------------------- | ---------------------------------------- |
| `UBER_MENU_CONFIG_QUERY_PORT`                 | `UberMenuConfigQueryPrismaAdapter`       |
| `UBER_ITEM_CHANNEL_CONFIG_COMMAND_PORT`       | `UberMenuConfigWritePrismaAdapter`       |
| `UBER_OPTION_ITEM_CONFIG_COMMAND_PORT`        | `UberMenuConfigWritePrismaAdapter`       |
| `UBER_MENU_DRAFT_READ_PORT`                   | `UberMenuDraftReadPrismaAdapter`         |
| `UBER_DRAFT_ITEM_COMMAND_PORT`                | `UberMenuDraftMutationPrismaAdapter`     |
| `UBER_DRAFT_GROUP_COMMAND_PORT`               | `UberMenuDraftMutationPrismaAdapter`     |
| `UBER_DRAFT_OPTION_COMMAND_PORT`              | `UberMenuDraftMutationPrismaAdapter`     |
| `UBER_OPTION_CHILD_GROUP_BIND_COMMAND_PORT`   | `UberMenuDraftMutationPrismaAdapter`     |
| `UBER_OPTION_CHILD_GROUP_UNBIND_COMMAND_PORT` | `UberMenuDraftMutationPrismaAdapter`     |
| `UBER_MENU_DRAFT_DIFF_PORT`                   | `UberMenuDraftDiffPrismaAdapter`         |
| `MENU_ITEM_EXISTENCE_QUERY_PORT`              | `UberMenuSupportingQueriesPrismaAdapter` |
| `OPTION_CHOICE_EXISTENCE_QUERY_PORT`          | `UberMenuSupportingQueriesPrismaAdapter` |

## 写事务边界

各写 use case 依赖 `UberMenuWriteTransactionPort<TCommands>`，其中 `TCommands` 是该用例唯一需要的窄 command port。引用存在性校验在 use case 中、事务开始前完成；命令写入及其 durable telemetry event 则由 `UberMenuWriteTransactionPrismaAdapter` 放在同一个 Prisma transaction 中。Controller 不参与引用校验、事务或持久化协调。
