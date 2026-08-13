# Uber Eats requirement matrix（wire contract v1）

> **升级门禁：** `fixtures/uber-contract/v1/manifest.json`、本文档和
> `uber-contract-fixtures.spec.ts` 必须在 API 版本升级时同步更新。fixture 只能含合成、
> 脱敏数据。

本矩阵追踪的是**永久兼容的 Uber wire contract**，即 Uber HTTP 请求/响应、webhook、
OAuth、错误和签名在版本边界上的可观察行为。内部类名、共享 delegate、旧
service/workflow、`modules/`、`composition/` 与 capabilities/facade 聚合入口只是
**应被删除的内部迁移兼容层**，不属于需求或兼容性承诺，也不得进入本矩阵。其他 bounded
context 永久只能经 `public-api.ts` 使用业务能力，并分别经 `ubereats.module.ts` 或
`worker.ts` 完成 API/Worker 进程装配。

Webhook 的公开接收边界只接受 headers 与未经解析的 `rawBody` 字节。曾供本系统迁移使用的
已解析 `body`、envelope 顶层 `resource_id`，以及 menu `data.store_id`、
`data.resource_id`、`data.errors[].field_path/description` 不属于 Uber v1 wire contract，
已经删除且不提供长期兼容。下表及 manifest 所列位置才是必须长期兼容的 wire shape。

### Webhook 接收与异步处理边界

HTTP 接收阶段只校验签名、解析最小 envelope、计算幂等键，并以一次原子数据库操作提交
inbox。只有提交成功（包括已经提交过的重复事件）才返回 `200`。签名或 envelope 无效时
返回非 2xx；inbox 写入/事务失败返回 `503`。这些错误发生时系统尚未取得事件的持久所有权，
因此应由 Uber 外部重投。

一旦 inbox 已安全提交，原请求必须返回 `200`，Worker 才异步解析业务 payload 并调用
handler。handler 超时进入 `FAILED_RETRYABLE` 并由 inbox 内部重试；非法业务 payload 进入
`FAILED_TERMINAL`；未知事件进入 `UNSUPPORTED` 隔离；重试耗尽进入 `DEAD`。这些状态都不得
改变原 webhook HTTP 响应，也不得返回 `503` 请求 Uber 再投，否则会同时启动外部投递和
内部重试。运营恢复必须基于已持久化的 inbox 记录完成。

| 阶段 | 情况 | HTTP | 重试所有者 |
| ---- | ---- | ---- | ---------- |
| 接收 | 签名/envelope 无效，未入箱 | 非 2xx | Uber 外部重投 |
| 接收 | inbox 数据库提交失败 | `503` | Uber 外部重投 |
| 接收 | 新事件已提交或重复事件已存在 | `200` | 系统内部 inbox |
| Worker | handler 超时/可重试故障 | 原响应保持 `200` | inbox 重试至成功或 `DEAD` |
| Worker | 非法业务 payload | 原响应保持 `200` | `FAILED_TERMINAL`，人工处置 |
| Worker | unsupported event | 原响应保持 `200` | `UNSUPPORTED`，支持后 replay |

## 核对边界（2026-08-12 UTC）

本次核对以 Uber Developers 正式页面 **Authentication**、**Uber Eats API**、
**Webhooks** 及仓库已经冻结的 wire fixture 为依据。执行环境没有 Uber Developer
Dashboard 登录会话，因而**无法访问特定应用的 Products、Scopes、Webhooks/Primary
webhook URL 或获批环境配置**；下表的“代码配置”不能冒充“后台已批准”。上线门禁要求
应用所有者在 Dashboard 导出/截图逐项复核 client id（须脱敏）、grant、获批 scope、
webhook URL、订阅事件和 signing key 来源。任何未复核项不得标成 production-ready。

| 核对项            | 正式契约 / 当前代码配置                                                                                                                                                                                   | 核对结论与上线门禁                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| OAuth grant       | app token：`POST /oauth/v2/token`、`client_credentials`；商户授权：authorization code，refresh 使用 `refresh_token`                                                                                       | wire test 已冻结；Dashboard grant/scopes 待应用所有者复核                                                              |
| Scope             | `eats.store`、`eats.order`、`eats.store.orders.read`、`eats.pos_provisioning`、`eats.store.status.write`                                                                                                  | 均是逐 endpoint 的代码请求值，不代表该应用已获批                                                                       |
| 订单 endpoint     | detail：`GET /v2/eats/order/{order_id}`（通知的 `resource_href`）；accept/deny：`POST /v1/eats/orders/{order_id}/{accept_pos_order \| deny_pos_order}`；ready：`POST /v1/delivery/order/{order_id}/ready` | 与 v1 fixture/wire test 一致；应用环境可用性待 smoke test                                                              |
| 菜单 endpoint     | `PUT /v2/eats/stores/{store_id}/menus`；`GET /v2/eats/stores/{store_id}/menus`                                                                                                                            | 与 v1 fixture/wire test 一致                                                                                           |
| Webhook 签名      | `X-Uber-Signature`，对未经重序列化的 raw body 作 HMAC-SHA256，bare 64 位 hex，常量时间比较                                                                                                                | signing key 必须取 Dashboard Primary webhook URL；不得用 access token；轮换 active/previous key                        |
| Webhook 超时/重投 | receiver 先验签、durable enqueue 后立即应答；业务处理不得处于 HTTP 临界路径。Uber Eats 私有页面中的精确超时、次数和退避当前不可见                                                                         | **不得猜测数值**；Dashboard/正式商户文档复核后方可冻结。内部 inbox 当前最多 8 次、指数退避（与 Uber 投递重试相互独立） |
| API 限流          | HTTP `429`；读取 `Retry-After`，无有效值时使用本地退避；按 store + operation 限流                                                                                                                         | 官方/应用级 quota 数值不可见，不写死猜测 quota；上线前压测且复核 Dashboard quota                                       |

