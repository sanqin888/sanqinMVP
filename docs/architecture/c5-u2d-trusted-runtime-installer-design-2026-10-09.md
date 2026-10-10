# C5-U2D — Trusted Runtime Installer Design & Recovery Contract

**状态：DESIGN PROPOSAL / SOURCE REVIEW REQUIRED / NOT AUTHORIZED FOR PRIVILEGED IMPLEMENTATION / PRODUCTION NO-GO**  
**日期：2026-10-09 America/Toronto（生产证据为 2026-10-10 UTC）**  
**分支：`audit/c5-u2c-runtime-live-consumers`（沿用尚未提交的 U2C 证据文档，不混入生产写入）。**

## 0. 目标、已确认事实与设计授权边界

为**已存在的**真实目录 `/opt/sanq/runtime` 设计一次由操作员独立批准、可核验、无双重 rename 空窗、可停机调查与人工恢复的 Runtime **源文件版本更新**。不是首次安装、App 镜像部署、数据库迁移或无人工监督的自动恢复。

已确认事实（均为生产现场证据而非持续证明）：

- `runtime-release.json` 受保护 Manifest 与 17 个文件 **17/17 PASS**；安装的 Runtime **source SHA** 为 `a84b72007e6b4e82c981101e56c897355757c0ff`。
- 当前 API/Web/Worker image / `.env` / release-state `current` 为 `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`，`phase=active`，`previous=a84b7200…`。**这两个 source / application SHA 不是同一维度，绝不互相覆盖。**
- `.env` ubuntu:ubuntu 0600，state root:root 0600，C4 marker root:root 0644、内容检查 PASS，Runtime root root:root 0755。
- `sanq-app-api-1` 和 worker 的实际 bind source 均为 `/srv/sanq/uploads`；PostgreSQL 为原 `sanq-app_pgdata`。备份 timer 当时 `active/waiting`、backup service `inactive/dead`；MCP tunnel 仍活跃。
- 临时 `/proc` 引用扫描只见操作员 shell 与三个检查进程的 `cwd`；**不是**维护时全局隔离证明。
- `/opt/sanq` 和 Runtime 同设备 `66305`、ext4；**独立**测试目录上的 `renameat2(RENAME_EXCHANGE)` 和反向交换、sentinel/inode 校验、精确清理均 PASS（2026-10-10 03:51:36 UTC）。这**不**验证断电持久性或活跃文件描述符行为。
- U1、U2A、U2B 已在 `dev` 经 CI 全绿，分别提供**惰性合同**、**外部证明后惰性暂存**、**仅 /tmp 非 root 的离线目录交换/故障注入模型**；都**不能**作为 root 生产安装器。
- U2C 现场证据详见 `docs/architecture/c5-u2c-production-runtime-consumer-audit-2026-10-09.md`（目前同分支本地未提交）。

现有 C4-P2-A 手册明确 **不恢复已取消的长期 Root Launcher、自动安装器及 active symlink**；`SOURCE_FILES` 严格 17 文件。U2D 提议的 root-private **一次性受控安装事务**是**新的、尚未获授权的生产安装职责**，不是复活常驻 Launcher。若需要扩大该职责、执行已有 Runtime 的任何生产写入或变更模块边界，必须先解释影响并取得**明确授权**。本任务只创建审阅用设计文档，不创建可执行 root 安装代码/PR，不运行本地测试，不操作生产 VM。

## 1. Owner 边界及绝对不变量

