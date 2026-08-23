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
| Menu | `GET/PUT /v2/eats/stores/{store_id}/menus`；`POST /v2/eats/stores/{store_id}/menus/items/{item_id}` | Menu V2 支持全量读取/发布、稀疏 item 更新和发布后对账 |
| Integration Config | `GET/POST/PATCH/DELETE /v1/eats/stores/{store_id}/pos_data` | Activate、Retrieve、Update、Remove 生命周期完整；`webhooks_version=1.0.0` + scheduled webhook enabled |
| Store Management | `GET /v1/delivery/store/{store_id}/status`；`POST /v1/delivery/store/{store_id}/update-store-status`；`POST /v1/delivery/store/{store_id}/update-store-prep-time` | 使用 Uber Store API Suite 读取/写入状态并更新默认准备时间；SanQ 内部 `PAUSED` 语义在 upstream payload 中发送为 Uber `OFFLINE` |
| Webhook 签名 | `X-Uber-Signature` + raw body HMAC-SHA256 | 保持现有 durable receiver |

## OAuth scope contract

SanQ 将 Uber OAuth scope 按 grant type 分离维护。`UBER_EATS_APP_SCOPES` 只声明当前部署预期已获批的
`client_credentials` 权限，不再作为业务请求漏写 scope 时的默认 token scope。当前运行时硬依赖
`eats.store`、`eats.order`、`eats.store.status.write`；`eats.report` 与
`eats.store.orders.read` 仅作为已知可选 app scope 保留，未被当前 endpoint 自动请求。
每次 app API 调用必须显式指定单一 capability scope，并按该 scope 独立缓存 token。

Merchant provisioning 使用独立的 authorization-code scope 集合：业务 scope 为
`eats.pos_provisioning`；Uber 已签发 credential 可能同时包含辅助 `offline_access`，刷新链路允许并验证
这一组合。`eats.pos_provisioning` / `offline_access` 不得进入 client-credentials 配置，app scopes 也
不得进入 merchant OAuth 配置。Store discovery、Activate、Remove 使用显式 merchant token；Retrieve / Update
Integration Config、Menu、Order 与 Store Management app 调用继续按各自最小权限 scope 获取 app token。

## Integration Configuration capability

| Capability | Method / path | Authorization | Production code | Contract evidence |
| ---------- | ------------- | ------------- | --------------- | ----------------- |
| Activate Integration | `POST /v1/eats/stores/{store_id}/pos_data` | merchant OAuth (`eats.pos_provisioning`) | `uber-merchant-api.adapter.ts` | `v1/stores/provision-request.json` |
| Retrieve Integration Config | `GET /v1/eats/stores/{store_id}/pos_data` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | lifecycle wire contract test |
| Update Integration | `PATCH /v1/eats/stores/{store_id}/pos_data` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | lifecycle wire contract test |
| Remove Integration | `DELETE /v1/eats/stores/{store_id}/pos_data` | merchant OAuth (`eats.pos_provisioning`) | `uber-merchant-api.adapter.ts` | lifecycle wire contract test |

SanQ 的 Activate / PATCH 配置只允许 Uber Integration Activation & Configuration 1.0.0
当前可写字段进入 upstream；读取态/弃用字段（例如 `order_manager_client_id`、
`pos_integration_enabled`）以及未知字段会在调用 Uber 前拒绝。`integrator_store_id` 不再接受调用方输入，
而由后端从该 Uber Store mapping 的 `posExternalStoreId`（SanQ 稳定 `Store.storeStableId`）生成；
如果本地 Store ID mapping 缺失或格式无效，Activate / Config 同步会在调用 Uber 前拒绝。Uber Store
wire mapper 只允许 `pos_data.integrator_store_id` 恢复这一 SanQ external store identity，不再把
`order_manager_client_id` 当作门店 ID。后端同时固定 `is_order_manager=true`、
`require_manual_acceptance=false`、`allowed_customer_requests.allow_single_use_items_requests=true`、
`allowed_customer_requests.allow_special_instruction_requests=true`、
`schedule_order_webhooks.is_enabled=true` 与 `webhooks_version=1.0.0`。PATCH API 仍允许显式
`integration_enabled=false` 做临时停用；Activate 不发送该 PATCH-only 字段。Admin UI 不再提供自由 JSON
或独立 `integrator_store_id` 编辑框，Config 同步发送空 payload，由后端 policy 生成正式配置。SanQ 当前不消费
`orders.release` 或 delivery-status webhook，因此 `order_release_webhooks` 与
`delivery_status_webhooks` 只允许显式保持 `false`；尝试开启会在调用 Uber 前拒绝。DELETE 成功后
本地 store mapping 保留用于后续重新 Activate，但 `isProvisioned=false`、`provisionedAt=null`。