## API capability

| Capability            | Method / path                                                     | Requested scope                       | Production code                                  | Contract evidence                                    |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| OAuth app token       | `POST /oauth/v2/token`                                            | capability scopes                     | `infrastructure/uber-api/uber-token.provider.ts` | `uber-token.provider.spec.ts`; `v1/oauth/*`          |
| Merchant provisioning | `GET /v1/eats/stores`; `POST /v1/eats/stores/{store_id}/pos_data` | `eats.store`, `eats.pos_provisioning` | `uber-merchant-api.adapter.ts`                   | `uber-gateways.wire.contract.spec.ts`; `v1/stores/*` |
| Order detail          | `GET /v2/eats/order/{order_id}`                                   | `eats.store.orders.read`              | `uber-order-detail.gateway.ts`                   | `v1/orders/detail.json`                              |
| Order actions         | accept/deny/ready paths（见上）                                   | `eats.order`                          | `uber-resource.gateways.ts`                      | `v1/orders/*-request.json`                           |
| Menu                  | `PUT/GET /v2/eats/stores/{store_id}/menus`                        | `eats.store`                          | `uber-menu-publication.adapter.ts`               | `v1/menu/*`                                          |
| Store status write    | `POST /v1/eats/stores/{store_id}/status`                          | `eats.store.status.write`             | `uber-merchant-api.adapter.ts`                   | gateway wire test                                    |

## `ProcessUberWebhookInboxUseCase` 事件清单

“v1”是本仓库 wire contract 版本；Uber envelope 没有 version 字段。所有 schema 都允许
未知附加字段，但要求列出的标识字段非空。事件名严格大小写匹配 parser，接收路由仅在
`normalizeUberEventType` 后匹配。

| 官方事件名             | 版本 | payload schema（必需字段）                                                                                          | 处理策略                                                                                           | 脱敏 fixture / contract test                                               |
| ---------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `orders.notification`  | v1   | 标准 envelope：`event_type`, `resource_href`, `meta.resource_id`（order）, `meta.user_id`（store）；`event_id` 可选 | 独立 lifecycle parser；拉取/导入订单并保存 ordering metadata                                       | `v1/webhooks/orders.notification.json`; `ubereats-events.contract.spec.ts` |
| `orders.cancel`        | v1   | 标准 envelope；resource 是被取消 order                                                                              | 独立 cancellation parser；进入订单导入/状态机，不复用 notification parser                          | `v1/webhooks/orders.cancel.json`; `ubereats-events.contract.spec.ts`       |
| `menus.notification`   | v1   | menu notification 的 `meta.user_id`, `meta.resource_id`, `data.status`（失败时 `data.failure_info.errors[]`）       | 独立 menu parser；确认发布结果                                                                     | `v1/webhooks/menus.notification.json`; events contract test                |
| `store.provisioned`    | v1   | 标准 envelope；`meta.resource_id` 是 store                                                                          | 独立 provisioning parser；本地 `isProvisioned=true` + 脱敏 telemetry                               | `v1/webhooks/store.provisioned.json`; events contract test                 |
| `store.deprovisioned`  | v1   | 同 provisioning schema                                                                                              | 独立 provisioning parser；本地 `isProvisioned=false` + 脱敏 telemetry                              | `v1/webhooks/store.deprovisioned.json`; events contract test               |
| `store.status.changed` | v1   | 标准 envelope；`meta.resource_id` 是 store；status 为附加 wire 字段                                                 | 独立 status parser；**明确 quarantine**，不标记成功、不只写 telemetry；待本地状态映射获批后 replay | `v1/webhooks/store.status.changed.json`; events + worker contract tests    |
| 其他                   | —    | 仅保留可安全摘要                                                                                                    | quarantine，记录 payload SHA-256 前 16 位，不记录 payload                                          | replay/worker tests                                                        |

## 别名与退役

`orders.accepted`、`orders.in_progress`、`orders.making`、`orders.ready_for_pickup`、
`orders.completed`、`orders.cancelled`、`orders.rejected` 不能在本次可访问的正式契约中
建立证据，已从支持 switch 删除并立即 quarantine。它们**不是历史兼容版本**，因此不设
虚假的退役日期。若应用所有者能提供正式版本化文档，须新增独立 parser、fixture、测试、
`businessVersion` 和明确退役日期后才能恢复。

## 凭据与 smoke test

Sandbox smoke test 不属于常规 Jest 测试集合；使用 `pnpm --filter api test:uber-smoke`
显式运行。CI 仅在专用 `UBER_SANDBOX_*` secrets 全部存在时运行该命令；若环境将
`UBER_SANDBOX_SMOKE_REQUIRED` 配置为 `true`，凭据不完整会令检查失败。测试不得打印 request body、Authorization、token response、
signing key、商户或顾客资料；生产凭据不得复制到 fixture 或报告。
