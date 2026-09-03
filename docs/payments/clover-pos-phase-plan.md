# SanQ 支付域模块化 + Clover POS 实时同步分阶段实施方案

**状态：** Phase Execution Plan v3（2026-09-03 governance revision）  
**日期：** 2026-08-26；冻结/模块化执行规则修订于 2026-09-03  
**关联文档：** `docs/payments/clover-pos-integration-charter.md`

## 0. 总体原则

所有阶段必须遵守以下硬性原则：

1. 任何中间版本都必须可部署。
2. 在新 Clover Terminal 链路完成并通过实机验收前，旧 POS CARD 链路必须始终可用。
3. 新能力优先 additive，不提前删除旧逻辑。
4. 新 POS Clover Terminal 链路默认 feature flag = false。
5. 切流必须和代码部署分离。
6. timeout / 网络异常不得直接按失败处理。
7. 所有金融副作用必须有幂等保护。
8. Refund / Void 未经 Clover 明确成功或 reconciliation 确认前，不得提前把 Order 标记 refunded。
9. Orders 不得直接认识 Clover。
10. Payments 不得直接依赖 Orders internals。
11. 每阶段完成后必须给出改动报告，再决定是否进入下一阶段。
12. 所有代码修改前继续遵守 `AGENTS.md`、GitHub Actions、architecture tests 和现有模块边界。
13. 新核心从 Phase D 起即按 Web / POS 最终共用设计。POS Clover Terminal 当前属于 pre-production prototype，其结构性模块化不再等待 Clover developer/sandbox merchant 阻塞解除；但 real-device 验收、feature-flag 切流和 settlement 证明仍按后续门禁执行。
14. 现有 Web Clover Ecommerce 是 guarded production path：默认保持生产行为不变；如果它成为模块化关键进度阻塞，可按 charter 1.1 做最小必要修改。任何 Web-impacting slice 必须先记录影响/替代方案/回退策略，并在部署后给出并完成受影响场景的主动实测，用户确认前不得标记 production verified。
15. 会被并发消费并改变 external due 的内部权益（积分、储值余额、优惠券）必须先 HOLD；支付成功后 COMMIT，明确失败后 RELEASE，UNKNOWN/RECONCILING 继续 HELD。
16. external payment 发起前必须持久化 immutable order/pricing snapshot 和 tender allocation；进入 PROCESSING 后 recovery 不得按当前价格/促销重新定价。

### 0.1 2026-09-03 模块化执行规则修订

Clover developer/sandbox merchant 身份问题现在只阻塞**真实设备验收、支付切流和需要真实 Clover 事实的验证**，不再阻塞 POS Terminal 原型内部的模块化/边界整理。生产 Web Clover 也不再是绝对冻结区；当且仅当它成为明确的模块化关键阻塞时，可以修改，但必须使用最小影响方案并执行 charter 1.1 的 guarded-production 验证门禁。不得把“允许修改”解释为提前进入 Phase G/H cutover 或删除 legacy compatibility。

执行顺序：

```text
Phase A  Payment Domain Foundation
Phase B  Clover Provider Separation
Phase C  Clover Terminal Backend Capability
Phase D  Unified Payment Core + POS First Consumer（flag=false）
Phase E  Refund / Void
Phase F  Clover Webhook / Reverse Sync
Phase G  Web Ecommerce Migration to Unified Payment Core
Phase H  Full Verification / Cutover
Phase I  Production Stability Window
Phase J  Legacy Cleanup
```

## 1. Architecture Tests 总体策略

Architecture tests 必须提前进入仓库，并在 Phase A 的最前面建立，而不是等所有代码重构完成后才补。

其作用是把 charter 中的模块边界变成 CI 可执行门禁。

### 1.1 Phase A 首项工作

Phase A 开始时，第一批工作应是：

1. 复用仓库现有 UberEats architecture test 的扫描/解析工具和测试风格。
2. 建立 Payments architecture spec。
3. 把“当前已经可以成立”的支付边界先锁住。
4. 对仍存在的 legacy 依赖采用最小、显式、可删除的临时豁免。
5. 每完成后续一个 Phase，就删除对应豁免并收紧门禁。

### 1.2 不允许一次性启用最终规则

