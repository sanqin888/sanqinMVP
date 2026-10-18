# CI 按变更范围执行

**状态：REMOTE DELIVERY / [PR #2856](https://github.com/sanqin888/sanqinMVP/pull/2856) / CI+MERGE: SEE PR FINAL HEAD。** 本批从仅条件化 Browser E2E 扩展到全部普通 CI lane 与 PR 镜像检查，用户于 2026-10-18 Toronto 明确要求“其他进程也修改为无关的不启动”。源码基线 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`；在交付分支 `ci/dependency-aware-check-scope-20261018` 完成同批增量，用户已授权远端交付；交付基线为最新 `origin/dev@2db85d32541f05e7e3268e7f5a2013812d59690e`，CI/合并以 PR 最终 head Checks 与事件为权威。

## 当前规则

每个 workflow 只先运行一个轻量范围判断作业：完整历史 checkout、标准库 Python 边界测试、Git 差异计算。无关的重作业在 job 级显示 Skipped，不分配该作业 runner、不初始化数据库、不安装应用依赖或构建镜像。其他选中作业保留原命令和失败语义；不是跳过整个 workflow，required check 名称继续存在。

| 变更 | 实际选中检查 |
| --- | --- |
| 仅根目录 Markdown / `docs/**/*.md` | 仅轻量范围检查；普通重作业跳过 |
| `ops/sanq-mcp/**` | MCP 编译/行为安全检查及必要汇总 |
| `ops/runtime/**`、`ops/release/**`、Runtime readiness / Compose | Runtime 与 Release 安全检查及必要汇总；两者有真实相互导入 |
| `ops/backup/**` | Backup、Runtime、Release 安全检查及必要汇总；Runtime Bundle 含备份源 |
| `apps/api/**` | API lint/build/strict、API Jest、Browser E2E；镜像 workflow 若被其原触发规则启动，则选 API 镜像 |
| `apps/web/**` | Web lint/build/strict/Jest、Browser E2E、API Jest；API 架构测试实际扫描 Web 的 Payments/Clover、public config 和 Uber 菜单 ID |
| `libs/**`、workspace manifests / lockfile / `.npmrc` | 两端 build/test、Browser E2E；镜像 workflow 被触发时检查两镜像。独立 printer/Windows 不因 pnpm workspace 变化运行 |
| `tools/architecture/**`、兼容登记 JSON | API 静态/架构与 API Jest |
| `tools/printer-server/**` | printer-agent；它有独立 npm lockfile，不属于 pnpm workspace |
| `tools/windows-pos-workstation/**` | windows-workstation |
| `Dockerfile.api` / `Dockerfile.web` | 对应单个镜像检查；`.dockerignore` 影响两镜像 |
| workflow / 选择器 / 未知路径，空差异或缺失历史 | 保守运行全部作业 |
| `main` push；镜像手动运行等未知事件 | 完整运行全部相关 workflow 的作业 |

上述表按路径合并影响：例如文档 + API 代码仍执行 API 路线；删除和移动均计入旧路径。应用目录内的 Markdown 不按纯文档跳过。新工作区/工具目录默认全部运行，须先审阅依赖再收窄。共享 manifest 同时影响两端 frozen install 和两份 Dockerfile，不按应用目录误判为单端变更。

## 差异与门禁

`tools/ci/change_scope.py` 为唯一范围与汇总合同：PR 比较 merge-base→整个 head，push 比较 before→after 全部提交；完整 Git 历史避免 shallow/接口 300 文件截断。NUL 分隔和 `--no-renames` 保留带空格路径与 source→docs 移动的删除证据。缺失 SHA、比较失败、空差异、未知事件均选全部；只有显式 false 才跳过。作业条件含 `!cancelled()`，防止 needs 默认成功条件把失败后的检查静默略过。

原检查名 `api-checks`、`api-tests`、`build-test (web)`、`build-test (api)`、`browser-e2e`、`printer-agent`、`windows-workstation`、两项 `image-build (sanq-*)` 均保留。拆开原静态矩阵和混合 Ops 步骤：新 `api-static` 与 `ops-checks` 承载原命令；`api-checks` 汇总两者，`build-test (api)` 继续汇总原两端静态/API Jest 依赖。汇总仅接受“选中=true 且 success”或“选中=false 且 skipped”；所需作业 failure/cancelled/skipped、缺失输出/范围失败均不能通过。

PR 镜像 workflow 保留既有 paths 并加入 `tools/ci/**`，保证选择器修改也验证两份镜像；不扩大为每次应用源码都重新构建 Docker 镜像。已触发时进一步按镜像输入拆开 API/Web。两镜像的 cache、打包/health smoke、数据上传原命令保留。`publish-images` 完全不改：main CI 完整验收、准确 SHA、成对镜像、release proof、Runtime Artifact 与 seals 均保留，不把开发分支范围跳过当成发布资格。

## 验证与边界

已编写临时合成 Git 仓库覆盖多提交 push、目标分支前进、完整 PR、删除/改名、未知路径、workspace manifest 双端影响、Web→API 架构依赖、Ops 相互导入、main 强制全量及汇总失败/取消/误跳过组合。workflow/选择器本身改动会选中全部，首次远端必须实际通过全量 CI；后续文档/Ops/应用/设备/单镜像路径须观察与范围表一致的 Run/Skipped。尚未运行本地 lint/build/test 或远端 GitHub Actions，不宣称已实测提速。

归属 Runtime / Data / CI / Ops，内部原子调整；不改应用业务代码、模块 owner/依赖图/架构基线、依赖清单/锁、数据库、17 文件 Bundle、权限或生产。ECR Public 镜像拉取限额仍可能影响真正需要 E2E 的变更，本批不更换镜像源。用户已授权，只经 dev PR 与 GitHub Actions 交付，不触及 main 或生产。
