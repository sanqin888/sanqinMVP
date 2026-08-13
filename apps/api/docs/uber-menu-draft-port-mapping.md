# Uber menu draft 端口迁移映射

草稿相关 HTTP 调用方只有 `UberEatsMenuController`；代码库中没有 GraphQL resolver 或其他运行时调用方。应用边界按只读视图与单一写命令拆分，端口定义集中在 `uber-menu-draft.ports.ts`。引用与 provisioned store 校验由 `UberMenuReferenceValidator` 统一负责。

| HTTP 操作                                             | 独立 use case 方法                                  | 端口方法                                                                 | 实现                                 |
| ----------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `GET menu/channel/items`                              | `QueryUberMenuConfigUseCase.listItemChannelConfigs` | `UberMenuConfigQueryPort.listUberItemChannelConfigs`                     | `UberMenuConfigQueryPrismaAdapter`   |
| `POST menu/channel/items/:id`                         | `UpsertUberItemChannelConfigUseCase.execute`        | `UberItemChannelConfigCommandPort.upsertUberItemChannelConfig`           | `UberMenuConfigWritePrismaAdapter`   |
| `GET menu/channel/options`                            | `QueryUberMenuConfigUseCase.listOptionItemConfigs`  | `UberMenuConfigQueryPort.listUberOptionItemConfigs`                      | `UberMenuConfigQueryPrismaAdapter`   |
| `POST menu/channel/options/:id`                       | `UpsertUberOptionItemConfigUseCase.execute`         | `UberOptionItemConfigCommandPort.upsertUberOptionItemConfig`             | `UberMenuConfigWritePrismaAdapter`   |
| `GET menu/draft`                                      | `ReadUberMenuDraftUseCase.execute`                  | `UberMenuDraftReadPort.getUberMenuDraft`                                 | `UberMenuDraftReadPrismaAdapter`     |
| `PATCH menu/draft/items/:id`                          | `UpdateUberDraftItemUseCase.execute`                | `UberDraftItemCommandPort.updateUberDraftItem`                           | `UberMenuDraftMutationPrismaAdapter` |
| `PATCH menu/draft/groups/:id`                         | `UpdateUberDraftGroupUseCase.execute`               | `UberDraftGroupCommandPort.updateUberDraftGroup`                         | `UberMenuDraftMutationPrismaAdapter` |
| `PATCH menu/draft/options/:id`                        | `UpdateUberDraftOptionUseCase.execute`              | `UberDraftOptionCommandPort.updateUberDraftOption`                       | `UberMenuDraftMutationPrismaAdapter` |
| `POST menu/draft/options/:id/child-groups`            | `BindUberDraftOptionChildGroupUseCase.execute`      | `UberOptionChildGroupBindingCommandPort.bindUberDraftOptionChildGroup`   | `UberMenuDraftMutationPrismaAdapter` |
| `DELETE menu/draft/options/:id/child-groups/:groupId` | `UnbindUberDraftOptionChildGroupUseCase.execute`    | `UberOptionChildGroupBindingCommandPort.unbindUberDraftOptionChildGroup` | `UberMenuDraftMutationPrismaAdapter` |
| `GET menu/draft/diff`                                 | `QueryUberMenuDraftDiffUseCase.execute`             | `UberMenuDraftDiffPort.getUberMenuDraftDiff`                             | `UberMenuDraftDiffPrismaAdapter`     |

已删除的 `UberMenuDraftConfigUseCase` 没有 controller、resolver 或其他运行时调用方；其 `listItems`、`listOptions`、`updateItem`、`updateGroup`、`updateOption` 分别被上表中的 channel 查询和 draft command 方法覆盖。旧 query/command repository 也因此不再注册。

## 写事务边界

所有上表中的写用例都通过 application-owned `UberMenuWriteTransactionPort<TCommands>.execute` 声明提交边界。泛型命令视图确保每个用例只可调用自己需要的写操作；reference validation 在进入事务前完成，而命令写入及其持久化 telemetry/audit 在同一个事务回调中完成。回调（包括持久化 telemetry）抛出异常时，infrastructure 的 Prisma `$transaction` 回滚整个提交；日志和内存指标不是数据库状态，不属于提交边界。本次边界没有 outbox 写入。
