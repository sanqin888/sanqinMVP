# Uber Eats requirement matrix（wire contract v1）

> **升级门禁：** `fixtures/uber-contract/v1/manifest.json`、本文档和
> `uber-contract-fixtures.spec.ts` 必须在 API 契约升级时同步更新。fixture 只能含合成、
> 脱敏数据。

本矩阵追踪 SanQ 当前支持的 Uber wire contract。这里的 “v1” 是**仓库 fixture/wire
contract 版本**；Uber 自身不同 API Suite 独立版本化。Order 使用 **Order Fulfillment API
1.0.0** 不代表 Menu、Store、OAuth 等 capability 必须统一到 URL `/v1`。例如 Menu 当前仍可
合法使用 `/v2/eats/stores/...`。

其他 bounded context 永久只能经 `public-api.ts` 使用 Uber 业务能力，并分别经
`ubereats.module.ts` 或 `worker.ts` 完成 API/Worker 进程装配。Uber wire schema 不得泄漏到
Orders domain；订单 detail 必须先映射为 `ParsedUberOrder`。

## Webhook 接收与异步处理边界

HTTP 接收阶段只校验签名、解析最小 envelope、计算幂等键，并以一次原子数据库操作提交
inbox。只有提交成功（包括已经提交过的重复事件）才返回 `200`。签名或 envelope 无效时
返回非 2xx；inbox 写入/事务失败返回 `503`。

一旦 inbox 已安全提交，原请求保持 `200`，Worker 异步解析业务 payload。handler 超时或
可重试故障进入内部重试；未知事件隔离。业务处理失败不得重新把已经安全接管的 webhook
交还给 Uber 外部重投。

| 阶段 | 情况 | HTTP | 重试所有者 |
| ---- | ---- | ---- | ---------- |
| 接收 | 签名/envelope 无效，未入箱 | 非 2xx | Uber 外部重投 |
| 接收 | inbox 数据库提交失败 | `503` | Uber 外部重投 |
| 接收 | 新事件已提交或重复事件已存在 | `200` | SanQ inbox |
| Worker | handler 可重试故障 | 原响应保持 `200` | SanQ inbox |
| Worker | unsupported event | 原响应保持 `200` | 隔离，待契约支持后 replay |

## 核对边界（2026-08-20）

本次 Order 迁移以 Uber Developers 正式 **Order Fulfillment API (1.0.0)**、**Webhooks**、
**Integration Configuration** 文档，以及 Test Store 实际 1.0.0 webhook/detail shape 为依据。

Test Store 当前配置：

```json
{
  "webhooks_config": {
    "schedule_order_webhooks": { "is_enabled": true },
    "webhooks_version": "1.0.0"
  }
}
```

Order Fulfillment 1.0.0 的 `orders.notification`、`orders.scheduled.notification`、
`orders.failure` resource 均使用 `/v1/delivery/order/{order_id}`。Detail 的 `carts`、
`payment` 默认可省略，所以普通单显式请求 `expand=carts,payment`；预约单另外请求
`deliveries`，用于在 Uber 未提供 `preparation_time` 时读取 courier pickup ETA。

| 核对项 | 正式契约 / 当前代码配置 | 结论 |
| ------ | ------------------------ | ---- |
| OAuth grant | app token：`POST /oauth/v2/token`、`client_credentials` | 保持现有 capability token provider |
| Order scope | `eats.order` | Order detail/actions 不再切 `eats.store.orders.read` |
| Order detail | `GET /v1/delivery/order/{order_id}?expand=carts,payment`；scheduled 追加 `deliveries` | Order Fulfillment API 1.0.0 唯一 detail 路径 |
| Order actions | `POST /v1/delivery/order/{order_id}/{accept\|deny\|ready\|cancel}` | 四种业务 action 使用同一 API Suite |
| Menu | `PUT/GET /v2/eats/stores/{store_id}/menus` | Menu capability 独立版本；本任务不修改 |
| Integration Config | `GET/POST/PATCH/DELETE /v1/eats/stores/{store_id}/pos_data` | Activate、Retrieve、Update、Remove 生命周期完整；`webhooks_version=1.0.0` + scheduled webhook enabled |
| Store Management | `GET /v1/eats/store/{store_id}/status`；现有 `POST /v1/eats/store/{store_id}/status`；`POST /v1/delivery/store/{store_id}/update-store-prep-time` | 新增真实状态读取和默认准备时间更新；现有暂停/恢复行为保持不变 |
| Webhook 签名 | `X-Uber-Signature` + raw body HMAC-SHA256 | 保持现有 durable receiver |