当前代码本身仍存在 `CloverModule -> OrdersModule`、legacy `CARD -> Order` 等历史依赖，因此不能在文档 PR 或 Phase A 开始时直接写出“最终状态全部强制成立”的测试，否则基线 CI 会立即失败，项目无法渐进迁移。

正确方法是“渐进式门禁”：

```text
当前旧边界仍存在
  -> 用明确 legacy exception 标记
  -> 完成对应 Phase
  -> 删除 exception
  -> CI 从此禁止回退
```

临时豁免必须：

- 精确到具体文件/依赖方向。
- 写明对应 Phase 和删除条件。
- 不允许使用 broad glob 把整个目录排除。
- 不允许为了过 CI 持续扩大豁免范围。

### 1.3 最终需要锁住的 architecture rules

至少包括：

- Payments domain 不得 import Orders、POS、Clover infrastructure。
- Payments application 不得直接依赖 Clover concrete gateway，只能经 Provider port。
- Orders 不得 import Clover transport、OAuth、wire schema。
- POS 不得 import Clover gateway、OAuth、provider raw schema。
- Clover infrastructure 不得直接创建 Order、打印或操作 loyalty/kitchen。
- Clover wire schema 不得越出 Payments infrastructure / adapter。
- 只有明确的 composition/orchestration 层可以同时依赖 Payments 与 Orders。
- Provider infrastructure 不得反向决定 Order lifecycle。
- legacy cleanup 后，CI 必须阻止重新出现 `CARD -> 直接创建 paid Order` 的生产入口。

### 1.4 Architecture test 放置要求

应沿用仓库现有测试组织风格，优先放在 API 源码对应 bounded context 附近，例如：

```text
apps/api/src/payments/payments-architecture.spec.ts
```

如需要通用扫描 helper，应优先复用现有安全工具；只有现有工具无法表达支付边界时才新增最小 helper。

不得为了支付项目改写 UberEats architecture test 的语义。

---

# Phase A — Payment Domain Foundation

## 目标

先建立正式 Payments bounded context，但不改变任何生产支付行为。

本阶段本质：**先修地基，不动现有收银入口。**

## 第一项工作：建立 Architecture Tests

在写 `PaymentsModule` 或搬任何 Clover 逻辑前，先建立本阶段可以成立的 architecture tests。

至少先锁住：

- 新 `payments/domain/**` 不能 import `orders/**`、`pos/**`、`clover/**`。
- 新 `payments/application/**` 不能 import Clover concrete infrastructure。
- Payment domain 不依赖 Nest / Prisma / HTTP provider wire types。
- Provider port 与 domain types 位于允许的公共边界。

对当前旧 Clover/Orders 耦合不立即判红；该依赖应登记为 Phase B 要移除的 legacy boundary，并在 Phase B 完成后补上强制规则。

## 主要工作

1. 新增 `PaymentsModule`。
2. 建立 `PaymentTransaction` 数据模型。
3. 建立 Payment domain types。
4. 建立 Payment status state machine。
5. 建立 `PaymentProvider` port/interface。
6. 建立 Payment repository boundary。
7. 建立 payment attempt / idempotency 内部语义。
8. 明确 Sale / Refund / Void operation 类型。
9. 明确 provider / source / paymentMethod 分类。
10. 建立并通过本阶段 architecture tests。

Phase A 只建立 provider-neutral payment core，不实现 Clover wire API，也不决定 Ecommerce `/v1/charges`、REST Pay Display `/connect/v1/payments` 或 Platform REST v3 的具体 transport/auth。Clover API family separation 从 Phase B 开始。

## 建议目录

```text
apps/api/src/payments/
  payments.module.ts
  payments-architecture.spec.ts
  domain/
  application/
  infrastructure/prisma/
```

## 数据库要求

允许：

- 新增 `PaymentTransaction` 表。
- 新增 nullable 关联字段。
- 新增必要索引/enum。

不允许：

- 删除 Order 旧支付字段。
- 把现有 CARD 强制绑定 PaymentTransaction。
- 伪造历史 Clover transaction。

Prisma migration 必须遵守 `AGENTS.md`；未经明确授权不得生成或执行 migration。

## 兼容要求

完成后：

- POS CARD 仍走旧链路。
- Web Clover 仍走旧链路。
- Refund 仍走旧人工流程。
- PaymentsModule 不能成为 legacy 生产路径的强制依赖。

## 测试要求