| 责任 | Existing / proposed owner | U2D 边界 |
| --- | --- | --- |
| 发布来源、镜像和 Runtime Archive 证明 | 现有 `publish-images`、`runtime_trust.py`、`stage_bundle.py` | 保留确切 `main` full SHA、CI/publish run、API/Web digest 和原始 Archive sha256；使用受保护公开状态证明，不信任 Manifest 自签名或 staging 声明 |
| 不激活的入站字节 | U2A `prepare_runtime_update.py` | 非特权隔离产物永远不具执行/生产修改权限；root 必须复制**原始压缩包字节**进入 root 私有目录再独立验签/校验 |
| 活跃 Runtime 安装事务 | **拟新增**的独立一次性 root 私有 operator-owned procedure | 仅原子交换**已完整验证**的 17 文件/Manifest + 当时三份 live dynamic state；不借由普通部署 controller 偷渡 |
| App 镜像状态/回滚 | 既有 `ops/release/deploy_release.py` | `SANQ_IMAGE_SHA`、`.sanq-release-state.json` 当前值、DB/migrations、Docker Compose 原样保留；app rollout 使用另一次审批/原 controller |
| 数据、备份、运行消费者 | `/srv/sanq/{uploads,backups}`，`sanq-backup.timer/service`，MCP，Docker | 不迁移、不删除、不重启、不改变 `sanq-app` / `sanq-app_pgdata`；必须临时排除写入及读取竞争；恢复业务访问是独立验证后门禁 |

正式 root 安装处理过程也不能自动改变任何 `readyToInstall` / `readyToDeploy` / `readyToRollback` / `authorizedToMutateProduction` 的**惰性合同值**，不能把 Archive 的 `productionActivationAuthorized=false` 解释成可执行授权。实际授权必须在独立操作员批准书中列明目标 source SHA、Archive sha256、维护窗口、快照、回退策略和批准人。

## 2. 信任链和输入固定

### 2.1 当前版本与目标版本是两个独立维度

- `oldRuntime.sourceSha` 当前为 `a84b7200…`；`application.currentSha` 当前为 `ff5be8d5…`；`application.previousSha` 是应用回退指针，不可误当“previous Runtime”。
- `newRuntime.sourceSha` **尚未指定**；必须是在 `main` 成功配对发布的精确 40 位 SHA，不能直接拿 `dev` 合并 SHA 安装。冻结 `newRuntime.archiveSha256`、API/Web digest、CI + publish run id 和对应的原始 Archive。
- 现有 `verify_runtime_release()` 检查 installed Runtime source 与之后 app 发布 SHA 的 GitHub compare 关系，并阻断变更了任一 17-member source 的普通 image-only release。**在新 Runtime 与旧应用并存的过渡窗口，不能假定此比较/回退仍然可行。** 必须显式证明“新控制器对当前已运行 app SHA 的向后兼容”，或者把 Runtime handoff 与**另行授权**的配对 app rollout 设计成隔离的维护事务；不应仅为了通过检查篡改源 SHA、Manifest 或 `.env`。
- 如新 Runtime 依赖新 image、Compose/环境键、DB 迁移或备份 helper/unit 同步安装，本“仅 Runtime”方案自动 **NO-GO**，转独立成组发布设计与审批。尤其 `SOURCE_FILES` 包含备份源码模板，但 root helper、systemd unit、外部 `/home/ubuntu/backup-db.sh` 是单独安装副本：源文件变化需要检查这些外部 consumer 是否必须同步，不能静默只切 Runtime。

### 2.2 受信任的操作者路径

1. 用户先审阅“具体实现”及生产变更计划，授权后才生成/提交可执行一次性 installer；installer 不能作为 `SOURCE_FILES` 的第 18 项，也不能创建/恢复长期 Root Launcher。
2. 推荐 **operator-run root-private one-shot**：独立核对已审阅 installer 的具体版本/sha256 和不变更的来源，人工由可信路径复制到 root 0700 专用目录；只能运行 root-owned 且没有普通用户写权限的、经过独立哈希审阅的脚本/步骤。**不得** `sudo python` 执行 checkout、ubuntu staging、未经审阅的互联网下载脚本或 U2B fixture。
3. 新版原始 Archive 从非特权隔离准备转入 root 私有区后，重新匹配 **外部 GitHub 的原始字节 SHA256**、Manifest、17-member/size、每项 hash、paired API/Web refs/digests、`sourceBranch=main`、`productionActivationAuthorized=false`；禁止重新压缩伪造发布物。
4. 不可在没有独立信任证明的情况下直接信任旧 Manifest 的自述哈希；旧 installed 17/17 是完整性、非源头证明。要人工冻结旧 Runtime manifest、安装时的 Archive/发布证明、设备/版本证据；历史 Archive 可能已过期时必须明确标记 provenance gap，不能造“PASS”。
5. Root-owned 候选目录只能经受控解包**精确**源文件和 Manifest；目录及所有成员均拒绝 symlink/hardlink/special inode/扩展文件、危险权限、TOCTOU 目录替换和跨设备。目录 root 0755 或更严格，源文件 root:root 0644 或更严格，保留必要执行位；`runtime-archive.tar.gz` 保存在单独 root-private proof area，**不放进 active tree**。

