# Uber 订单动作调用边界

本文固化 Uber 订单动作的唯一应用边界及四条允许的调用链。目标是让动作的创建、持久化和执行都经过 `UberOrderActionService` 所表达的同一套规则，避免 Controller、状态同步、导入流程或 Worker 各自形成第二条动作通道。

## 核心组件与职责

| 组件                             | 唯一职责                                               | 不应承担的职责                                   |
| -------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `ProcessUberWebhookInboxUseCase` | 从 inbox 领取并分发 webhook，订单事件交给导入用例      | 不生成动作、不直接写动作表、不调用 Uber 动作 API |
| `ImportUberOrderUseCase`         | 校验并导入订单，决定随导入事务保存的初始动作 intent    | 不在订单事务外另行 enqueue，不调用 Uber 动作 API |
| `UberOrderActionService`         | 统一动作 intent 的构建、请求校验和已领取任务的执行规则 | 不成为 HTTP、webhook 或定时任务入口              |
| `UberOrderStatusSyncService`     | 把本地订单状态映射为受支持的 Uber 动作                 | 不持久化动作、不直接调用 gateway                 |
| `ExecuteUberOrderActionWorker`   | 编排动作任务的领取与执行                               | 不复制动作校验、幂等键生成或 gateway 分派规则    |

## Webhook 导入链路

```text
ProcessUberWebhookInboxUseCase
  → ImportUberOrderUseCase
  → UberOrderActionService.buildIntent(...)
  → UberOrderImportRepositoryPort.saveImportedOrder(...)
  → 在订单导入事务中保存动作 intent
```

这条链路是一个有意保留的事务特例：新订单及其初始 `ACCEPT`/`DENY` intent 必须原子落库。因此，导入用例把由统一 service 构建的 intent 传给 `saveImportedOrder(...)`，而不是随后调用 `UberOrderActionRepositoryPort.enqueue(...)`。Repository adapter 必须在同一个订单导入事务中保存订单图和动作 intent。

`buildIntent(...)` 只负责规范化输入、校验拒单原因、生成幂等键及业务版本；它不执行 I/O。重复 webhook 如果需要补建动作，应重新进入 `UberOrderActionService.request(...)`，不得绕过 service 直接 enqueue。

> 当前实现的过渡点：`ImportUberOrderUseCase` 仍在用例内联构造 `actionIntent`。后续收口时应将这段纯构建逻辑提取为 `UberOrderActionService.buildIntent(...)`；本文所示链路是应保持的最终边界，而不是授权新增另一套 builder。

## 人工动作请求链路

```text
Controller / Public API
  → RequestUberOrderActionUseCase
  → UberOrderActionService.request(...)
  → UberOrderActionRepositoryPort.enqueue(...)
```

Controller 只调用应用用例。`RequestUberOrderActionUseCase` 负责把结果转换为 API 表示；动作输入校验、规范化、幂等键和业务版本由 `UberOrderActionService` 统一产生。任何 Controller、resolver 或其他公开入口都不得直接依赖 action repository 或 action gateway。

## 本地状态同步链路

```text
SyncUberOrderStatusUseCase
  → UberOrderStatusSyncService.actionFor(...)
  → UberOrderActionService.request(...)
  → UberOrderActionRepositoryPort.enqueue(...)
```

`UberOrderStatusSyncService` 是本地状态到 Uber 动作的唯一映射点；`SyncUberOrderStatusUseCase` 在完成订单存在性与状态机校验后，把映射得到的动作交给统一 action service。状态同步不得自行构造 intent、直接 enqueue 或调用 gateway。当前状态同步已经遵循这条链路。

## Worker 执行链路

最终结构应为：

```text
UberOrderActionWorkerAdapter
  → ExecuteUberOrderActionWorker
  → UberOrderActionRepositoryPort.claim(...)
  → UberOrderActionService.executeClaimed(task)
  → UberOrderActionGatewayPort.accept/deny/cancel/readyForPickup(...)
  → UberOrderActionRepositoryPort.complete(...)
```

Worker adapter 只负责轮询调度，应用 Worker 负责批量领取，`UberOrderActionService.executeClaimed(task)` 负责读取当前订单状态、按动作类型调用 gateway，并在确认成功后通过 `UberOrderStateMachine.afterConfirmedAction(...)` 产生明确的状态迁移，再把结果交还 repository 完成。`complete(...)` 必须携带 `claim(...)` 返回的 lease token，并在同一事务内完成 lease fencing、任务成功写入和 service 指定的条件状态更新；repository 不得根据 action 推导目标状态。

商户发起的 `CANCEL` 是独立 command，沿用 action idempotency key；确认成功后的生命周期结果由 `afterConfirmedAction(status, 'CANCEL')` 决定。Uber cancellation webhook 则继续使用 webhook event id 和 inbox 幂等边界。两条入口可以复用取消状态判断，但不得混用幂等标识或事件语义。

`ExecuteUberOrderActionWorker` 持有 worker owner、batch limit 和 lease duration，调用 repository 领取任务并并发调度。Service 的单任务公开入口不领取新任务，因而调用方必须传入 `claim(...)` 返回且包含 lease token 的完整任务。

## 唯一通道约束

新增或修改订单动作代码时必须满足以下规则：

1. 除订单导入的原子事务特例外，所有动作 intent 都通过 `UberOrderActionService.request(...)` 创建，并由 `UberOrderActionRepositoryPort.enqueue(...)` 持久化。
2. 订单导入只可保存 `UberOrderActionService.buildIntent(...)` 产生的 intent，且必须与订单在同一事务中落库。
3. 只有 `UberOrderActionService.executeClaimed(...)` 可以调用 `UberOrderActionGatewayPort` 的动作方法。
4. API、webhook、状态同步和 Worker adapter 均不得直接调用 gateway。
5. 幂等键、业务版本、拒单原因规范化和动作分派规则只在 `UberOrderActionService` 中定义；调用方不得复制。
6. `UberOrderStatusSyncService` 只负责状态映射，repository 只负责持久化与租约；两者都不承载外部副作用。

代码评审中若出现绕过上述链路的依赖，应视为新增了第二条动作通道并拒绝合入；若现有能力不足，应扩展统一 service 或既有 port，而不是建立旁路。
