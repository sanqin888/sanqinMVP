# SanQ 支付域模块化 + Clover POS 实时同步任务目标与边界

**状态：** Implementation Charter v1  
**日期：** 2026-08-25  
**适用范围：** SanQ Payments / Clover / POS / Orders 的支付相关边界

## 1. 文档目的

本文档用于在正式修改支付代码前固定本次改造的任务目标、系统边界、兼容上线原则、状态语义、阶段门禁和最终完成定义。

后续实现必须优先遵守仓库 `AGENTS.md`、GitHub Actions、architecture tests、现有模块边界和既有实现方式。若实现过程中发现必须突破本文档约定的边界，应先说明原因、影响和替代方案，并获得明确授权后再修改。

本次改造的最高原则：

> 在不中断当前生产 POS 银行卡支付能力的前提下，建立独立 Payment bounded context，接入 Clover POS Terminal 实时支付，并在充分实测和生产稳定后移除旧人工链路。

## 2. 当前状态基线

### 2.1 Web / Ecommerce Clover

当前 Web CARD / Apple Pay / Google Pay 已通过 Clover Ecommerce `/v1/charges` 完成实际扣款，现有能力包括：

- `CheckoutIntent`
- server-side pricing quote / pricing token
- payment attempt / `externalPaymentId` / idempotency key
- Clover charge status verification
- amount / currency / payment ID 校验
- unresolved reconciliation
- 支付成功后创建 Order
- surcharge reconciliation
- 支付失败处理

该链路目前属于生产有效链路，本次改造不得在早期阶段破坏其现有对外行为。

### 2.2 POS CARD

当前 POS CARD 主链路为：

```text
POS 选择 CARD
  -> POST /pos/orders
  -> paymentMethod=CARD
  -> SanQ 直接创建订单
  -> 打印 / 入订单看板
```

SanQ 当前不会发起 Clover Terminal 支付、等待顾客刷卡、获取 Clover payment ID、确认扣款成功或自动恢复网络中断后的真实支付结果。因此当前 POS `CARD` 只是 SanQ 内部支付方式记录，不是 Clover 支付事实。

### 2.3 POS Refund

当前 in-store CARD 退款为 staff-confirmed 模式：员工先在 Clover 设备上人工退款，再回 SanQ POS 登记退款。SanQ 不发起 Clover refund / void，也不能自动确认 Clover 是否实际完成退款。

### 2.4 当前架构缺口

当前 `CloverModule` 直接依赖 `OrdersModule`，`CloverPayController` 同时承担 checkout metadata、contact verification、pricing、payment、Clover transport、reconciliation、order creation 和 payment alert。若继续在现有结构中加入 Terminal / refund / webhook，会进一步扩大模块职责，因此本次改造应同时建立独立 Payments 边界。

## 3. 核心任务目标

### 3.1 建立独立 Payment bounded context

新增正式 `PaymentsModule` / Payments bounded context。Payment 成为“资金事实”的唯一业务域，负责表达：

- payment / payment attempt
- processing / succeeded / declined / cancelled / unknown / reconciliation
- refund / void
- 实际扣款金额、surcharge、退款金额
- provider transaction IDs
- payment source / provider / device 等资金事实

Orders 不再承担支付 Provider 的内部细节。

### 3.2 Clover 变成 Payment Provider

SanQ 支付域定义 Provider port，Clover 作为 infrastructure implementation。建议能力包括：

```text
PaymentProvider
  - startPayment
  - getPaymentStatus
  - cancelPayment
  - voidPayment
  - refundPayment
```

Clover 具体实现可区分：

- Clover Ecommerce Gateway
- Clover Terminal / REST Pay Display Gateway
- Clover OAuth / Device integration
- Clover Webhook adapter

Clover wire response 必须先映射为 SanQ Payment domain model，不得泄漏到 Orders / POS domain。

### 3.3 POS CARD 改为“先支付、后创建订单”

最终 CARD 主链路必须变为：