## Integration Configuration capability

| Capability | Method / path | Authorization | Production code | Contract evidence |
| ---------- | ------------- | ------------- | --------------- | ----------------- |
| Activate Integration | `POST /v1/eats/stores/{store_id}/pos_data` | merchant OAuth (`eats.pos_provisioning`) | `uber-merchant-api.adapter.ts` | `v1/stores/provision-request.json` |
| Retrieve Integration Config | `GET /v1/eats/stores/{store_id}/pos_data` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | lifecycle wire contract test |
| Update Integration | `PATCH /v1/eats/stores/{store_id}/pos_data` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | lifecycle wire contract test |
| Remove Integration | `DELETE /v1/eats/stores/{store_id}/pos_data` | merchant OAuth (`eats.pos_provisioning`) | `uber-merchant-api.adapter.ts` | lifecycle wire contract test |

SanQ 的 PATCH 配置继续强制 `schedule_order_webhooks.is_enabled=true` 与
`webhooks_version=1.0.0`，避免管理员更新其他 integration 字段时破坏预约单 webhook
契约。DELETE 成功后本地 store mapping 保留用于后续重新 Activate，但
`isProvisioned=false`、`provisionedAt=null`。

## Store Management capability

| Capability | Method / path | Authorization | Production code | Contract evidence |
| ---------- | ------------- | ------------- | --------------- | ----------------- |
| Retrieve Store Status | `GET /v1/eats/store/{store_id}/status` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | Store Management wire contract test |
| Set Store Status | `POST /v1/eats/store/{store_id}/status` | app token (`eats.store.status.write`) | `uber-merchant-api.adapter.ts` | existing status write contract test |
| Update Store Prep Time | `POST /v1/delivery/store/{store_id}/update-store-prep-time` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | Store Management wire contract test |

Retrieve Store Status 与现有 pause/resume 使用同一门店状态能力；本次不改变现有状态写入
行为。`default_prep_time` 以秒为单位，SanQ 只接受 `1..10800` 的整数。Prep Time 更新通过
可检查 HTTP response 的 gateway transport 执行，保留 Uber 实际 HTTP status 到审计记录，
用于部署后的 `200` 验收证据。Store Management 只允许已 mapping 且已 provision 的门店执行。

## Order Fulfillment API 1.0.0 capability

| Capability | Method / path | Scope | Production code | Contract evidence |
| ---------- | ------------- | ----- | --------------- | ----------------- |
| Order detail | `GET /v1/delivery/order/{order_id}?expand=carts,payment`；scheduled 追加 `deliveries` | `eats.order` | `infrastructure/uber-api/uber-order-detail.gateway.ts` | `v1/orders/detail*.json` |
| Accept | `POST /v1/delivery/order/{order_id}/accept` | `eats.order` | `uber-resource.gateways.ts` + `uber-order-action.gateway.ts` | `v1/orders/accept-request.json` |
| Deny | `POST /v1/delivery/order/{order_id}/deny` | `eats.order` | 同上 | `v1/orders/deny-request.json` |
| Ready | `POST /v1/delivery/order/{order_id}/ready` | `eats.order` | 同上 | `v1/orders/ready-request.json` |
| Cancel | `POST /v1/delivery/order/{order_id}/cancel` | `eats.order` | 同上 | `v1/orders/cancel-request.json` |
| Menu | `PUT/GET /v2/eats/stores/{store_id}/menus` | `eats.store` | `uber-menu-publication.adapter.ts` | `v1/menu/*` |

### Order detail mapper contract

SanQ 只接受 Order Fulfillment 1.0.0 **Get Order response** shape：顶层必须是
`{ "order": MerchantOrder }`，不得把裸 `MerchantOrder` 当作兼容 response。关键映射：

