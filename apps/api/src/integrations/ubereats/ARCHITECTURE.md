# Uber Eats 目标架构

该 bounded context 的最终目录只包含 `domain/`、`application/`、`api/`、
`infrastructure/`、`contracts/` 与 `test/`。根目录只保留架构测试以及三个明确入口：

- `ubereats.module.ts`：**唯一 composition root**，负责组装全部 adapter、port、use case
  和 HTTP controller；不得再建立 feature module 聚合层或第二个 facade module。只有该文件可以形成 Nest composition root；允许它导入 `infrastructure/nest/` 下无状态、无 `@Module()` 装饰器的分区 wiring declarations。
- `worker.ts`：专用 Worker 进程的唯一入口，只导出启动 Worker 所需的 provider declarations 与健康检查；
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

## Nest composition declarations

- `infrastructure/nest/` 只承载 Nest 技术装配声明，不属于 domain、application、业务 facade 或公共 API。
- 每个 `*.wiring.ts` 只能导出一个返回 `Provider[]` 的 `createXWiring()` 构建入口；不得包含 `@Module()`、生命周期钩子或导出业务实现。
- wiring 文件只能由 `ubereats.module.ts` 导入，业务代码不得导入它们；wiring 文件之间也不得互相导入，跨分区协作只通过 provider token 的 `inject` 声明，并由 composition root 保证完整注册。
- `ubereats.module.ts` 必须显式列出对外稳定 token，不得通过 wiring 文件提供的 exports 数组隐藏公共边界。

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

API 与 dedicated worker 必须引用同一份运行时配置：限流模式及 Redis HTTP
URL/token 不得分叉。两个进程还必须由 secrets manager 注入完全相同的
`UBER_CREDENTIAL_ENCRYPTION_KEYS` 与 `UBER_CREDENTIAL_ACTIVE_KEY_VERSION`，并设置
`UBER_CREDENTIAL_KEYS_SOURCE=secrets-manager`；Compose 与源码不得保存实际 key。
composition root 的统一启动校验会在各配置 provider 创建前聚合报告所有缺失和冲突项。