## Store Management capability

| Capability | Method / path | Authorization | Production code | Contract evidence |
| ---------- | ------------- | ------------- | --------------- | ----------------- |
| Retrieve Store Status | `GET /v1/delivery/store/{store_id}/status` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | Store Management wire contract test |
| Set Store Status | `POST /v1/delivery/store/{store_id}/update-store-status` | app token (`eats.store.status.write`) | `uber-merchant-api.adapter.ts` | Store Management wire contract test |
| Update Store Prep Time | `POST /v1/delivery/store/{store_id}/update-store-prep-time` | app token (`eats.store`) | `uber-merchant-api.adapter.ts` | Store Management wire contract test |

Store Management 统一使用 Uber 当前 Store API Suite。SanQ 内部仍使用 `PAUSED` 表示暂停目标，
但发送给 Uber 时转换为 `status=OFFLINE`；暂停截止时间发送为 `is_offline_until`，恢复发送
`status=ONLINE`。`default_prep_time` 以秒为单位，SanQ 只接受 `1..10800` 的整数。状态读取、
状态写入和 Prep Time 更新都通过可检查 HTTP response 的 gateway transport 执行，并保留 Uber
实际 HTTP status 到审计记录，用于部署后的 `200` 验收证据。Store Management 只允许已 mapping
且已 provision 的门店执行。

## Menu V2 capability / read-back reconciliation

| Capability | Method / path | Authorization | Production code | Contract evidence |
| ---------- | ------------- | ------------- | --------------- | ----------------- |
| Retrieve Menu | `GET /v2/eats/stores/{store_id}/menus` | app token (`eats.store`) | `uber-menu-publication.adapter.ts` | Menu retrieve wire contract test |
| Upload Menu | `PUT /v2/eats/stores/{store_id}/menus` | app token (`eats.store`) | `uber-menu-publication.adapter.ts` | `v1/menu/upload-request.json` |
| Update Item | `POST /v2/eats/stores/{store_id}/menus/items/{item_id}` | app token (`eats.store`) | `uber-menu-publication.adapter.ts` | existing sparse availability wire contract test |

SanQ 的全量 Menu payload 显式发送
`display_options.disable_item_instructions=false`，因为当前订单解析/打印链路支持 Uber
item-level `customer_request.special_instructions`。Uber 文档将 order-level / customer-request capability
定义在 Integration Configuration，而不是 Menu API；因此 Menu payload 不添加猜测字段，第四步改为在
Provision / Update Integration Config 中显式维护正式的 `allow_special_instruction_requests` 能力开关。

Retrieve Menu 只在 infrastructure 层解析 Uber wire schema；application 获得 semantic read model，
并与 `UberMenuPublishVersion` 中最后一次成功全量 Publish payload 对账。核验范围包括 menu/category/item
ID 与数量、价格、availability、modifier group/option 关系、`dish_info.classifications.preparation_type`，
以及 Uber 有返回时的税率和 `disable_item_instructions`。如果全量 Publish 后又单独执行过 Update Item，
availability 差异可能是后续的预期状态变化，因此管理端明确标注对账基准。