## 3. 动态状态和 inode 决策（审批必选）

Runtime 归档**不包含** `.env`、`.sanq-release-state.json` 或 `.sanq-backup-layout-activated`。三者在候选目录中必须取自维护门禁锁定后的**现役生产字节**，不可从备份历史或新归档猜测/重写。

**推荐：path-level logical identity + 独立私有副本，不承诺 inode 原值不变。**
- 从当前 live 文件逐项读取、复制，并验证大小、hash、uid/gid/mode，避免硬链接、软链接与共享 inode；用 fsync 保证候选有落盘内容，候选独立 inode 是**预期行为**。
- `.env`：ubuntu:ubuntu 0600，恰一 `SANQ_IMAGE_SHA`；不能回显内容。State：root:root 0600，`phase=active` 且 `current` 与 `.env`、running app 镜像标签一致；保存 `previous` 字段且**不得将 U2D 安装状态写入应用 release-state**。C4 marker：root:root 0644 或更严格、内容与旧版一致，**不重新激活**。
- 交换前后比对三份 dynamic bytes/uid/gid/mode 及操作员私有证据；任何差异均停止。Journal root 0700 文件可以含敏感文件摘要用于比较，但审计输出仅报告 PASS/FAIL，不打印 secrets 或可反查的敏感哈希。
- 原目录旧 dynamic inode 保留在“旧 Runtime”树内；新活跃目录的动态 inode 更换。必须证明维护窗口没有持有旧 fd、cwd、映射或使用 inode 的消费者；旧、新 env/state 不硬链接且不并发写。
- **替代方案：严格保留旧 inode。** 对整个 Runtime 目录做 inode identity 不变的交换与独立旧树保留无法天然同时成立；若这是硬需求，需设计其他发布方案并重新审阅兼容性/原子性，不得私自将目录交换改成原地覆盖。用户须明确选择以上语义后，才能实现生产切换代码。

## 4. 维护排他与生产消费者

单独的 root-owned `/opt/sanq` 锁文件 + advisory `flock(LOCK_EX|LOCK_NB)` 只能协调**愿意遵守它的事务参与者**；**现有** deploy controller、backup 和 MCP 并不会自动识别新锁。**锁本身不能满足 quiescence**。

在任何候选进入 active 前必须有独立操作员核准的**维护屏障**：

- 从 `/opt/sanq/runtime` 退出所有操作 Shell 的 `cwd`（例如 `cd /home/ubuntu`）；不让安装脚本自身 `cwd` 指向待交换目录。
- 保存 timer 原始 active/enabled、触发时间；在另外批准的生产窗口内暂停 timer，确认 `sanq-backup.service` 无活跃 pid、无残留 `backup-db.sh`/root-protected helper/rclone/tar/sql dump 操作；**只暂停 timer 不够**，结束后按原状态恢复而不是统一 enable/start。
- 禁止并发 `deploy_release.py deploy/rollback --execute`、`docker compose`、readiness 操作，以及任何改变 Runtime state/env 的写入；在屏障期间禁止 MCP 新发生产子进程。由于 MCP 活跃但不保证排他，必须有单独受审阅的连接/服务暂停或维护排他方案；不得在没有路径级进程审计时声称安全。
- 立刻复核 `/proc` cwd/fd、systemd、备份任务、current docker image/mount、DB volume；更严密的跨进程门禁仍需实现/审查。任何竞争者或 active release-state 的 `pending` → **BLOCKED**。
- 容器在未受影响的 volumes 上可保持运行，**但这是允许不重启的初步假设**；若出现 Compose bind/working-directory 引用或不兼容源码则另行审批。绝不自动 stop/recreate DB、应用、worker、Uploads 或备份服务。
- root 操作必须独立于 SanQ VM MCP 的受限工具；不要让 MCP 权限扩大成任意 shell 或 sudo 操作以完成该任务。