```text
POS 选择 CARD
  -> 创建 PaymentTransaction
  -> 发起 Clover Terminal payment
  -> Clover 返回明确成功
  -> Payment = SUCCEEDED
  -> 创建 Order
  -> 绑定 Payment <-> Order
  -> 打印
  -> 进入订单看板
```

在 Clover 未确认成功前，不得创建已支付 Order、打印正式订单、推进制作状态或发放支付后才能成立的会员权益。

### 3.4 POS 支付状态实时反馈

POS 必须能够显示 Terminal unavailable / waiting / processing / success / declined / cancelled / unknown / refund processing 等状态。优先复用 SanQ 现有实时通信能力，不得通过高频浏览器轮询模拟“实时”。后端 reconciliation 可以作为可靠性兜底。

### 3.5 支持资金状态恢复

网络异常时不能把“没有收到 response”等价为“支付失败”。必须支持 `UNKNOWN` / `RECONCILING` 语义。

例如 Clover 已扣款但 response 丢失时，不得提示员工直接重新刷卡；必须使用稳定的 `externalPaymentId` / provider payment ID / idempotency key 查询真实结果，防止重复扣款。

### 3.6 POS Refund / Void 自动化

新 CARD Order 的退款最终应由 SanQ 发起：

```text
POS 请求退款
  -> Payments 定位原 PaymentTransaction
  -> Clover Void / Refund
  -> Clover 明确成功或 reconciliation 最终确认
  -> Payment 更新
  -> Orders 更新 refunded / amendment
  -> Loyalty / balance 等既有退款副作用按现有规则执行
```

不得在 Clover 未确认退款成功时提前把 Order 标记为 refunded。

### 3.7 Clover -> SanQ 反向同步

Clover webhook 用于外部 payment update、Dashboard/device refund 等反向同步和最终一致性。Webhook 不作为 POS 刷卡成功的唯一主确认路径；主链路优先使用当前支付请求的同步/状态结果，Webhook + reconciliation 负责外部变化和恢复。

### 3.8 Web 与 POS 最终统一资金事实模型

现有 `CheckoutIntent` 保留：

```text
CheckoutIntent = checkout / 支付会话意图
PaymentTransaction = 实际资金交易
Order = 商业订单
```

允许一次 CheckoutIntent 对应多个 Payment attempt，例如第一次失败、第二次成功。现有 Web Ecommerce 支付应在后续阶段逐步写入 `PaymentTransaction`，但不得为了模型统一破坏现有 Web 支付 UX/API。

## 4. 永久架构边界

### 4.1 Orders 不认识 Clover

Orders 可以知道 `paymentMethod`、支付汇总、`paymentTotalCents`、`creditCardSurchargeCents` 等订单事实，但不得知道：

- Clover REST URL / OAuth / RAID / Device protocol
- Clover wire payload / webhook schema
- Clover refund API payload

### 4.2 Payments 不拥有订单业务

Payments 负责资金是否成功移动、provider transaction、reconciliation、refund/void 结果；不得负责菜品、modifier、kitchen、print payload、fulfillment、ready/making 或 Uber lifecycle。

### 4.3 PaymentsModule 不直接依赖 OrdersModule internals

本次模块化不得仅把 `Clover -> Orders` 换成 `Payments -> Orders`。推荐关系为：

```text
          Orchestrator
           /       \
          v         v
     Payments     Orders
```

协调层可以同时调用 Payments 和 Orders，但两个 bounded context 不应互相穿透内部实现。

### 4.4 POS 不直接实现 Clover transport

POS UI / PosModule 只能调用 SanQ Payment application API；不得拼 Clover URL、持有 Clover secret、实现 OAuth、解析 raw provider schema 或自行决定 reconciliation。

### 4.5 Clover infrastructure 不决定订单状态

Clover adapter 只将 provider result 转成 Payment domain result；不得直接创建 Order、打印、修改 kitchen status、修改 Uber 状态或发放 loyalty。

### 4.6 Provider schema 不得越界

Clover wire contract 必须停留在 Payments infrastructure / Clover adapter 内。跨 bounded context 只能使用 SanQ 自己定义的 Payment ID、status、money、provider、source、refund result 和 payment summary。