- Payment 状态转换。
- 非法状态转换拒绝。
- payment attempt 唯一性。
- idempotency key 规则。
- repository 行为。
- Phase A architecture tests。

## 完成标准

- Payment domain 独立编译。
- 不依赖 Clover wire schema。
- 不依赖 Orders internals。
- 不改变生产支付行为。
- 受影响 CI 全绿。

## VM 部署

允许。完全 additive。

## 进入 Phase B 条件

Payment domain / data model / architecture baseline 已稳定，legacy CARD 无行为变化。

---

# Phase B — Clover Provider Separation

## 目标

把 Clover 从“支付业务本身”降级为 Payments infrastructure/provider，并按 capability 明确分离 Ecommerce execution、REST Pay Display execution 与 Platform REST v3 canonical read/reconciliation。

## 主要工作

1. 定义 Clover provider adapter。
2. 拆分现有 `CloverService` 过重职责。
3. Ecommerce transport 单独封装，继续承载 legacy Web `/v1/charges` execution compatibility。
4. Terminal transport 建立 skeleton，承载 REST Pay Display `/connect/v1/payments` / device interaction。
5. 新建 Clover Platform Payments v3 gateway/read model，支持按 provider payment ID 获取 payment，并支持按 `externalPaymentId` 查询/恢复。
6. Platform v3 mapper 支持 canonical amount/result、`additionalCharges`、card transaction、refund 等所需字段，不把 raw v3 schema 暴露给 Payment application/domain。
7. Clover response mapper 按 API family 分开，不允许使用一个宽松 mapper 同时猜 `/v1/charges`、REST Pay 和 v3 shape。
8. OAuth / credential / device config 边界明确；Ecommerce、Terminal、Platform v3 配置槽必须显式区分，禁止隐式 token fallback。
9. provider wire schema 限制在 infrastructure 层。
10. 保持现有线上支付行为不变；Phase B 建立 v3 capability 不等于提前迁移 Web 流量。

## Architecture Test 收紧

Phase B 完成时应至少新增/收紧：

- Orders 不得新增 Clover wire/transport 依赖。
- 新 Payments application 不得 import Clover concrete gateway。
- Ecommerce / REST Pay Display / Platform v3 wire schema 不得越出 infrastructure。
- Platform v3 gateway 不得被 Orders/POS/orchestration 直接 import；只能通过 Payment provider/application boundary 暴露 canonical payment facts。
- 对完成迁移的旧 Clover -> Orders 直接依赖，删除对应 legacy exception。

若仍有旧 `CloverPayController` 为兼容 Web checkout 暂时需要 orchestration，应将 exception 精确限制在该文件和迁移期限，不得扩大到整个 Clover 目录。

## 兼容要求

- Web CARD / Apple Pay / Google Pay 行为不变。
- POS CARD 仍走 legacy。
- Clover Terminal 不启用。

## 禁止事项

- 不让 POS 调 Terminal。
- 不提前删除现有 Web 生产路径。
- 不引入 Orders -> Clover 依赖。
- Payment domain 不 import Clover wire types。

## 测试要求

- Ecommerce mapper。
- REST Pay Display / Platform v3 mapper 分离。
- Platform v3 payment-by-id 查询。
- Platform v3 `externalPaymentId` reconciliation 查询。
- `additionalCharges` / `CREDIT_SURCHARGE` canonical mapping。
- Platform v3 auth/config 不与 Ecommerce token 隐式混用。
- Provider result normalization。
- Clover failure mapping。
- amount/currency/paymentId mapping。
- existing Web Clover regression。
- Phase B architecture tests。

## 完成标准

Clover provider 边界清晰，Ecommerce/Terminal/Platform v3 三类 capability 已分离；Platform v3 canonical read/reconciliation capability 可被 Phase C 使用；Web/POS legacy 无回归，CI 全绿。

## VM 部署

允许。

---

# Phase C — Clover Terminal Backend Capability

## 目标

完成 Clover REST Pay Display 的 POS transaction execution，并把 Platform REST v3 接入为 Unified Payment Core 的 canonical payment truth / reconciliation source；不切 POS 主链路。

## 主要工作