加拿大 FOOD/BEVERAGE 的 Required Metadata Regulations 要求发送 `preparation_type`。Uber Menu V2
wire schema 只允许 `PREPACKAGED` 或空字符串；SanQ 不根据名称或类别猜测商品是否预包装，而是在现有
`UberItemChannelConfig` / `UberOptionItemConfig` 中保存显式语义 `PREPARED | PREPACKAGED`。发送 Uber
时 `PREPARED` 映射为空字符串，`PREPACKAGED` 映射为 `PREPACKAGED`；任一实际要发布的 menu item 或
option item 尚未确认（`null`）时，dry-run 和真实 Publish 都必须在调用 Uber 前以
`UBER_PREPARATION_TYPE_REQUIRED` 阻断。GET read-back reconciliation 同样核对该字段。历史成功 Publish
JSON 可能没有 `dish_info`；这种旧基线只跳过 `preparation_type` 单字段比较，其他字段继续严格对账，
直到下一次带显式分类的成功全量 Publish 建立新基线。

税务契约继续使用现有 `tax_info.tax_rate`（tax-exclusive percentage）。Uber 公共 Menu V2 schema
把 `tax_label_info` 定义为可选字段，Quality 标准也只要求 Tax Categories “where applicable”；Canada
Required Metadata Regulations 没有把 `tax_label_info` 列为加拿大强制字段，因此本次不猜测 tax label。
Quality 标准中的 Store-level Tax Area ID 明确以 ZIP+4 描述；SanQ 当前加拿大门店不使用美国 ZIP+4，
本次也不构造公共 Menu Upload schema 中未定义的 tax-area 字段。Production verification 时如 Uber
Tech Support 给出加拿大账户专属要求，再按正式契约补充，而不是预先猜值。

## Order Fulfillment API 1.0.0 capability

| Capability | Method / path | Scope | Production code | Contract evidence |
| ---------- | ------------- | ----- | --------------- | ----------------- |
| Order detail | `GET /v1/delivery/order/{order_id}?expand=carts,payment`；scheduled 追加 `deliveries` | `eats.order` | `infrastructure/uber-api/uber-order-detail.gateway.ts` | `v1/orders/detail*.json` |
| Accept | `POST /v1/delivery/order/{order_id}/accept` | `eats.order` | `uber-resource.gateways.ts` + `uber-order-action.gateway.ts` | `v1/orders/accept-request.json` |
| Deny | `POST /v1/delivery/order/{order_id}/deny` | `eats.order` | 同上 | `v1/orders/deny-request.json` |
| Ready | `POST /v1/delivery/order/{order_id}/ready` | `eats.order` | 同上 | `v1/orders/ready-request.json` |
| Cancel | `POST /v1/delivery/order/{order_id}/cancel` | `eats.order` | 同上 | `v1/orders/cancel-request.json` |
| Menu | `PUT/GET /v2/eats/stores/{store_id}/menus` | `eats.store` | `uber-menu-publication.adapter.ts` | `v1/menu/*` |

ACCEPT / DENY / READY 只有 Uber 实际返回文档规定的 HTTP `200` 才可完成本地 action；CANCEL 必须实际
返回文档规定的 HTTP `204`。其他状态（包括意外的其他 2xx、`404/409`）都不得转换成“重复操作成功”。
成功码由 infrastructure adapter 精确验证后，application 才按该已确认契约值写入既有
`UberOrderAction.uberHttpStatus`；失败 status 继续由 `markFailed` 保存。因此 Sandbox verification
可以直接用 action row 证明 Uber HTTP 结果，而不是仅凭本地 Order 状态推断成功。

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

### Customer Request / Allergy relay

Provision / Update Integration Config 固定声明
`allowed_customer_requests.allow_single_use_items_requests=true` 与
`allowed_customer_requests.allow_special_instruction_requests=true`。SanQ 接受 Uber 的一次性餐具选择，
并继续完整传递特殊备注；结构化 Allergy Requests 仍由 Uber 在 integration verification 后启用。

