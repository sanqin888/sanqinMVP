# PEM — 支付异常案件、审批与受控恢复

**日期：** 2026-10-17  
**实施基线：** `origin/dev@9621e6af`  
**工作分支：** `feat/pem-payment-exception-cases-approval-recovery-20261017`  
**当前状态：** MCP-workspace LOCAL SOURCE + 聚焦回归测试已编写；**未执行 lint/build/test、无 PR、无迁移 SQL、无真实数据或设备操作**。  
**分类：** 关键支付路径受控扩展；持久化/public API additive-only；不替换现有 Payments 资金权威。

## 1. 定位与不变量

该能力是**通用案件/证据/审批/执行管理**，不提供「管理员强制修改付款金额、成功、取消、退款」接口。日后新增恢复动作必须明确其资金证据、Ownner、受控幂等/重入和验收条件；仅配置案件名称或审核批准不能绕过资金安全。

- Payments 拥有 `PaymentExceptionCase`、`PaymentExceptionEvidence`、`PaymentExceptionApproval`、`PaymentExceptionExecution` 四个新增 additive-only 模型；PaymentTransaction/TerminalOperation 仍由 Payments 拥有。
- Orchestration 仅协调 Payments 的案件能力、已有 Terminal/Checkout/Benefits 恢复用例。Payments 不直接读写 Orders/Benefits 的表。
- POS/Web 是展示/传输适配器，ADMIN 是审批访问渠道；所有写操作由 API 认证、核验。
- 原始 Attempt、支付交易内部 ID、External Payment ID、门店稳定 ID、金额/币种在案件创建时冻结；浏览器不暴露 `PaymentTransaction.id`；提交同一 Attempt 不会产生第二笔案件或 Sale。
- 执行的案件状态依次为 `REQUESTED → APPROVED → EXECUTING → COMPLETED/NEEDS_REVIEW`，审批可 `REJECTED`；Sandbox 自动初始 `APPROVED`。审批/执行结果附单独不可变审计证据，失败必须保留可重试检查点。
- 生产支付 Web Ecommerce、外部扣款/退款通道、会计权威事实与历史金融数据完全不变。对支付真值仍采取 fail-closed：无成功证据不等于未扣款；迟到成功/身份冲突必须停止结案。

## 2. 两种运行模式与权限

| 规则 | Sandbox | Production |
| --- | --- | --- |
| 登录与门店 | 现有 STAFF/ADMIN POS Session + 已注册 PosDevice 的 Store | STAFF/ADMIN POS Session + Store |
| 提交 | 无额外角色审批 | STAFF 可以提交 |
| 审批 | 不需要 ADMIN，案件自动 `APPROVED` | ADMIN 后台 + Session + MFA；不能自己审批自己的申请 |
| 执行 | POS 操作员明确点击执行 | ADMIN 审批后由服务端执行；不接受 STAFF 强制执行 |
| 运行门禁 | 只认 `development/test` + 本机回环 PostgreSQL + Sandbox Platform + Test Merchant≠Web Merchant + 匹配终端设备；**无需每次修改旧 R2 开关** | 默认关闭，明确配置 `PAYMENT_EXCEPTION_PRODUCTION_ENABLED=true` 后可用；仍受实际支付真值检查约束 |
| 受控人工「未收款」 | 仅符合狭窄的 504/NOT_FOUND 或完整 ALL_ATTEMPTS_FAILED 且设备明确空闲的原 Terminal Sale | **禁止** |
| 金额真实成功或冲突 | 必须停止，转人工核账 | 必须停止，转财务核账 |

现有 `POS_CLOVER_SANDBOX_MANUAL_RECOVERY_ENABLED` 保留为**旧 R2** 入口专属开关。该原入口仍只认 HTTP 504 + NOT_FOUND，不会因为 PEM 资格扩展而自动支持新的历史 209 订单。

## 3. 受控动作