## 5. Host transaction 与持久化证据（设计合同）

布局均为**拟议命名**而非获授权可执行地址。所有中间资产须在同一个 ext4 设备上、非 symlink、root-owned、不可被非 root 修改；`/opt/sanq/runtime` 一直是**真实目录**。

- 活跃入口：`/opt/sanq/runtime`（存在、必须通过当前完整性检查）。
- 完整独立恢复快照：`/opt/sanq/.runtime-recovery/<txid>/preimage/`，带旧 17-member/Manifest、动态文件、原始 archive 证明索引和 metadata；root 私有、创建成功后禁止在同事务覆盖/删除。需要独立备份/异机恢复能力证明，不能只依赖同盘快照。
- 待交换候选：`/opt/sanq/.runtime-handoff/<txid>/candidate/` **不能直接与 active 做相同父目录的名称交换**；原子 exchange 对不同父目录需由已审阅代码正确传入两个目录 fd，或在 `/opt/sanq` 下先建立唯一无歧义的 root-private 候选顶层入口，再用该路径与 `runtime` 的父目录 fd 交换。U2B 的同一 parent fixture **不能不经适配地当作生产路径模板**。
- Journal 和 exclusive lock：`/opt/sanq/.runtime-handoff-journal/<txid>.json`、`/opt/sanq/.runtime-handoff.lock`（root 私有、在 Runtime 之外）。拒绝已存在同 txid、任何未关闭的其他 txid、symlink/不受信任目录/设备不一致；拒绝没有处置的异常事件。txid 为可信生成的不可复用随机 id，而非用户可注入路径。
- **必须先**完成旧完整快照、源哈希 + 原始 archive/应用 digest 证明、候选独立 dynamic 副本和 preflight，全部验证且 fsync 文件/所有有关目录及证据，**然后**落盘 `PENDING_EXCHANGE` journal（临时文件 fsync、os.replace、journal parent fsync）才允许交换。
- 交换动作：单个 syscall `renameat2(RENAME_EXCHANGE)`，前后位置均是不同的真实目录；目标 fs 同设备且支持该 syscall 已于 U2C 测过，仍要当场重新确认必要条件。不运行两次普通 rename，不用 symlink。成功后 fsync 两个有关 parent dir；不得假定交换 syscall 自身等于断电落盘保证。
- 交换后**立即**按 root-trusted 规则重验 `/opt/sanq/runtime` 和旧版所在槽位，三份动态文件、Manifest、17 member、运行镜像/volumes 不变；将 `EXCHANGED_UNCONFIRMED` journal fsync；将旧版只在确认无旧引用和不可覆盖后保留为 versioned previous 槽位，fsync，写入 `PREVIOUS_RETAINED`。
- 人工在维护屏障内完成应有的静态、健康和备份/配置一致性验证，审阅留存的快照及手动恢复记录，才将安装事务自身标记 `VERIFIED_RETAINED` 并 fsync；**不会**把 app release-state 重新写成 ACTIVE，也不自动授权镜像升级。按原状态恢复备份和 MCP 通道之前最后验一次兼容性/服务，恢复后再次观察。
- 若 source change 已使运行中的外部备份 helper/service/backup-db.sh 不兼容、或者部署 controller 对当前 app 镜像不兼容，则不能标记 `VERIFIED_RETAINED`；进入单独成组设计审批。

**事务不可变事实：** `transactionId`、`oldRuntimeSourceSha`、`newRuntimeSourceSha`、两份 archive digests/publication ids、两份文件集 hash/owned metadata、`applicationCurrentSha`、`applicationPreviousSha`、三份 dynamic 比对证明、old/new 目录 inode/device、operator consent-id、quiescence snapshot time、恢复路径与预期相位。Journal 只写 root 私有系统，不包含 `.env` 明文、token、SQL/Customer 数据；输出脱敏摘要。检查器必须既查 journal 又查实际旧/新文件集、inode 和锁，不信任 journal 单方宣称。