1. Terminal device/config 读取。
2. Terminal health / availability。
3. REST Pay Display Sale request。
4. REST Pay Display immediate status / cancel 能力。
5. `externalPaymentId`。
6. idempotency key。
7. provider payment ID 保存。
8. Sale response 成功后使用 Platform REST v3 按 payment ID 读取 canonical payment。
9. response 丢失/provider payment ID 未知时，使用 v3 collection 按 `externalPaymentId` 做 reconciliation。
10. v3 canonical mapper 核验 amount / result / provider payment identity，并读取 `additionalCharges` / card transaction 等所需事实。
11. v3 暂时未看到刚完成交易或 Platform API 临时不可用时进入 UNKNOWN / RECONCILING，不得提前 finalize Order。
12. reconciliation。
13. Terminal payment persistence。
14. 必要 OAuth / RAID / device binding。
15. Platform v3 merchant-authorized token/config 与 Ecommerce/Terminal 配置显式隔离。

## 主状态链路

```text
PaymentTransaction CREATED
  -> PROCESSING
  -> REST Pay Display Sale
  -> execution observation
  -> Platform REST v3 canonical read
  -> SUCCEEDED / DECLINED / CANCELLED / UNKNOWN
```

REST Pay Display 返回 `SUCCESS` 只代表 execution observation 成功；对 Unified Payment Core 而言，在 Platform REST v3 尚未取得足够 canonical payment evidence 前，不得据此 finalize paid Order。

## UNKNOWN 要求

发生 timeout、response lost、provider 暂时不可查询、network interruption，或 REST Pay 已成功但 v3 payment 暂时不可见时，必须进入 UNKNOWN/RECONCILING，不得直接 FAILED 后允许重新刷卡。

## Reconciliation 要求

优先使用 provider payment ID 通过 Platform REST v3 查询；provider payment ID 未知时使用 v3 payment collection 按 `externalPaymentId` 查询，并结合本地 idempotency identity。不得用金额+时间或 last4+金额猜交易。REST Pay Display status 可以辅助设备交互恢复，但不能替代 Platform v3 的长期 canonical transaction read。

## Architecture Test 收紧

- Terminal gateway 只能位于 provider infrastructure。
- Platform v3 gateway / mapper 只能位于 provider infrastructure。
- API/application 层不得解析 raw Terminal 或 Platform v3 wire response。
- reconciliation 必须经 Payment application/repository boundary。
- POS/Orders/orchestration 不得直接引用 Terminal 或 Platform v3 gateway。

## 测试要求

除 Sale success、decline、cancel、timeout、unknown、duplicate request、idempotency、device unavailable、可模拟的 restart recovery 外，必须覆盖：

- REST Pay success + v3 canonical payment success -> `SUCCEEDED`。
- REST Pay success + v3 暂时 404/不可见 -> `UNKNOWN/RECONCILING`，不得创建 paid Order。
- REST Pay response lost + v3 `externalPaymentId` lookup 恢复成功。
- v3 amount/result/payment ID mismatch -> 不得 `SUCCEEDED`。
- v3 `additionalCharges` 中 `CREDIT_SURCHARGE` 正确进入 `surchargeCents`。
- charged total 基于 Clover canonical payment + actual additional charges 核验。
- Platform v3 timeout/auth temporary failure 保留 unresolved payment，不允许二次无保护扣款。

## 完成标准

不接 POS UI 的情况下，后端已能：`REST Pay execution -> Platform v3 canonical truth -> persist -> recover unknown`；只有取得足够 canonical provider evidence 才向 Unified Payment Core 暴露最终 `SUCCEEDED`，legacy CARD 不受影响。

## VM 部署

允许。Terminal path 不启用。

---

# Phase D — Unified Payment Core + POS First Consumer（flag=false）

## 目标

建立未来 Web / POS 共用的 Unified Payment Core，并让 POS Clover Terminal 成为第一位消费者；生产默认仍走旧 POS CARD，现有 Web Ecommerce 链路完全不迁移。

Phase D 不再建设 POS 专属支付状态机。所有新增 payment preparation、snapshot、reservation、tender allocation、recovery 和 finalization contract 必须保持 channel-neutral，以便后续 Web 直接迁入而不是复制第二套实现。

## 主要工作