## 5. Payment 核心数据边界

建议建立通用 `PaymentTransaction`，而不是 `CloverPosPayment`。最低应能表达：

- internal payment identity
- optional `orderId` / `checkoutIntentId`
- provider / source / paymentMethod / operation
- amount / surcharge / charged total / refunded amount / currency
- status / failure/result code / timestamps
- `externalPaymentId`
- provider payment/refund/order IDs
- idempotency key
- terminal/card facts（仅保存 provider 合法返回且确有业务用途的字段）

原始 provider payload 不应无限制成为核心业务模型；如确有审计需要，应明确字段、脱敏和 retention policy。

## 6. Payment 状态语义

状态必须区分确定失败与未知结果，最低应覆盖：

```text
CREATED
  -> PROCESSING
       -> SUCCEEDED
       -> DECLINED
       -> CANCELLED
       -> UNKNOWN
            -> RECONCILING
                 -> SUCCEEDED
                 -> FAILED / CANCELLED
```

具体 enum 名称可按仓库规范确定，但不得把 `UNKNOWN` 直接折叠成 `FAILED`。

- `SUCCEEDED`：必须有足够 provider 证据证明资金成功。
- `DECLINED/FAILED`：必须有明确 provider 最终失败结果或可靠 reconciliation 证据。
- `UNKNOWN`：request timeout、response lost、provider 暂时不可查询等场景。
- `RECONCILING`：使用 provider payment ID / externalPaymentId / idempotency key 恢复事实。

不得依赖“金额相同 + 时间接近”猜测支付。

## 7. 幂等与重复扣款边界

Sale / Refund / Void 等金融操作必须具备幂等设计：

1. 每个 logical payment attempt 有稳定 internal ID。
2. 每个 provider request 有稳定 idempotency key。
3. 重试同一 logical attempt 不得产生第二笔扣款。
4. 新 attempt 必须与旧 attempt 显式区分。
5. 旧 attempt 为 UNKNOWN 时，不得无保护地创建新 attempt。
6. Order creation 必须独立幂等，防止支付成功重复事件生成双订单。

## 8. Surcharge 边界

SanQ 应区分：

- Order 应付金额
- credit card surcharge
- 实际 card charged total

POS Terminal 支付应优先让 Clover 根据 merchant/tender 配置处理 surcharge，SanQ 读取并记录 provider 返回的实际 surcharge 事实。不得只按 SanQ 自己的 2.4% 推算覆盖 Clover transaction data。现有 Ecommerce surcharge reconciliation 的安全思想应保留。

## 9. 兼容上线硬约束

本节为本项目最高优先级门禁。

### 9.1 开发期间旧 POS CARD 必须始终可用

在新 Terminal 主链路完整完成以前，当前 `POS CARD -> /pos/orders -> 直接创建 CARD Order` 必须继续工作。不得提前加入“CARD Order 必须提供 Clover paymentId”等硬约束。

### 9.2 每个中间提交都必须可部署

开发期间 VM 仍允许 pull / rebuild / deploy。任何合入 dev 的中间版本不得因为“新支付还没做完”导致 POS CARD 无法收银。

### 9.3 新能力采用 additive rollout

优先新增模块、表、nullable 字段、endpoint、provider、UI 和 feature flag。不得在早期删除旧 endpoint、改旧 CARD 必填契约或删除旧退款入口。

### 9.4 Feature flag 默认关闭

新 POS Clover Terminal payment 在准备完成前必须 disabled：

```text
flag=false -> legacy CARD
flag=true  -> new Clover Terminal payment
```

### 9.5 切流与代码部署分离

理想顺序：代码全部部署 -> `flag=false` -> Clover 实机测试 -> 验收 -> `flag=true`。

### 9.6 必须有快速回退能力

在 legacy cleanup 前，新链路发生重大现场问题时应能通过 `flag=false` 恢复 legacy CARD，而不是依赖 Git revert、紧急改代码或数据库回滚。

## 10. 数据库变更原则