## 6. 事故恢复：fail-closed / inspect-first / manual-only

`PENDING_EXCHANGE` journal 的目的是**允许恢复调查**，不是自动继续交易。异常发生时阻止新的安装、镜像发布和备份/MCP 并发消费；保留两版本、Journal、旧快照、动态文件，避免未经比对的脚本重新运行。`renameat2` 的支持证明不等于物理断电持久性保证。

| 中断/事故时刻 | 可能观察到的磁盘事实 | 处理合同 |
| --- | --- | --- |
| 独立外部发布证明/旧文件/当前 state 门禁失败 | active 仍旧版，无有效 PENDING | **无写入**；只报告 BLOCKED；不得修补 Manifest 或绕过权限 |
| 私有候选/旧 snapshot 准备中中断 | active 应仍旧版；可能残留部分 candidate 或 snapshot | 将不完整资产视为不可信，隔离且保留证据；人工核对后处置，禁止 auto-clean/auto-install |
| PENDING journal 持久化后、交换调用前 | active=old, candidate=new，快照有效 | 人工复核两边和原因；可**单独批准**取消交易、归档证据，不能仅删除 PENDING 清锁 |
| 调用 exchange 时/返回后但 journal 更新前（含 fsync 窗口、机器断电） | active 可为 old 或 new；另一槽位可能相反；元数据未必如最后已确认状态 | **不能仅凭 phase 判定**；外部目录 inode + 双方哈希 + 旧快照/公证对照后人工选择保留/回退；任一缺失或不一致 → 进一步隔离/外部恢复 |
| exchange 已证实，新版 root 校验失败 | 仍应有旧版槽位和独立 preimage | 保留事故现场，不自动二次 exchange；单独审阅动态文件差异、运行镜像、DB/Uploads、backup 与恢复兼容性 |
| EXCHANGED journal 后、旧槽位 rename 前后 | active=new，old 在候选槽或 previous 槽；旧 snapshot 独立可恢复 | 经人工核验确认实际旧槽位置；不得因日志写滞后视为自动成功；不可覆盖现有 previous |
| VERIFIED 前健康/配置/备份验证失败 | active 可能为 new，old 保留，原 app image 应不变 | 维持维护屏障，由独立批准操作员比较 `.env`/state 与容器；可以批准恢复旧 Runtime，但不自动回滚应用/数据库 |
| VERIFIED 后新的故障或需回退 | active=new，old snapshot 已冻结，已有核验记录 | 作为**新的**受审阅 Runtime rollback 事务处理，重新冻结状态、备份和维护窗口，不清除历史恢复资产 |
| 发现无旧版完整快照/源码 provenance 缺口/不支持原子 syscall/文件损坏 | 状态不可信 | 永远 BLOCKED；优先隔离恢复证据/从独立可信备份恢复，而不是猜测源文件补全 |

**人工 Runtime 回退前的独立判定：** 原 app 版本仍然与恢复版 Runtime 兼容吗？现役 `.env`/release-state 有无在事务后更新？原旧版的动态配置/应用回退指针可能过时。若任一不一致，**不直接用旧版 .env/state 覆盖**。先把运行中的应用、上传/备份状态和原 Release State 协调为有审核的单一事实；不得自动触发 `deploy_release.py rollback --execute`、`prisma migrate`、数据库 restore。

**恢复完成不是自动释放**：须独立人工校验目标 active 实目录、17-member、Manifest、三份动态文件、C4 marker、固定 Compose 和 DB volume/Uploads、API/Web/Worker 健康、备份 timer 原状态，归档事故与操作批准记录后才能重新开放消费者。

## 7. 必须完成的测试和验收矩阵（未来实现工作包）

### U2D-1（推荐下一实现单元，仍非生产 installer）

