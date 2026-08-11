# Uber Eats 目标架构

该 bounded context 固定采用四个最终边界：`domain/`、`application/`、`api/` 与
`infrastructure/`。`contracts/` 是 API 的稳定传输契约，`test/` 是跨边界验收夹具，
二者不承载业务实现。

## Infrastructure 子边界

- `config/`：横切基础设施配置，只负责读取、校验运行时配置；不得依赖 Prisma。
- `persistence/`：唯一允许引用 `@prisma/client`、`PrismaService`、
  `UberPrismaAccessService` 或 Prisma delegate 类型的目录。数据库脚本位于
  `persistence/scripts/`，写数据库的 telemetry sink 也归入该目录。
- `crypto/`、`uber-api/`、`workers/`：分别承载密码学、Uber 传输和进程调度适配器；
  它们通过 application port 或具有业务语义的 repository 协作，不接触 Prisma。

持久化 adapter/repository 必须在边界内把数据库字段映射成 application/domain 类型。
新增代码不得透传 delegate；应提供诸如 `claimDueWebhookEvents`、
`saveMenuPublication`、`findStoreMapping` 的业务语义方法。`UberPrismaAccessService`
仅作为既有持久化实现的内部过渡桥，公开 delegate 属性应在 repository 迁移完成后
逐项删除。