1. `SANDBOX_CONFIRM_UNPAID`：只有严格隔离 Sandbox 原始 `POS_TERMINAL` Sale、Checkout/Payment RECONCILING、Terminal Fence SALE_IN_FLIGHT、同一 Attempt/Payment/External identity、无成功 ProviderPaymentId、操作员及 Clover 原订单/说明、显式 IDLE+Welcome、最新平台回读符合下述证据策略时，才允许「操作员核实未收款」；原 504/NOT_FOUND 的旧安全条件继续成立。新增 `ALL_ATTEMPTS_FAILED` 路径只能从已经持久化、已授权的 PEM 案件进入。数据库 CAS 使用原始 `resultCode/failureCode` 精确核对，不捏造丢失的 HTTP 209 日志。Payments 持久化 `POS_TERMINAL_SANDBOX_OPERATOR_UNPAID` 的本地 FAILED/审计记录，绝不作为 Clover CANCELLED 事实；Checkout/Benefits 幂等释放；再次查询完整 Canonical、核验原设备 IDLE/Welcome，再完成 Terminal Fence。流程中断后可从已有案件和检查点重试，期间不新发 Sale。
2. `RELEASE_CONFIRMED_FAILURE`：仅适用于 Payment **已有** `FAILED/DECLINED/CANCELLED` 终态，复用原 Checkout/Benefits RELEASE 及 Payments Fence finalization；生产必须 STAFF 申请 + ADMIN 审批。不得把 `UNKNOWN/RECONCILING` 转为失败。
3. `INVESTIGATE_ONLY`：对尚没有可执行安全动作的生产未决付款，允许提交、审批及留下调查责任；**没有自动资金/权益/设备写操作**，也没有强制结案按钮。

服务端每次执行前重读 Payment/Checkout/Fence 和冻结身份；案件仓储使用 Serializable/CAS、单次 Approval 唯一约束、执行 CAS+两分钟 crash-reclaim lease 以及 Owners 自身 CAS/幂等。所有被拒的执行保持原资金状态，异常/部分失败进入 `NEEDS_REVIEW` 而不是误标完成。

## 4. POS 和 Admin UX

- POS 当前未决列表中选择原付款，在原始详情下方打开「付款异常人工处理」。输入 Clover 原订单和说明，勾选已核查，然后建案件。Sandbox 案件无需 Admin，可由 POS 操作员明确执行；安全检查不通过则保持待核查。
- 生产 POS STAFF 同样创建案件，但不会出现执行按钮；ADMIN 到 `/admin/payments/exceptions` 审阅、输入至少 12 字说明并批准/拒绝。MFA 由原管理端 Guard 验证。
- 返回浏览器的案件模型使用 `caseStableId`/Attempt/StoreStableId 等业务身份，不暴露内部 PaymentTransaction UUID；所有资金证据为脱敏结果码，不传原始提供商 payload。
- 保留此前 Store-wide 10 条未决列表、历史 25 条列表，以及旧 R2 兼容路径。列表有容量限制，不等于所有历史案件均已解决。

## 5. 历史 S5-M04 $16.95 验收方案（尚未执行）

原 Attempt `1543e3b5-e091-4653-ae32-9b6ac3288526`、Clover Order `2YJK1ED5GTZZG`、External ID `sq_03e196de4ddf2d926715d05c9914c`。此前仅确认两条显示的 Clover Payment 均 FAIL；尚需实际再次回读完整 Canonical 集合及设备状态。HTTP 209 属于当时的操作观察，但缺少可审计原始日志。

前置：本地 Sandbox Prisma 迁移完成；API/Web 运行于严格隔离的 Test Merchant；Compact 在线且明确 IDLE/同一 TerminalId；原 Checkout/Payment 状态未被其他流程改变；原 Order 的支付记录由操作员重新核查。然后从 POS 原 Attempt 建立 `SANDBOX_CONFIRM_UNPAID` 案件并明确执行；核查 Payment=FAILED 且 `resultCode=POS_TERMINAL_SANDBOX_OPERATOR_UNPAID`、Checkout=FAILED、Benefits RELEASE 检查点、TerminalOperation=FINALIZED、审计 Case/Evidence/Execution/旧 SandboxRecovery 均可对齐、Order 未凭空变成 paid、Clover 未出现任何迟到成功。任何一步不通过，保留锁并停止新 Sale。验收之后**不删除案件、不直接改数据库、不重发原 Sale**。

## 6. Schema/Migration 与交付门禁

**MIGRATION REQUIRED：** Prisma schema 新增 `PaymentExceptionCase/Evidence/Approval/Execution` 四表及索引、唯一键，无现有表/列删除、无回填或旧金融事实改写。当前 MCP 不生成/执行迁移，用户需在已拉取相应 `dev` 的本地可丢弃开发数据库执行：

```bash
pnpm --filter api exec prisma migrate dev --create-only --name add_payment_exception_management
```

先审查生成 SQL 中四张表及唯一/索引、外键/关系、破坏性 SQL、既有迁移历史完整性；按仓库开发流程再提交至 `dev`。**配套迁移尚未生成、审阅、合并前，禁止晋级 `main` 或部署生产；更不能对现有含价值数据库执行 `migrate reset` / `db push`。**

源代码改动本地结束仅表示改动待审，GitHub CI 尚未启动，真实 Sandbox Payment/Benefits/Terminal 验收未完成。首个实测成功也不代表生产人工未收款已授权：生产高风险例外仍需要新的独立风控审计和授权。