纯数据合同/只读分析器：验证交易 intent、不同 Runtime/app SHA 的双维身份、状态转换、候选/旧快照信任、动态文件 owner/mode/inode 政策、journal 事件与“实际目录推断”不一致时 BLOCKED。只在 GitHub CI 的隔离测试环境执行，不增加 root 生产修改接口。

### U2D-2（单独架构授权后的实现）

独立 root-private one-shot 安装器及控制台证据，离线不涉及生产的 root-private fixture/fault injection；覆盖：
- 新旧 SHA 相同、source file 未变、错误 main ancestry、过期/伪造外部 publish run/archive digest、伪造 `authorized` 标志。
- 本地与 root-private 复制后 SHA256 漂移、Manifest 17 缺失/多余、symlink/hardlink、OWNER/MODE/TOCTOU、跨设备、目标目录占用、同名 txid、并发事务锁。
- `pending` App release-state、环境 SHA 与容器镜像不一致、数据库/Uploads/Compose 身份漂移、活跃 MCP/backup/helper/SSH cwd 竞争。
- .env 备份/恢复时 owner/mode/内容保持、state `previous` 字段保持、C4 marker 不变；新旧 dynamic files **无 hardlink**、inode 可以不同且无在途引用。
- 每个文件/目录 fsync、pending journal、exchange 前后、目录 fsync/old retention/final journal 的故障注入；包括 **真实子进程 SIGKILL 级**实验，并在独立隔离宿主机检验异常恢复；不能把普通 unittest exception 注入当作 crash/power-loss 证明。
- 恢复只读观测矩阵、无自动 rollback、失败时完整留存，旧 snapshot 恢复练习；所有退出都不接触数据库/Docker/用户数据。

### U2D-3（另行生产授权的执行与验收）

冻结目标 main SHA、外部独立 digest、经过审阅的 root-only executable hash/操作员授权与维护窗口；验证当日备份+可恢复性、源/目标 17-member 两套证据及不可覆盖 previous；获得授权才可以在生产执行。**必须分开** Runtime handoff 与 App deploy/rollback 的审批记录。

## 8. 用户需要先批准的架构决策（设计阶段不作推定）

1. **特权执行身份**：接受“一次性 root-private、人工审核的 operator-owned 安装程序/步骤”代替更宽的自动服务吗？这新增的是安装事务职责，但不复活常驻 Root Launcher，也不把 installer 塞进 17-member allowlist。替代是独立签封的 installer bundle（范围更大、发布/验签机制更多），或继续手工逐步骤审查但不新增代码。
2. **动态文件身份语义**：接受 `.env`/state/marker *路径语义 + 原样字节/owner/mode* 且在 quiescence 下 inode 变化，还是要求 inode 不变？后者与整个目录 exchange 不兼容，需重新设计。
3. **兼容性与执行范围**：Runtime-only handoff 是否允许“新版控制器暂时服务旧版已运行 app”，并提供明确兼容证据？如果不允许，另起一份 Runtime+App 成组窗口及批准；U2D 不得自行放宽 `verify_runtime_release`。
4. **运维排他**：是否同意在**后续独立获批的**生产维护窗口暂时隔离 MCP 生产调用、暂停 backup timer 并检查 service/helper，且关闭操作 Shell 的旧 cwd？**本设计不授权现在执行任何 stop/disable。**
5. **保留期/恢复资产**：旧 Runtime 完整树、原始 Archive、外部证明及 C4 已有 `/opt/sanq/.c4-p2c-rollback.*`、`/home/ubuntu/sanq-app` 等一律不清理，直至单独 retention 审核批准；旧源程序和应用镜像的恢复可用性不能凭 Manifest 推断。

**当前裁定：`U2D DESIGN DOCUMENT READY FOR REVIEW / PRIVILEGED INSTALLER NOT AUTHORIZED / PRODUCTION HANDOFF BLOCKED`.**

根据 `AGENTS.md`，本地完成后停止，提供变更报告；用户审阅后另行授权提交 `dev` PR、CI 检查全绿后合并。不能将文档设计授权等同于生产修改授权。