1. 建立统一 checkout/payment preparation application contract。
2. external payment 前持久化 immutable order draft snapshot、pricing snapshot、tender allocation、store/source/attempt identity。
3. 建立内部权益 reservation：Points / Stored Balance / Coupon。
4. reservation 状态至少覆盖 HELD / COMMITTED / RELEASED。
5. HOLD 成功后才允许发起 Clover Terminal Sale。
6. 计算 external card due；100% internal tender 时不得发起无意义 Clover Sale。
7. 新银行卡支付弹窗。
8. Terminal 状态展示。
9. Waiting / Processing / Success / Declined / Cancelled / Unknown / Reconciling UX。
10. retry / change payment method。
11. POS reload 恢复相同 logical payment attempt。
12. WebSocket / realtime status push。
13. 只接受 Payment provider/application boundary 返回的 canonical `SUCCEEDED`；Phase D orchestration 不直接读取 REST Pay 或 Platform v3 raw response。
14. provider canonical success 后使用已固化 snapshot finalize Order，不重新按当前价格/促销计算已批准 external due。
15. finalize transaction 中 COMMIT reservation + consume payment attempt + create Order；明确失败时 RELEASE reservation。
16. Order creation / reservation commit / release / print 全部幂等。
17. 成功后打印并进入 board。
18. 新核心从命名和 contract 上不得绑定 POS；POS controller/UI 只是第一层 adapter。

## Reservation 硬规则

```text
Quote + Snapshot
      -> HOLD Points / Balance / Coupon
      -> persist logical attempt
      -> external payment

SUCCEEDED
      -> COMMIT reservations
      -> create Order

DECLINED / CANCELLED / definitive FAILED
      -> RELEASE reservations

UNKNOWN / RECONCILING
      -> KEEP HELD
      -> reconcile provider truth
```

- `expiresAt` 只能标记 stale reservation 并触发 reconciliation，不得直接自动 RELEASE unresolved attempt。
- 不得通过“先真实扣减，再失败补偿”模拟 HOLD。
- Coupon entitlement 必须与 Points / Balance 一样防止并发重复消费。
- snapshot 固化后，菜单价格、Promotion、税率、Coupon 当前状态变化不得改变该 attempt 已批准 external amount。

## Feature Flag

```text
POS_CLOVER_TERMINAL_PAYMENT_ENABLED=false -> legacy CARD
POS_CLOVER_TERMINAL_PAYMENT_ENABLED=true  -> Unified Payment Core + Clover Terminal
```

默认必须为 `false`。

## 新主链路

```text
POS
 -> Unified Payment Preparation
 -> immutable snapshot + tender allocation
 -> HOLD internal entitlements
 -> PaymentTransaction / logical attempt
 -> Clover Terminal Sale (if external due > 0)
 -> wait final payment truth
 -> SUCCEEDED
 -> finalize snapshot
 -> COMMIT reservations + create Order
 -> bind Payment <-> Order
 -> print
 -> board
```

## UNKNOWN UX

不得允许直接再次刷卡；必须显示正在确认支付结果并等待 reconciliation。UNKNOWN / RECONCILING 期间 Points / Balance / Coupon 继续 HELD。

## Web 生产边界

Phase D 默认只建设 Web 未来可复用的通用 contract / model，不主动改变生产
Web Clover 行为。若 Web 生产路径本身成为模块化关键阻塞，则可按本计划
0.1 / charter 1.1 的 guarded-production 例外做最小必要修改，并必须附带部署
后的主动支付实测；这不改变以下 cutover 禁止项：

- 不得仅为了 POS Terminal 模块化而改变 Web checkout API 行为；
- 不得把 Web 流量切到新核心；
- 不得把删除 `CheckoutIntent`、`CloverPayController` 或旧 Web reconciliation
  当作普通内部重构；
- 不得为了统一而同时切换两条生产支付链路。

## Architecture Test 收紧

- POS 不得 import Clover gateway/OAuth/raw schema。
- POS 只能调用 Unified Payment application/public contract。
- 新 Unified Payment core contract 不得依赖 POS UI/types。
- 明确 orchestration/composition 层是同时依赖 Payments + Orders + Benefits payment-reservation public boundary 的允许位置；payment preparation 不得直接注入 concrete `LoyaltyService` / `MembershipService`。
- Points/Balance 与 Coupon 的 HOLD/RELEASE 通过 Benefits-owned 窄 contracts/composition wiring 提供；Payments infrastructure 不得直接操作 Loyalty / Membership reservation internals。
- 现有 COMMIT 继续在 `OrdersService.createFromConfirmedPaymentSnapshot()` 的同一 Prisma transaction 内与 Order creation 原子执行；在找到不泄漏 `Prisma.TransactionClient` 且不拆散原子性的 transaction-bound Benefits contract 前，不得为了边界整洁而拆成独立 Benefits transaction。
- Phase D orchestration 不得直接 import REST Pay Display / Platform v3 gateway 或 mapper。
- 新流程禁止在 Payment provider/application 给出 canonical `SUCCEEDED` / internal-only finalize 前创建 paid Order。
- Web legacy exception 仍精确保留，Phase D 不得扩大。