Order Fulfillment API 1.0.0 的 `carts[].include_single_use_items` 是 boolean，不提供数量字段。SanQ 将
`true/false` 规范化为双语订单备注 `餐具 / Utensils: 是 / Yes` / `餐具 / Utensils: 否 / No`，与
`carts[].special_instructions` 一起进入 `externalOrderNotes`，由 POS 订单详情和收银打印共同展示；不得
根据菜品数量猜测餐具套数。Order Fulfillment API 1.0.0 的 `customer_request.special_instructions` 继续进入现有
`externalSpecialInstructions` → POS/打印链路。结构化 allergy 使用
`customer_request.allergy.allergens[]` 与 `customer_request.allergy.instructions`；SanQ 将其完整合并到
同一菜品备注中，以 `ALLERGY:` / `ALLERGY INSTRUCTIONS:` 明确标识。递归 modifier/option 自身的
customer request 也汇总到父菜品备注，并带 `OPTION REQUEST (...)` 标识，确保 POS/打印不依赖
Uber 专用 modifier 明细表才能看到特殊请求。Order-level `carts[].special_instructions` 继续进入
`externalOrderNotes` 并打印。

若 `customer_request` / allergy 字段结构损坏、出现 1.0.0 契约外未知请求字段，或值类型无法可靠解析，
解析结果为 `UNRELAYABLE_CUSTOMER_REQUEST`，订单在持久化/接单前自动 DENY，并使用 Uber 支持的
`SPECIAL_INSTRUCTIONS` reason。Uber 可能返回空 allergy 占位；空数组/空 instructions 视为没有
实际 allergy request，不触发拒单。不得静默忽略真实或损坏的特殊请求。

门店食品安全策略必须使用真正的 `StoreConfig`，不得新增到 transitional `BusinessConfig`：

- `allergyHandlingMode=RELAY_ALL`：默认行为；所有结构合法的 allergy request 继续接单并完整转发。
- `allergyHandlingMode=DENY_LIST`：递归汇总 item 与 modifier/option 的结构化
  `allergy.allergens[]`，与 `StoreConfig.unsupportedAllergens[]` 做大小写无关匹配；任一命中即在
  正常 Order 持久化前 standalone DENY，reason=`SPECIAL_INSTRUCTIONS`。
- `allergyHandlingMode=DENY_ALL`：只要存在真实结构化 allergy request（包括只有 allergy
  instructions、没有 allergen code 的请求）即在正常 Order 持久化前 standalone DENY。
- 普通 `special_instructions` / 自由文本不做关键词识别或过敏原推断，只按既有链路原样传至 POS/打印。
- `DENY_LIST` 的管理端使用固定复选框，不接受自由文本 code。复选项与当前“过敏原说明”页列出的厨房相关
  过敏原保持一致：小麦/含麸质谷物（`GLUTEN`）、花生（`PEANUTS`）、坚果类（`TREENUTS`）、
  芝麻（`SESAME`）、鸡蛋（`EGGS`）、牛奶/乳制品（`DAIRY`）、大豆（`SOY`）、亚硫酸盐
  （`SULPHITES`）和甲壳类/虾（`SHELLFISH`）。API 保存时仍执行 trim + uppercase + 去重，作为
  服务端防御性校验；SanQ 不根据菜品内容或自由文本猜测 allergen。若门店希望所有未知/不可判断 allergy
  都拒绝，应使用 `DENY_ALL`。
- allergy policy DENY 不创建正常本地 Order；后续 `orders.failure` 由 standalone DENY action 的
  `SUCCEEDED` 状态作为合法终态上下文消费，避免 webhook dead-letter。

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

若 SanQ 在 admission 阶段已成功执行 standalone DENY（订单因此从未落本地 `Order`），后续同一
external order 的 `orders.failure` 是该拒单的合法终态，按 no-op 成功处理，不能继续重试到 DEAD。
其余“本地订单尚未导入且没有成功 DENY”的 early failure 仍保持可重试，等待更早的订单事件完成。

非 1.0.0 cancellation webhook 不属于 SanQ 当前 Order contract，不提供兼容 parser。

## Phase D pre-production E2E verification matrix

