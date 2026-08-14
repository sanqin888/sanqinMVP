# Uber Eats 运维手册

> 原则：先保存证据再处置；查询均使用只读账号并限定时间/门店。重试必须使用原 event/action 的幂等键。任何输出不得包含 access/refresh token、签名、完整 webhook、顾客电话或地址。

<<<<<<< HEAD
## 部署前清单

- [ ] API 与 `ubereats-worker` 使用同一配置版本，并均通过统一启动配置校验。
- [ ] 常规生产设置 `UBER_EATS_RATE_LIMITER_MODE=distributed`，两个进程使用相同的 `UBER_EATS_RATE_LIMIT_REDIS_HTTP_URL`/`UBER_EATS_RATE_LIMIT_REDIS_HTTP_TOKEN`；仅明确单副本时改用 `process` 并设置 `UBER_EATS_SINGLE_REPLICA=true`。
- [ ] secrets manager 向两个进程注入相同的 `UBER_CREDENTIAL_ENCRYPTION_KEYS`、`UBER_CREDENTIAL_ACTIVE_KEY_VERSION` 和 `UBER_CREDENTIAL_KEYS_SOURCE=secrets-manager`，活动版本确实存在于 key ring。
- [ ] 检查 Compose、源码、部署日志和工单均不含实际 credential key 或 Redis token。
- [ ] 滚动发布前后确认 API/worker 的副本策略、限流模式和活动 key version 一致，再执行 OAuth/Webhook 健康验证。

=======
>>>>>>> origin/main
## 通用关联与指标

从告警的 `correlationId` 开始，在 `OpsEvent.payload` 中按 `eventId`、`externalOrderId`、`orderStableId`、`uberStoreId`、`posStoreId`、`menuPublishVersionStableId`、`orderActionId`、`opsTicketStableId` 或 `uberRequestId` 交叉定位。观察 `ubereats_webhook_*`、`ubereats_{inbox,outbox}_*`、`ubereats_api_*`、`ubereats_oauth_refresh_failed_total`、`ubereats_menu_*` 和 `ubereats_order_*` 指标；operation、outcome、eventType、failureCategory、queue 是唯一允许的指标标签。

<<<<<<< HEAD
### Worker 健康、阈值与探针

- readiness 使用 `/ready`（兼容路径 `/health`），只有 `status=ok` 返回 200；`starting`、`degraded`、`unhealthy` 均返回 503。`/live` 只验证 Node.js 事件循环和健康 HTTP server 仍能响应，不能用于判断队列消费者可接流量。
- 默认 poll interval 为 15 秒，连续失败阈值由 `UBER_EATS_WORKER_UNHEALTHY_FAILURE_THRESHOLD` 配置（默认 3）。任一 adapter 达到 3 次连续失败，或最后成功距今超过 `poll interval × 失败阈值`（默认 45 秒），即为 `unhealthy` 并触发高优先级告警。
- 首轮 poll 尚未全部完成为 `starting`；低于阈值的暂时失败、从未成功但已尝试、或任一队列存在 backlog 为 `degraded`。持续 5 分钟 degraded 或 backlog 连续三个采样周期增长应触发告警；恢复必须看到 `consecutiveFailures=0`、`lastSuccessfulAt` 前移且 backlog 开始下降。
- 排障顺序：先比较 `/live` 与 `/ready`；再检查各 adapter 的 `lastAttemptAt`、`lastSuccessfulAt`、`lastFailureAt`、`consecutiveFailures` 和 `backlog`。`/live` 失败时检查进程/事件循环/OOM；`/live` 正常而 `/ready` 失败时检查数据库、Uber API、lease 与退避日志。不要通过放宽探针、重启循环或清空队列掩盖持续失败。
- 优雅停机时发送 SIGTERM 后 readiness 将变为 503；平台应停止路由，并至少保留 `UBER_EATS_WORKER_SHUTDOWN_TIMEOUT_MS` 的终止宽限期；确认在途 poll 完成或超时后进程退出，且没有新 claim。

=======
>>>>>>> origin/main
## 密钥轮换