- 优先 additive schema。
- 现有字段先保留。
- 新关系在迁移期允许 nullable。
- 历史 Order 不要求伪造不存在的 Clover transaction。
- 旧 POS CARD 历史订单不得通过猜测反向关联 Clover payment。
- Prisma migration 继续遵守 `AGENTS.md`；未经明确授权不得生成/修改/执行 migrations。

## 11. 新旧链路共存边界

共存期用于安全迁移，不是永久双轨。

Legacy CARD：继续作为 fallback，不要求 PaymentTransaction。  
New CARD：必须经过 Payment domain，必须有 PaymentTransaction，必须先支付成功再创建 Order。

同一次 POS 操作不得同时调用 legacy order creation 和 new Clover payment。

## 12. Clover Terminal 集成边界

目标方式：Clover REST Pay Display，优先 Cloud connection。SanQ POS 是 Web POS、API 已云端部署，Cloud 模式更符合现有架构并减少 Local Device Server / CA 证书等额外运维复杂度。

具体 RAID / OAuth / device / production approval 以 Clover 正式账号能力和官方审核结果为准；不得猜测 production credential、硬编码 secret 或将 OAuth token 暴露到 browser。

## 13. Clover Webhook 边界

Webhook 用于外部 payment update、Dashboard refund、主请求 response 丢失后的辅助确认和 reverse sync。Webhook handler 必须验证真实性、幂等处理、使用稳定 transaction identity 映射 PaymentTransaction，并防止重复创建 Order / refund / amendment。

## 14. Refund / Void 边界

正确顺序：

```text
POS 发起退款
  -> Payment application 决定 Void / Refund
  -> Clover 执行并确认
  -> Payment 更新
  -> Orders 执行业务退款状态和 amendment
  -> Loyalty / balance 等按现有规则回滚
```

Refund 为 UNKNOWN 时，Order 不得假装已退款成功，必须等待 reconciliation。

## 15. CheckoutIntent 边界

`CheckoutIntent` 本次不删除。长期语义：CheckoutIntent 管 checkout session / pricing / customer / fulfillment context / expiry；PaymentTransaction 管资金交易；Order 管商业订单。

## 16. 本项目不强制顺带完成的事项

以下内容不是 Clover POS 主链路上线的前置条件：

- 为所有历史 CARD Order 反向匹配 Clover
- 一次性重构整个 Orders / Loyalty / Membership
- 一次性迁移 WeChat / Alipay 到 Payment Provider
- 一次性替换全部报表
- 引入其他支付 provider
- 删除 CheckoutIntent
- 为架构统一修改无关业务模块

若实现中发现其中某项确为必要前提，必须先说明原因。

## 17. 阶段原则

总体阶段：

1. Payment Domain Foundation
2. Clover Provider Separation
3. Clover Terminal Backend Capability
4. POS New Payment Flow（flag=false）
5. Refund / Void
6. Clover Webhook / Reverse Sync
7. Web Ecommerce Payment Normalization
8. Full Verification / Cutover
9. Production Stability Window
10. Legacy Cleanup

详细阶段工作与验收条件见 `clover-pos-phase-plan.md`。

## 18. 切流门禁

只有至少满足以下条件才允许 `flag=true`：

- Payment domain 完成
- Terminal Sale 实机通过
- Decline / Cancel 通过
- UNKNOWN / reconciliation 通过
- 幂等 / 双击 / retry 通过
- API/POS restart recovery 通过
- Refund / Void 通过
- 适用的加拿大 Interac 场景通过
- surcharge 通过
- PaymentTransaction 与 Order 关联正确
- 打印/loyalty 无重复处理
- Web Ecommerce 无回归
- legacy CARD 仍可快速恢复
- CI 全绿
- 没有未解释的支付金额差异或无法追踪的 provider payment

## 19. Legacy Cleanup 门禁

首次切流成功不等于允许立即删除旧代码。只有生产稳定期完成、无已知重复扣款/长期 UNKNOWN/refund mismatch/surcharge mismatch 等问题，并确认 fallback 不再是生产安全所必需时，才允许独立执行 legacy cleanup PR。

Cleanup 后不得再存在：