- `order.id` → `ParsedUberOrder.externalOrderId`
- `order.store.id` → Uber store mapping key
- `order.carts[].items[]` → domain order items
- `cart_item_id` → `payment.payment_detail.item_charges.price_breakdown[]` 金额关联键
- `payment.payment_detail.order_total` → order total / tax
- `payment.payment_detail.item_charges` → subtotal / promotions / line pricing
- `preparation_time.ready_for_pickup_time` → Uber kitchen-ready time
- `deliveries[].estimated_pick_up_time` → Uber courier pickup ETA；仅在 scheduled detail 读取
- `scheduled_order_target_delivery_time_range.start_time` → 顾客目标送达窗口起点；它**不是**
  Uber kitchen-ready time，也不得直接作为 `ready_for_pickup_time` 回传

不得恢复 `item.price`、`payment.charges`、顶层 `items/total/total_cents` 等旧 Order schema
fallback，也不得增加裸 MerchantOrder response fallback。

### Immediate / Scheduled

`orders.notification`：

- `fulfillmentTiming = IMMEDIATE`
- `scheduledReadyAt = null`
- ACCEPT ready time 使用 SanQ 通用金额准备时间策略计算 absolute RFC3339
  `ready_for_pickup_time`

`orders.scheduled.notification`：

- `fulfillmentTiming = SCHEDULED`
- 本地 `scheduledReadyAt` 代表门店应完成制作、可交给 courier / 顾客的时间，不代表顾客
  delivery window
- 优先 `scheduledReadyAt = preparation_time.ready_for_pickup_time`
- 若 Uber 未提供 `preparation_time`，其次使用最早的
  `deliveries[].estimated_pick_up_time`
- 若 `DELIVERY_BY_UBER` 在 Test Store / 初始 scheduled detail 中两种 pickup estimate 都缺失，
  最后才使用本地保守 fallback：
  `scheduled_order_target_delivery_time_range.start_time - 30 minutes`
- 上述 30 分钟只是 SanQ 在缺少 Uber 动态 pickup ETA 时的本地 fallback，**不是** Uber 固定
  配送时长；生产订单只要 Uber 提供动态 pickup estimate 就不得套用该 fallback
- 非 `DELIVERY_BY_UBER` 的 scheduled pickup 不扣上述配送 fallback
- `externalEstimatedReadyAt` 仍只保存 Uber `preparation_time.ready_for_pickup_time`
- Scheduled ACCEPT 只有在 `externalEstimatedReadyAt` 存在时才发送
  `ready_for_pickup_time`；不得把 courier ETA 或本地 delivery fallback 冒充为 Uber
  kitchen-ready estimate 回传
- Orders bounded-context 再从 `scheduledReadyAt` 扣除 SanQ 通用金额准备时长得到
  `prepStartAt`
- 后续 activation / prep-start / POS print 继续由 Orders bounded-context 的通用 scheduled
  fulfillment + durable lifecycle/outbox 机制负责

Fulfillment timing 由 webhook contract 决定，不通过 detail `status` 猜测。Scheduled **不是**
新的 `OrderStatus`。

## Order webhook 清单

| 官方事件名 | API 配置 | 处理策略 | Contract fixture |
| ---------- | -------- | -------- | ---------------- |
| `orders.notification` | Order Fulfillment 1.0.0 | 拉取 v1 detail，映射并 admission/import | `webhooks/orders.notification.json` |
| `orders.scheduled.notification` | 1.0.0 + scheduled enabled | 与普通单共用 mapper；增加 deliveries expansion 并解析 scheduled timing | `webhooks/orders.scheduled.notification.json` |
| `orders.failure` | Order Fulfillment 1.0.0 | 已存在本地订单时直接按 external order id 落 cancellation；不要求 detail 再次可读 | `webhooks/orders.failure.json` |

非 1.0.0 cancellation webhook 不属于 SanQ 当前 Order contract，不提供兼容 parser。

## Legacy Order API 退役门禁

Uber Order bounded-context 不得重新引入旧 Order detail/action API。architecture regression
必须阻止旧 detail path、旧 accept action path、旧 deny action path 回到 production、tests、
fixtures 或文档。该规则**只针对 Order capability**，不能误伤合法的 Menu `/v2/eats/...`
endpoint。