- **诊断查询**：查询 merchant connection 的 `status`、`tokenExpiresAt`、`updatedAt`（禁止选择密文字段），并按 `ubereats_oauth_refresh_failed_total` 判断影响范围。
- **安全动作**：在密钥管理器添加新版本，灰度一个实例验证 OAuth/Webhook，切换活动版本，等待旧实例退出后吊销旧版本；随后发送不含 PII 的签名测试事件。
- **禁止操作**：不得在日志、工单或 SQL 客户端输出密钥；不得先吊销旧版本；不得直接更新加密 token。

## Webhook 积压

- **诊断查询**：`SELECT status, count(*), min("receivedAt") FROM "UberWebhookInbox" GROUP BY status;`；按最老记录的 `eventId` 查询 OpsEvent，并检查 worker lease、失败分类及数据库延迟。
- **安全动作**：恢复依赖后启动单个 worker；仅释放已过期 lease；按原 `eventId` 小批重试并监控最老年龄下降。
- **禁止操作**：不得清空 inbox、修改 eventId、并行全量重放或绕过签名入口重新投递完整 payload。

## Uber API 故障

- **诊断查询**：按 operation 查看 `ubereats_api_latency_ms`、429、5xx、timeout 和 `uberRequestId`；确认 OAuth、DNS/TLS 与 Uber 状态页，查询对应 outbox/action 状态。
- **安全动作**：429 遵守 Retry-After；5xx/timeout 仅重试具有幂等键的读请求或原 action；指数退避并设置并发上限。
- **禁止操作**：不得把 timeout 当成功；不得无幂等键重试写操作、禁用 TLS 校验或打印响应正文。

## 菜单卡在 SUBMITTED

- **诊断查询**：`SELECT "versionStableId", status, "startedAt", "updatedAt" FROM "UberMenuPublish" WHERE status = 'SUBMITTED' ORDER BY "startedAt";`；用 versionStableId 与 uberRequestId 查询确认事件。
- **安全动作**：先在 Uber 后台确认版本是否生效；未生效且超过确认期限时运行既有超时恢复，再用同一版本的受控发布流程重试。
- **禁止操作**：不得直接改成 SUCCEEDED、同时发布新版本、删除发布记录或在状态未知时覆盖线上菜单。

## 订单 action 未确认

- **诊断查询**：`SELECT id, "externalOrderId", action, status, attempts, "updatedAt" FROM "UberOrderAction" WHERE status IN ('PENDING','PROCESSING') ORDER BY "updatedAt";`；关联订单、outbox 与 uberRequestId。
- **安全动作**：先向 Uber 查询真实订单状态；仅对未确认且可重试记录使用原 action ID/幂等键恢复 worker。
- **禁止操作**：不得假设 timeout 等于失败、手改本地订单状态、创建第二个 action 或重复扣款/接单。

## 门店误 provision

- **诊断查询**：只读查询 store mapping 的 uberStoreId、POS storeId、provision/status/updatedAt，并核对审批 OpsEvent 与 Uber 后台。
- **安全动作**：停止该 mapping 的发布与接单；双人核验后调用正式 deprovision 流程；保留映射和审计记录。
- **禁止操作**：不得删除 mapping、复用到另一门店、直接改数据库状态或在未确认在途订单前 deprovision。

## 重复事件

- **诊断查询**：按 `eventId` 查询 inbox 数量、payload hash、状态与 OpsEvent；比较 `ubereats_webhook_duplicate_total`，确认业务对象只发生一次状态转换。
- **安全动作**：保留第一条权威记录；让唯一约束/幂等处理返回成功；若 payload hash 不同则升级安全事件。
- **禁止操作**：不得删除第一条来接收第二条、生成新 eventId、重复执行副作用或记录完整 payload 做比对。

## 数据库恢复

- **诊断查询**：确认恢复点、schema 版本、inbox/outbox/action 各状态数量和最老年龄；抽样比对 Uber 状态与本地 stableId。
- **安全动作**：先只读启动；暂停消费者并恢复到隔离环境校验；生产切换后从最老 inbox/outbox 小批恢复，所有重放沿用原幂等键。
- **禁止操作**：不得运行 Prisma reset、跳过备份验证、同时启动新旧消费者、批量改为成功或从 Uber 全量写回覆盖本地状态。