legacy CARD 仍存在，所以“全仓库禁止 CARD direct order”此时尚不能启用最终规则；只能锁定**新路径**不得绕过 Unified Payment Core。

## 测试要求

除原有 flag=false regression、flag=true success、decline、cancel、unknown、double click、reload、WebSocket duplicate、Order once only、print once only 外，必须新增：

- Points HOLD -> COMMIT / RELEASE。
- Balance HOLD -> COMMIT / RELEASE。
- Coupon HOLD -> COMMIT / RELEASE。
- Points + Card。
- Balance + Card。
- Coupon + Card。
- Points + Balance + Coupon + Card。
- 100% internal tender（不调用 Clover）。
- UNKNOWN 保持全部 reservation HELD。
- API restart / POS reload 后从 persisted snapshot 恢复。
- snapshot 后价格/Promotion/税率变化不改变已批准 external amount。
- 并发尝试不能重复 HOLD 同一 Coupon 或超额 HOLD Points/Balance。

## 完成标准

新 Unified Payment Core 的 POS 路径完整，reservation/snapshot/recovery 可承受最坏故障场景；production default 仍是 legacy POS，Web 生产链路行为不变。

## VM 部署

允许，flag 必须默认关闭。

---

# Phase E — Refund / Void

## 目标

让新 Clover CARD Order 的退款由 SanQ 发起，并以 Clover 最终结果为资金事实。

## 主要工作

- 查找原 PaymentTransaction。
- 判断 Void / Refund。
- Clover Void / Refund execution。
- Platform REST v3 refund/payment read-back，取得 canonical refund amount / result / additional-charge refund facts。
- Refund transaction。
- refund idempotency。
- refund UNKNOWN / reconciliation。
- Order refund lifecycle / Amendment。
- loyalty / balance 现有副作用正确执行。
- POS refund UI 状态。

## 正确顺序

```text
POS request refund
 -> Payment refund/void
 -> Clover confirmed
 -> Payment updated
 -> Orders refunded
 -> Amendment / Loyalty rollback
```

禁止先把 Order refunded 再调用 Clover。

## Interac

加拿大 Interac refund 如要求 terminal/card/PIN interaction，必须实机验证，UI 不得提前显示成功。

## Architecture Test 收紧

- Orders refund 不能直接调用 Clover gateway。
- Clover refund adapter 不得直接修改 Order。
- Refund orchestration 必须位于允许同时协调 Payments + Orders 的层。

## 兼容要求

在 new CARD 尚未切流前，legacy CARD 人工 refund 保留。

## 测试要求

full refund、void、failure、timeout、reconciliation、duplicate refund、restart、Interac、loyalty once only、Order refunded once only。

## VM 部署

允许。

---

# Phase F — Clover Webhook / Reverse Sync

## 目标

让 Clover 外部 payment update 最终同步回 SanQ。

## 主要工作

1. Clover webhook endpoint。
2. authenticity verification。
3. event idempotency。
4. event -> PaymentTransaction mapping。
5. external refund/update detection。
6. duplicate/out-of-order event handling。
7. POS realtime refresh。
8. reconciliation integration。

Webhook 不作为 POS Sale 的唯一成功确认方式。

## Architecture Test 收紧

- Webhook raw schema 只能停留在 Clover infrastructure/API adapter。
- Webhook 不得直接创建 Order / refund Order。
- 必须先映射为 Payment application/domain event/result。

## 测试要求

valid/invalid webhook、duplicate event、unknown payment、external refund、out-of-order、already completed/refunded。

## VM 部署

允许。

---

# Phase G — Web Ecommerce Migration to Unified Payment Core

## 目标