下表区分“自动化契约已覆盖”和“必须在部署后的 Uber Sandbox/Test Store 留真实证据”。单元/契约测试
只能证明 SanQ 的映射、幂等、状态机和持久化规则，不能冒充 Uber 实际 HTTP 成功。

| Scenario | Automated evidence | Sandbox / Test Store evidence required before Phase D closes |
| -------- | ------------------ | ------------------------------------------------------------ |
| Immediate order receive + ACCEPT | webhook/detail parser、admission、ready-time policy、action service/HTTP contract | `orders.notification` 只导入一次；ACCEPT 实际 HTTP `200`；`UberOrderAction.uberHttpStatus=200`；本地订单进入 accepted/paid 流程且只打印一次 |
| Scheduled order receive + ACCEPT | scheduled webhook/detail、pickup/ready fallback、scheduled activation/finalize tests | `orders.scheduled.notification` 入预约队列；ACCEPT 实际 HTTP `200`；不得把 delivery target fallback 回传为 `ready_for_pickup_time`；到制作窗口后只激活/打印一次 |
| Merchant DENY | admission DENY policy、reason mapper、durable action tests | 用 Test Store 制造可拒场景；DENY 实际 HTTP `200`；action row 保存 `200`；admission-stage standalone DENY 不创建正常本地 `Order` |
| Merchant CANCEL | cancel command/payload、state-machine、durable action tests | 对已接订单执行取消；CANCEL 实际 HTTP `204`；action row 保存 `204`；本地终态与 Uber 一致 |
| READY_FOR_PICKUP | ready command/transition tests | 对制作中订单执行 ready；实际 HTTP `200`；action row 保存 `200`；本地订单只推进一次 |
| `orders.failure` after Uber cancellation/failure | failure webhook parser/handler、early-failure retry、post-DENY terminal no-op tests | Test Store 触发可观察的 failure/cancel 终态；webhook `200`；已有订单正确落取消终态；standalone DENY 后的 failure 不进入 DEAD |
| Duplicate webhook / replay | webhook inbox unique-event/idempotency tests | 如 Sandbox 可重放相同 event，则不得重复建单、重复 enqueue action 或重复打印；无法人为重放时以自动化证据 + inbox 唯一键作为门禁 |
| POS offline / not ready | connectivity admission policy + persisted DENY intent tests | 在可控测试窗口模拟 POS offline；订单应走 DENY 而不是静默接单；恢复连接后不得补出重复订单/打印 |
| Special instructions + single-use items | Order 1.0 parser、ingestion、POS view/print payload tests | Test Store 下包含 order/item special instructions 与餐具选择的订单，POS 与打印内容逐字可见 |
| Structured allergy request | recursive allergy parser、StoreConfig `RELAY_ALL`/`DENY_LIST`/`DENY_ALL`、print tests | Uber 在 integration verification 后启用该能力时，用真实 structured allergy request 验证 relay 或 policy DENY；未启用前不得伪造“已实测通过” |
| Menu PUT → GET read-back | payload validation、Menu V2 wire contract、full reconciliation tests | 发布测试菜单成功后 GET read-back；menu/category/item/modifier、价格、availability、税率（如返回）、`preparation_type` 对账无差异 |
| Update Item | sparse availability contract + reconciliation semantics | 下架/恢复一个测试 item，Uber 返回成功；GET/read-back 或 Test Store UI 观察状态变化，并确认不会被误判成全量 Publish 漂移 |

上述 Sandbox 证据全部属于 Phase D 的部署后实测收尾；Phase E 才处理 Production App、白名单、正式 webhook、
Tech Support verification 和 pilot-store production provisioning。

## Legacy Order API 退役门禁

Uber Order bounded-context 不得重新引入旧 Order detail/action API。architecture regression
必须阻止旧 detail path、旧 accept action path、旧 deny action path 回到 production、tests、
fixtures 或文档。该规则**只针对 Order capability**，不能误伤合法的 Menu `/v2/eats/...`
endpoint。