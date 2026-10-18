# 浏览器端到端测试

## CI 变更范围（2026-10-18，本地待审）

已将本批 E2E-only 方案扩展为所有 CI 作业按实际输入选择，统一规则见 [CI 按变更范围执行](../../../docs/architecture/CI按变更范围执行.md)。纯文档/独立 Ops 不启动 Browser E2E；应用、共享库、数据库、依赖及 CI/未知变化仍运行；main push 完整验收。使用 job 级条件，跳过时不会拉取 PostgreSQL 或准备浏览器。保留原检查名与完整 migration replay/seed/BFF/13 条旅程；其他作业也按自身输入判断。选择器/历史异常默认全量，ECR Public 限额不由本批消除。

实现与边界测试已编写，未运行本地 lint/build/test、用户已授权远端交付；交付基线为最新 `origin/dev@2db85d32541f05e7e3268e7f5a2013812d59690e`，CI/合并以 PR 最终 head Checks 与事件为权威或创建 PR。

本目录承接已关闭 A5 的日常测试说明；施工/PR/CI 记录见 [A5 归档](../../../docs/archive/architecture/postmod-a5-browser-e2e.md)。配置与命令的权威来源为 [Playwright 配置](../playwright.config.ts)、[Web package](../package.json)、[实际 CI](../../../.github/workflows/ci.yml) 的 `browser-e2e` 作业及 [fixture seed](../../api/test/e2e/seed.ts)，变化时同步本说明。

## 安全运行前提

- GitHub Actions 是仓库权威验证环境；MCP-workspace 未开放 lint/build/test，不在其中执行 E2E 或依赖这些命令的 CI 复现。
- 只有明确授权且具备执行权限的开发环境才按 CI 准备完整栈。使用可丢弃的本机 PostgreSQL 数据库 `sanq_e2e`，`SANQ_E2E=1`、`NODE_ENV=test`，seed 只接受 localhost/127.0.0.1 与该精确库名；不能放宽 guard 或指向生产库。
- CI 对可丢弃库重放已提交 migrations、生成 Prisma Client、创建确定性 Store/menu/角色/顾客/权益/订单/POS fixtures。不是用 `db push`、生产数据副本或生产迁移来准备测试。
- Messaging 使用 log provider，OAuth 仅 dummy bootstrap；不为测试调用真实支付、短信、邮件、Uber 或 Clover Terminal。seed、fixture 和诊断不得带真实凭据。
- 依赖和浏览器版本以已提交锁文件为准，Node/pnpm 与准备顺序以 CI 为准。CI 目前并行准备 Chromium headless shell、API/数据库和 production Web，等待各子进程成功后启动 API `127.0.0.1:4000` 与 Web `127.0.0.1:8080`，通过正常 BFF 验 readiness，再运行 `pnpm --filter web test:e2e`。这里只提供说明，本批未运行这些命令。

## 覆盖范围

| 测试文件 | 关键旅程 |
| --- | --- |
| `foundation.spec.ts` | 浏览器 → Web BFF → API 健康及 PostgreSQL public-menu fixture |
| `staff-identity-routing.spec.ts` | Staff 登录、签名会话、角色 landing 与 Accounting 直达 |
| `admin-action-mfa.spec.ts` | 真实 MFA UI/命令与可丢弃挑战；CI 本地 API log 观察 |
| `customer-benefits.spec.ts` | 顾客/会员/积分/券与认证合同 |
| `customer-controlled-checkout.spec.ts` | 确定性 Store Balance 覆盖全额、`externalCents=0` 的受控结账 |
| `pos-device-admission.spec.ts` | 设备 enrollment、双签名 cookie、purpose=pos 会话和 Store guard |
| `pos-order-print-handoff.spec.ts` | POS 看板/推进与持久 Print 交接；无物理代理时 PENDING / CLIENT_OFFLINE 是有效边界 |
| `pos-display-pwa-continuity.spec.ts` | 同 BrowserContext 的 POS/Display 快照同步、reload 后会话/设备/购物车连续性、manifest 与零 service-worker 注册 |

Chromium 单 worker，CI 一次 retry；失败保留 trace/screenshot/video、HTML report 和 API/Web/准备日志，具体路径见工作流。先确认测试 SHA、第一处有意义的失败步骤和诊断，再在原任务范围修根因；不靠重写快照或削弱 guard 变绿。

## 明确未覆盖

本层不替代单元/架构测试，不验真实 Clover charge/Terminal、Uber provider、物理打印 ACK、Windows 双屏位置/原生全屏或门店冷启动。受控零外部金额结账不证明真实支付验收。

当前 PWA 合同为 Customer/Admin/Accounting/POS 的 manifest 身份与 standalone launch；Customer Display 不可安装。动态业务状态依赖网络，生产/CI 不注册 service worker。A5-D3 早期 service-worker/offline 表述已被后续 Option C 收缩替代，不能从归档的旧阶段文字恢复离线订单/支付承诺。真实工作站运行观察见 [工作站手册](../../../tools/windows-pos-workstation/README.md)。
