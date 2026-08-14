# Uber Eats 集成契约测试

<<<<<<< HEAD
本目录是跨实现层的稳定验收边界。测试按 `merchant`、`webhook-receive`、
`webhook-worker`、`orders`、`menu`、`operations` 六个能力域读取同一份
`acceptanceMatrix`，不引用 workflow
私有方法。内部实现重构时，不应改写契约来迁就实现。
=======
本目录是跨实现层的稳定验收边界。测试按 `merchant`、`webhook`、`orders`、
`menu`、`operations` 五个能力域读取同一份 `acceptanceMatrix`，不引用 workflow
私有方法。后续拆分 service 或 workflow 时，不应改写契约来迁就实现。
>>>>>>> origin/main

每个场景固定七类结果：输入、API 状态码、数据库状态迁移、Uber 请求次数、
对外响应、幂等/并发结果和日志禁用字段。具体矩阵见 `contract-matrix.ts`。

<<<<<<< HEAD
## 永久验收边界
=======
## 迁移阶段验收
>>>>>>> origin/main

| 阶段       | API                                          | 数据库                               | Uber 请求               | 幂等                          | 日志                                |
| ---------- | -------------------------------------------- | ------------------------------------ | ----------------------- | ----------------------------- | ----------------------------------- |
| merchant   | OAuth 成功、过期、错会话及重复回调状态码固定 | state 只能 `ISSUED -> CONSUMED` 一次 | token exchange 最多一次 | 并发仅一个消费者成功          | 不含 code、state、session、token    |
<<<<<<< HEAD
| webhook    | 签名、envelope、原子入箱及入箱前错误状态码固定 | handler、重试、UNSUPPORTED/DEAD 固定 | 路由本身不额外请求 Uber | eventId/内容哈希仅入箱一次    | 不含签名、认证头及 payload 身份数据 |
=======
| webhook    | 签名及错误分类状态码固定                     | inbox claim、终态与可重试态固定      | 路由本身不额外请求 Uber | eventId/内容哈希仅处理一次    | 不含签名、认证头及 payload 身份数据 |
>>>>>>> origin/main
| orders     | 导入及校验响应固定                           | 订单、明细、action/outbox 原子迁移   | 动作最多一次            | 通知与三类动作可重放、可并发  | 不含顾客、token、认证头             |
| menu       | dry-run、发布及超时响应固定                  | draft 不变且 publish 状态可审计      | dry-run 为零，上传一次  | 同版本不重复上传              | 不含 token、认证头                  |
| operations | 门店、同步、对账及工单响应固定               | snapshot/report/ticket 迁移固定      | 每次 claim 最多一次     | provision 和工单 claim 可重放 | 不含门店隐私、token、认证头         |

`fixtures/` 只保存虚构、最小化 payload。禁止加入真实顾客姓名、电话、邮箱、
地址、门店身份或任何 access/refresh token；契约测试会扫描常见敏感字段。

<<<<<<< HEAD
Webhook fixture 描述分为两个阶段：wire fixture 只证明 HTTP 接收阶段的签名、最小
envelope 与 durable inbox 输入；业务字段是否合法、handler 结果、内部重试及 `DEAD` 都是
Worker fixture/测试的职责。inbox 已提交或命中重复键即须返回 `200`；只有尚未取得持久所有权
的验签、envelope 或数据库错误才能用非 2xx 让 Uber 重投。

Uber 原始 HTTP schema 另存于 `fixtures/uber-contract/v1/`，不得用 application/domain
类型替代 wire fixture。能力、scope、webhook 与实现/测试的完整关联见
`requirement-matrix.md`；升级版本必须新增 fixture 版本并同步更新矩阵和门禁测试。

这里保留的是**永久兼容的 Uber wire contract**：版本化请求、响应、webhook envelope、
错误映射及签名向量。它约束与 Uber 之间可观察的网络协议，可通过新增版本演进，不能因
内部重构而删除或改写。共享 delegate、旧 service/workflow、`modules/`、`composition/`
以及 capabilities/facade 聚合入口属于**应被删除的内部迁移兼容层**，不是 wire contract，
不得为它们新增 fixture、别名或长期兼容测试。

=======
>>>>>>> origin/main
## Webhook 签名契约核对（2026-08-10 UTC）

> **Dashboard 核对状态：受阻。** 当前执行环境没有 Uber Developer Dashboard 的已登录会话或应用凭据，因此无法冒充账户所有者登录，也不能声称已经看到该应用获批 Eats 产品的私有配置。上线负责人必须在该应用的 **Webhooks / Primary webhook URL** 页面复核下表，尤其是 signing key 来源与轮换行为；复核前本实现依据 Uber 官方公开页面的当前说明，而不是未经证实的 Dashboard 截图。

核对的官方页面名称为 **Uber Developers — Webhooks**（Drivers）及 **Uber Developers — Receipt Ready Webhook**（Businesses / Receipts），核对日期为 **2026-08-10 UTC**。公开说明一致确认：header 名为 `X-Uber-Signature`；签名对象是收到的 HTTP request body 原始字节；算法是 HMAC-SHA256；输出是 64 字符、无算法前缀的十六进制值。较新的 Receipt Ready 页面称密钥来自 primary webhook URL 的 **signing key**；旧 Drivers 页面称使用应用 **client secret**。两者存在产品代际差异，所以 Eats 应用不得靠旧文档猜测：部署时应把 Dashboard 中 Primary webhook URL 显示的 signing key 放入 `UBER_EATS_WEBHOOK_SIGNING_KEY_ACTIVE`，绝不把 access token 或 OAuth state secret 当作签名密钥。

当前公开页面没有承诺一个可同时验证新旧 key 的服务端轮换宽限期。因此应用侧采用显式、有限窗口：新 key 写入 `UBER_EATS_WEBHOOK_SIGNING_KEY_ACTIVE`；仅在人工切换时配置 `UBER_EATS_WEBHOOK_SIGNING_KEY_PREVIOUS` 和绝对 UTC 截止时间 `UBER_EATS_WEBHOOK_SIGNING_KEY_PREVIOUS_VALID_UNTIL`。两项必须同时存在，截止后旧 key 立即失效并应从 secret manager 删除。此窗口是本应用的部署策略，不应表述为 Uber 保证的轮换规则。

实现中的签名版本名为 `hmac-sha256-hex-v1`。Uber header 本身不携带版本字段；版本名是内部显式契约。仅接受一个大小写不敏感的 `X-Uber-Signature` header 及 bare hex 值；数组、重复大小写名称、逗号合并值、`sha256=`/`v2=` 等未知算法或歧义形式全部拒绝。验证始终使用原始 body 字节和常量时间比较。失败只允许进入日志的安全分类是 `MISSING`、`AMBIGUOUS`、`FORMAT_INVALID`、`VERSION_UNSUPPORTED`、`MISMATCH`，不得记录 header 值、active/previous secret 或完整 payload。

固定向量 `fixtures/webhook-signature-v1.json` 的字段形状改编自官方 Webhooks 示例，所有 ID 与两个 secret 都是虚构值；digest 已离线冻结，测试不会调用生产公式生成期望值。