在 POS 新核心完成实测并经过稳定观察后，把现有 Web CARD / Apple Pay / Google Pay 迁入 Phase D 建立的同一 Unified Payment Core。迁移前旧 Web 链路仍是唯一生产收费路径；迁移过程中不得并行发起第二笔 Clover charge。

## 主要工作

1. 复用同一 payment preparation / snapshot / reservation / tender allocation contract。
2. Web Ecommerce transaction execution 继续使用 Clover 当前正式支持的 Ecommerce API（当前 `/v1/charges`），但不再把 `/v1/charges` response/status 当作长期唯一 payment truth。
3. Web execution 成功或恢复时，经同一 Clover Platform Payments v3 gateway canonicalize payment：payment ID / result / amount / `additionalCharges` / refund/card facts 统一映射进 PaymentTransaction。
4. Web Ecommerce 只保留渠道必要的 provider interaction 差异，核心状态机、幂等、reconciliation、finalization 与 POS 共用。
5. Web Points / Balance / Coupon 统一先 HOLD，再 external payment，成功 COMMIT，明确失败 RELEASE。
6. Web CARD / Apple Pay / Google Pay 的 external/provider IDs、surcharge、UNKNOWN/reconciliation 统一进入 PaymentTransaction。
7. `/v1/charges` 成功但 Platform v3 暂时无法确认时必须进入 UNKNOWN/RECONCILING，不得先创建 paid Order；v3 canonical truth 恢复后再 finalize。
8. 保留 Web 专属 contact verification、3DS、wallet/browser/session context，但不再让其形成另一套 payment lifecycle。
9. 迁移前可做 shadow quote / tender allocation compare，但 shadow path 不得向 Clover 发起收费。
10. 收敛并最终替换 `CloverPayController` 内部 payment-state responsibilities。
11. Web 新链路实测稳定前不删除旧 `CheckoutIntent` 或旧支付实现。

## Architecture Test 收紧

到本阶段结束，应尽可能删除为旧 Web Clover orchestration 保留的临时 exception，并锁住：

- Clover infrastructure 不直接创建 Order。
- Web checkout orchestration 经 Payment application 获取资金结果。
- Provider wire schema 不进入 Orders。

## 兼容要求

Web CARD、Apple Pay、Google Pay、pricing token、session expiry、contact verification 和 checkout API 行为不应无必要改变。

## 测试要求

Web CARD、wallet、3DS/challenge、retry、CheckoutIntent expiry、Payment linkage、Order once only、surcharge reconciliation。

## VM 部署

允许。

---

# Phase H — Full Verification / Cutover

## 目标

完成真实 Clover Terminal 全链路实测，然后才允许新链路成为生产默认。

## 切流前状态

代码全部已部署，feature flag=false，legacy CARD 正常。

## 必测矩阵

- Credit Sale：Tap / Insert / surcharge。
- Debit / Interac。
- Decline。
- Cancel。
- Timeout -> UNKNOWN -> reconcile。
- Network interruption，不重复扣款。
- Duplicate click，只一笔 logical payment。
- POS reload 恢复 payment。
- API restart 恢复。
- Terminal offline。
- Full refund。
- Void。
- Interac refund（如适用 card/PIN）。
- Refund timeout / reconcile。
- External Clover refund -> reverse sync。
- Duplicate webhook。
- Printing once only。
- Loyalty issue/rollback once only。

## Architecture Test 要求

所有 Phase A-G 已完成边界必须处于无临时扩大豁免的状态；任何仍存在的 exception 必须逐项解释是否属于 legacy fallback，不能存在“为了切流先忽略”的新豁免。

## 切流门禁

全部实测通过、CI 全绿、无未解释 payment mismatch 后，才允许 `feature flag=true`。

## VM 部署

允许；本阶段执行正式切流。

---

# Phase I — Production Stability Window

## 目标

验证真实生产长期行为，而不是刷成功一笔就删旧代码。

## 观察重点

payment success/decline、timeout、unknown recovery、duplicate prevention、restart/reload recovery、terminal availability、refund/void、Interac、webhook、surcharge、reports、receipts、amendments、loyalty、payment/order linkage。

## 旧链路状态

legacy CARD 保留，但仅 emergency fallback。

发生严重生产问题优先 `feature flag=false`，不依赖 Git revert 或数据库回滚。

## Architecture Test 要求

不得因为保留 fallback 而扩大 legacy exception。仅保留实际 fallback 所需的最小规则豁免，并清楚标注 Phase J 删除条件。