```text
paymentMethod=CARD -> 直接创建已支付 Order
```

## 20. 回滚原则

在 legacy cleanup 前，新链路出现重大生产问题优先通过 feature flag 恢复 legacy CARD。不得删除成功 PaymentTransaction、把成功 Clover payment 当失败、重复 refund 或通过金额/时间猜测数据库修正。

## 21. 安全与审计要求

- Clover secret / OAuth token 不得进入前端或 Git。
- 日志不得打印完整 card data、token、credential。
- provider raw payload 必须脱敏。
- payment / refund 关键动作必须有可追踪 internal ID。
- 金融动作不得 `catch` 后当成功。

## 22. Architecture Test 原则

文档描述“为什么不能越界”，architecture tests 必须逐阶段把已经成立的边界变成 CI 可执行门禁。

测试应逐步覆盖：

- Payments domain 不得 import Orders / POS / Clover infrastructure。
- Orders 不得 import Clover transport / wire types。
- POS 不得 import Clover gateway / OAuth / raw schema。
- Clover infrastructure 不得直接创建 Order、打印、操作 loyalty/kitchen。
- Payments application 只能经 Provider port 使用 Clover。
- Clover wire schema 不得越出 Payments infrastructure。
- 只有 composition/orchestration 层可以同时依赖 Payments 和 Orders。
- legacy cleanup 后禁止恢复 `CARD -> 直接创建 paid Order`。

Architecture tests 必须采用渐进式门禁：不得在旧结构尚未迁移时一次性启用“最终状态”规则导致基线 CI 永久失败。每完成一个 Phase，就移除对应历史豁免并收紧规则。

## 23. 测试与 CI 边界

至少覆盖 Payment state machine、provider mapper、idempotency、amount/surcharge reconciliation、refund transitions、start/confirm/reconcile/refund、POS orchestration、Payment -> Order creation、webhook idempotency 和现有 Web Clover regression。

不得通过 `any`、`@ts-ignore`、`test.skip`、弱化 assertion、关闭 architecture test 等方式绕过失败。

## 24. 最终目标状态

```text
POS / Checkout Orchestrator
       |             |
       v             v
   Payments        Orders
       |
       v
Payment Provider Port
       |
       v
     Clover
```

长期性质：

- Order 是订单事实。
- Payment 是资金事实。
- Clover 是支付基础设施。
- POS 是业务交互入口。
- Orchestrator 负责协调，而不是让模块互相穿透。
- UNKNOWN 必须可恢复。
- 支付成功和退款成功都必须有 provider 证据。
- 任何金融副作用必须幂等。

## 25. 明确禁止的实现捷径

禁止：

1. 在现有 CloverPayController 无限叠加 Terminal / refund / webhook 全部逻辑。
2. 让 PaymentsModule 直接变成另一个 Orders wrapper。
3. 在实测前删除 legacy POS CARD。
4. 在开发中途要求 CARD 必须提供 Clover payment ID。
5. timeout 后直接提示“失败，请重新刷卡”。
6. 仅靠金额和时间猜 Clover payment。
7. Webhook 重复时重复创建订单或退款。
8. Clover refund 请求发出后立刻把 Order 标记 refunded。
9. 前端持有 Clover secret。
10. 为支付模块化一次性重构所有无关业务域。
11. 首次切流和 fallback cleanup 放在同一 PR。
12. 未实测就把新 Terminal flow 设为生产默认。

## 26. Definition of Done

项目只有在以下全部完成后才视为最终完成：Payments bounded context、Clover provider 边界、POS Terminal Sale 实时同步、POS 支付 UI、idempotency、UNKNOWN/reconciliation、Refund/Void、Clover reverse sync、Web payment 统一资金事实、生产切流、稳定观察、legacy cleanup、architecture tests、CI 全绿和文档同步。

最终系统中每一笔新的 Clover CARD 资金动作都必须能够直接回答：由谁发起、对应哪个 internal payment、哪个 Clover transaction、金额/surcharge、当前状态、是否重试/退款、对应哪个 Order，以及网络异常时如何证明最终结果。