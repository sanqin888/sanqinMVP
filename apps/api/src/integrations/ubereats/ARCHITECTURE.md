# Uber Eats 目标架构

该 bounded context 的最终目录只包含 `domain/`、`application/`、`api/`、
`infrastructure/`、`contracts/` 与 `test/`。根目录只保留架构测试以及三个明确入口：

- `ubereats.module.ts`：**唯一 composition root**，负责组装全部 adapter、port、use case
  和 HTTP controller；不得再建立 feature module 聚合层或第二个 facade module。
- `worker.ts`：专用 Worker 进程的唯一入口，只导出启动 Worker 所需的 module 与健康检查；
  进程 bootstrap 从该文件导入，不得深层导入 `infrastructure/workers/`。
- `public-api.ts`：该 bounded context 面向其他业务上下文的唯一公共能力入口，只公开稳定
  token、port 和跨上下文 DTO；外部代码不得导入内部实现。

`contracts/` 是稳定的 Uber wire contract，`test/` 是跨边界验收夹具，二者不承载业务
实现。最终结构不允许 `modules/`、`composition/`、聚合 capabilities/facade 或其他迁移
目录。

## 依赖方向

- `domain` 只能依赖 `domain`。
- `application` 只能依赖 `application`、`domain` 与 `contracts`，并以 application-owned
  port 表达所有外部能力。
- `api` 只能依赖 `api`、`application` 与 `contracts`。
- `infrastructure` 可以依赖 `infrastructure`、`application`、`domain` 与 `contracts`，
  但任何内层不得反向依赖它。
- `contracts` 只能依赖 `contracts` 与无框架的 `domain` 值类型。
- `ubereats.module.ts` 是上述规则的唯一例外点：只有它可以同时看到并装配所有边界。

边界外调用者只能使用 `public-api.ts`、`ubereats.module.ts` 或 `worker.ts`；其中业务能力
一律经 `public-api.ts` 使用。禁止外部深层导入 `api/`、`application/`、`domain/`、
`contracts/`、`infrastructure/` 或任何内部文件。

## Infrastructure 子边界

- `config/`：横切基础设施配置，只负责读取、校验运行时配置；不得依赖 Prisma。
- `persistence/`：唯一允许引用 `@prisma/client`、`PrismaService`、
  Prisma delegate 类型或公开 delegate 属性的目录。数据库脚本位于
  `persistence/scripts/`，写数据库的 telemetry sink 也归入该目录。
- `crypto/`、`uber-api/`、`workers/`：分别承载密码学、Uber 传输和进程调度适配器；
  它们通过 application port 或具有业务语义的 repository 协作，不接触 Prisma。

持久化 adapter/repository 必须在边界内把数据库字段映射成 application/domain 类型。
任何代码都不得透传或共享 delegate；repository 必须提供诸如
`claimDueWebhookEvents`、`saveMenuPublication`、`findStoreMapping` 的业务语义方法。

## API quota coordination

`UBER_EATS_RATE_LIMITER_MODE` is mandatory. Use `distributed` for normal production
and configure `UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL` plus
`UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN`; the coordinator atomically shares token
buckets, concurrency leases, and `Retry-After` cooldown by merchant/store partition.
`process` is intended for development. Production may use it only when
`UBER_EATS_SINGLE_REPLICA=true` explicitly documents a single-replica deployment.
Operation weights have conservative defaults and can be overridden with
`UBER_EATS_API_OPERATION_WEIGHTS`.