## 进入 Phase J 条件

确认无重复扣款、长期 UNKNOWN、payment/order orphan、refund mismatch、surcharge mismatch、webhook double handling 等生产 blocker，且 legacy fallback 不再是必要安全措施。

---

# Phase J — Legacy Cleanup

## 目标

删除迁移期旧路径，让 Payment architecture 成为唯一正式 CARD 路径。

## 主要工作

1. 删除 legacy POS CARD direct-paid path。
2. 删除 legacy fallback branch。
3. 删除旧人工 Clover CARD refund compatibility。
4. 删除迁移期 feature flag。
5. 删除过渡门禁如 `CLOVER_SYNC_PENDING`（确认不再需要时）。
6. 删除确认无调用的 Clover stub endpoints。
7. 删除重复/废弃 payment code。
8. 收紧 Order / Payment contract。
9. 更新文档。

## Architecture Test 最终收紧

本阶段必须删除全部与 legacy CARD 有关的 architecture exceptions，并新增/启用最终硬门禁：

- 新 CARD Order 必须可追溯到 PaymentTransaction。
- 禁止重新出现 `paymentMethod=CARD -> 直接创建 paid Order` 的生产路径。
- Orders 不直接依赖 Clover。
- POS 不直接依赖 Clover wire/transport。
- Clover infrastructure 不直接创建或退款 Order。
- Payments domain/application/infrastructure 层级规则全部成立。

Cleanup PR 不允许通过新增豁免来绕过最终架构门禁。

## Cleanup PR 要求

必须独立 PR，不和首次切流、production enable 或 migration rollout 混在一起。

## 测试要求

POS CARD、Web CARD、Apple Pay、Google Pay、refund、void、webhook、reconciliation、reports、printing、loyalty、architecture tests 全部回归。

## 完成标准

legacy path 删除，Payment domain 成为唯一支付事实入口，CI 全绿，文档更新。

---

# 各阶段统一交付要求

每阶段结束后必须提供改动报告，至少包含：

1. 本阶段目标。
2. 实际完成内容。
3. 修改/新增文件。
4. schema / DB 变化。
5. API 变化。
6. feature flag 变化。
7. 对 legacy CARD 的影响。
8. 对 Web Clover 的影响。
9. 对 refund 的影响。
10. architecture tests 新增/收紧/剩余 exception。
11. 测试结果。
12. CI 结果。
13. 未验证项目。
14. 已知风险。
15. 是否允许安全部署 VM。
16. 是否满足进入下一阶段条件。

# Git / PR 原则

推荐一个 Phase 一个 PR。禁止把 Phase A + D + J 合在一个 PR，禁止切流和 cleanup 同 PR，禁止 payment schema 大改和无关业务重构同 PR，也禁止为赶进度跳过阶段门禁。

# 部署原则

| 阶段 | VM | 生产支付状态 |
| --- | --- | --- |
| Phase A | 可部署 | 行为不变 |
| Phase B | 可部署 | 行为不变 |
| Phase C | 可部署 | Terminal backend disabled |
| Phase D | 可部署 | flag=false |
| Phase E | 可部署 | legacy refund 保留 |
| Phase F | 可部署 | reverse sync 可上线 |
| Phase G | 可部署 | Web UX 保持 |
| Phase H | 可部署 | 验收后允许切流 |
| Phase I | 可部署 | 新链路生产观察 |
| Phase J | 可部署 | 最终清理 |

# 最终目标

```text
POS CARD
 -> Payment Orchestrator
 -> PaymentTransaction
 -> Clover Terminal
 -> provider-confirmed success
 -> Order
 -> Print / Board

Web CARD / Wallet
 -> CheckoutIntent
 -> PaymentTransaction
 -> Clover Ecommerce
 -> provider-confirmed success
 -> Order

Refund
 -> Payment refund/void
 -> Clover confirmed
 -> Payment updated
 -> Order refunded
 -> Loyalty rollback
```

最终系统必须保证：每一笔 Clover payment 有 internal Payment ID 和 provider transaction identity；每一张新 CARD Order 可追溯到 Payment；每一笔 refund 可追溯到原 Payment；timeout 不等于失败；retry 不等于重复扣款；Order 是订单事实，Payment 是资金事实，Clover 是 provider，POS 是交互入口。