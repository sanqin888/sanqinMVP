# Runtime 最小执行器 Mac 入口

## 2026-10-31：采用生产首用验证，隔离验收后置

**PRODUCTION_FIRST_USE_SELECTED / PREPARATION_OPEN / PRODUCTION_NOT_EXECUTED / ISOLATED_VALIDATION_DEFERRED。**

用户已决定：完成必要代码与操作准备后，在现有生产实例的明确非营业维护窗口进行首次正常安装／更新验证；新隔离实例及未做的隔离故障测试统一后置，完整VM／数据库恢复实演亦列入后置验证任务。本决定替代下文旧版“全部D4隔离验收通过后才能进入生产”的先后顺序；历史记录和隔离case判据保留，不将延期记为通过或删除缺口。

生产首用前仍须完成：Mac客户端兼容与真实SSH参数核验、首次安装操作者通道及准确任务结果查询；固定准确生产目标、main来源／发布镜像／Runtime归档与独立审阅的bootstrap，保持原来源、原两锁、门禁及现场检查。已登记操作者Mac为macOS 10.15.8、x86_64、系统Python 3.8.2、OpenSSH 8.1p1／LibreSSL 2.7.3；当前客户端仍要求Python3.9+，静态审阅未见明显3.9专用语法/API，但尚无3.8.2兼容实测，不能视为准备通过，也不降低版本门槛代替验证。

执行顺序为：只读预检与材料核对；落实非营业维护窗口及业务/外部写入、进行中事务处置安排；通过已审阅Mac通道提交一次受控首次安装任务；在同一任务监督和原两锁内，沿既定维护流程记录准确原件、加载门禁、禁自动重启并确认实际停写；原任务暂停等待操作者手动创建准确生产实例快照、available及内容核验，并等待原恢复材料机外耐久保存与确认；条件满足后由原任务继续工具写入及正常交接，核工具、门禁、原应用/DB/卷、策略、健康端点及真实结果。后续正常发布仅按真实需要与准确计划/批准执行，不为补验收数字在生产刻意制造SQL、连续发布或回退场景。

失败或结果未知时，按既有准确原件/同代次收尾与事故保留规则处理，核实际容器及marker状态；不自动重提、重放SQL、重开业务或恢复快照，不将本地SSH返回或旧完成审计单独升级为成功，也不把FENCE_UNCONFIRMED当停写保证。维护窗口结束时间不能作为保证恢复营业的依据；快照恢复所需的新实例与连接/切流安排仍须纳入现场恢复准备。

后置任务统一登记在D4 runbook：隔离实例创建/身份绑定、脱敏基线与隔离TLS/路由/外部调用准备、原20项隔离矩阵及未做的断线/并发/杀进程/部分写入/daemon/socket/VM重启/交接边界等故障验证、完整VM与数据库恢复实演。全部未执行项保留DEFERRED/NOT_RUN，未知项保留UNKNOWN/BLOCKED；生产现场证据按生产首用范围登记，不能冒充隔离case PASS。交付进度分开记录“生产首用验证结果”和“后置验证缺口”，不宣称完整故障/恢复验收完成，不标restoreProven或无保留MINIMAL_EXECUTOR_COMPLETE。

本批仅文档调整，已审阅owner/依赖图，基线无变化：17+Manifest、250commits/300files、九helper/三永久模板和唯一应用state保持；不新增schema、依赖、常驻控制器或绕过开关，C1受保护加载/自建CPython/R2 CA研究继续暂停。本次未执行生产/AWS/DB操作或项目测试；下一步先完成Mac兼容、操作者通道及首次安装结果查询，再准备生产首用维护流程。

本批[PR #3057](https://github.com/sanqin888/sanqinMVP/pull/3057)最终head `6b8d1e77cfef23228160021b37779e4eed2a3c48` 经[CI #7809](https://github.com/sanqin888/sanqinMVP/actions/runs/41054754179)SUCCESS（4成功/6范围跳过；两条Release各1416、Runtime1080、既有C1回归412），已合并dev `b3ec0a2e046ecf0467f0b7b81115533e78cff292`，无需CI修复；无生产/AWS操作。

当前采用生产首用验证：先完成Mac兼容、首次安装交互/结果查询与准确生产材料准备，在非营业维护窗口执行正常安装／更新；隔离实例、隔离路由和完整故障/恢复测试按[后置统一任务](Runtime最小执行器D4隔离验收方案.md)延期，保留未验收状态。

> **2026-10-30（America/Toronto）｜D3_MAC_ENTRY_MERGED_DEV / SOURCE_CI_VERIFIED / MAC_ACCEPTANCE_OPEN / NOT_INSTALLED。**本文对应已合并dev、通过CI的源码；真实Mac和隔离执行仍待验收，不表示生产工具已安装或已允许执行生产更新。

## 前置条件与固定目标

客户端是本地 `ops/release/sanq-deploy.sh` 与相邻 `sanq_deploy.py`，不加入 VM 的九 helper、27 项安装集合或 17+Manifest。需要普通 Mac 用户、系统 `/usr/bin/python3` CPython 3.9+、`/usr/bin/ssh`、已安装并验收的 VM 工具，以及既有 ubuntu 用户的非交互 sudo 能力。Mac启动器使用-I -S -B隔离环境、用户site和脚本目录的导入，客户端仅用标准库。客户端不安装 Python、工具、密钥或 sudoers，不接受自定义 sudo/SSH 程序。

使用账户数据库中的真实 home，不从 HOME 环境变量、当前目录或命令参数选择目标。手工准备唯一固定目录 `~/.sanq-deploy/`，真实目录为本人所有、0700，且只能有下列三个真实普通单链接文件，均为本人所有、0600 或0400：

| 文件 | 固定格式 |
| --- | --- |
| `target` | 一个小写 ASCII DNS 名或规范 IPv4，最后恰好一个 LF；无用户、端口、URL、选项或其他行；≤256字节 |
| `known_hosts` | 恰好一行 `sanq-runtime ssh-ed25519 <base64主机公钥>` 加 LF；只接受合法 SSH Ed25519 二进制公钥；≤1024字节 |
| `identity` | 本人用于 ubuntu 登录的私钥文件；≤64KiB；客户端只核元数据，不读取或打印私钥字节，由 SSH 读取 |

主机公钥必须先通过 AWS 受信控制台等独立渠道核对 SHA256 指纹，再由操作者手工放入固定文件。不要将未核对的 ssh-keyscan 输出当作首次信任；客户端不自动抓取、接受或更新主机密钥。主机变化或密钥轮换必须重新独立核对并显式更改本地配置。当前未核实生产 VM 的 Ed25519 主机公钥，不能为它填造内容。

客户端不会提示密码或私钥口令。加密的身份密钥需要操作者预先按自己的凭据管理方式载入本机 SSH agent；仅允许传入本人所有的真实 agent socket，IdentitiesOnly 仍限制固定 identity，禁止向远端转发 agent。profile 命令只显示固定目标和已保存主机公钥的 SHA256 指纹，不证明首次公钥来源已经核对。

```sh
/bin/sh ops/release/sanq-deploy.sh profile
/bin/sh ops/release/sanq-deploy.sh --help
```

文件缺失、权限错误、软/硬链接、FIFO、额外目录成员、非法主机/公钥或本次观察期间的替换均阻断；不自动 mkdir、chmod、清理或修复。home 不得由组/其他用户写入；配置目录与原文件 FD/路径身份在 SSH 前后重核。此约束不提供对本机账户所有者主动更换配置的隔离。

## 计划、执行与查询

下表为普通发布源码接口，不包含尚待接线的首次安装Mac同伴。生产首用按文首新方案落实客户端兼容/SSH、VM工具安装、准确目标/材料、维护窗口及快照等条件；之后仅为真实需要调用准确计划的正常发布。SHA 为准确40位小写hex；plan-id、SQL审阅摘要和回退兼容摘要均为准确64位小写hex，不是分支、标签或latest。

| 本地参数（接在脚本后） | 固定 VM 操作 |
| --- | --- |
| `plan --target-sha <SHA>` | `collect_deployment_plan.py prepare --target-sha <SHA> --save`，准备并保留计划 |
| `show-plan <plan-id>` | `collect_deployment_plan.py show <plan-id>` |
| `show-sql <plan-id>` | `collect_deployment_plan.py show-sql <plan-id>`，展示准确待执行 SQL 与摘要 |
| `apply <plan-id> --confirm-release [--approve-sql <摘要>]` | `release_task.py submit`，仅提交这个计划；SQL批准不能作为长期通行证 |
| `status <plan-id>` | `release_task.py status`，只查询，不恢复/重放 |
| `logs <plan-id>` | `release_task.py logs`，只取既有有界日志，不跟随 pager |
| `plan-rollback` | `collect_deployment_plan.py prepare-rollback --save`，准备唯一 state 所记录的 previous |
| `show-rollback <plan-id>` | `collect_deployment_plan.py show-rollback` |
| `show-rollback-sql <plan-id>` | `collect_deployment_plan.py show-rollback-sql`，审阅已应用的额外 SQL，不执行反向 SQL |
| `check-rollback <plan-id> --approve-compatibility <摘要>` | `release_task.py check-rollback`，仅复核 |
| `rollback <plan-id> --confirm-rollback --approve-compatibility <摘要>` | `release_task.py submit-rollback`，须独立准确批准 |
| `status-rollback <plan-id>` | `release_task.py status-rollback`，按回退目标观察 |

先保存和独立保留 VM 返回的 plan-id；审阅计划、候选、SQL/兼容摘要后，才调用带准确确认的提交命令。客户端不解析 READY、SSH退出0或 transient unit success 为应用 ACTIVE，不保存另一份应用 current/previous，也不替代 VM 的来源、安装门禁、锁、迁移及执行前复核。

只有 apply/rollback 的 VM submit 路径负责创建既有 transient service；客户端不创建 scope/pty、不发远端后台 shell，也不暴露 VM 的内部 run/cleanup、任意命令、安装、恢复或取消入口。计划准备是同步审阅操作；已经提交的发布任务脱离 SSH 运行。SSH断开、客户端超时或信号退出不表示远端任务已停止，严禁据此再次提交。重连后用原 plan-id 的 status/status-rollback 与 logs 核查；若计划准备响应中断、尚未收到 plan-id，先在VM只读核查已留存计划，不猜另一个latest或自动重试。信息未知就保持未知，不自动恢复快照或重开业务。

## 传输与本地失败语义

连接固定 ubuntu、端口22，使用 /usr/bin/ssh、空 SSH 配置和唯一 alias 公钥，StrictHostKeyChecking=yes，仅 Ed25519 主机密钥，不读取默认 known_hosts、不自动更新密钥。禁代理、转发、PTY、复用和本地命令；不允许 host/user/port/key/路径/任意 SSH 选项覆盖。每次只发起一次 SSH，不自动重连或重试命令。

远端固定 `cd /opt/sanq/runtime && exec /usr/bin/sudo -n -- /usr/bin/python3 -E -S -B -X pycache_prefix=/dev/null`，再接两个既有 helper 之一及固定词元、已验证 hex 参数。无任意 shell 文本或可变解释器。远端仍需验证真实安装和现场；SSH认证成功本身不等于工具验真成功。

本地最小环境不传 BASH_ENV、PYTHONPATH、DYLD 注入或 askpass 程序，身份/主机文件路径受限。进程无stdin、新进程组，输出分别限制 stdout 4MiB、stderr 64KiB；输出在完整捕获、UTF-8/终端控制检查及本地配置复核后开始；传输失败时不输出已收集的半份审阅结果。普通show/logs最多60秒，计划与任务/状态最多900秒，连接10秒/单次尝试；这只是本地连接预算，不能据超时宣称远端未产生副作用。异常时尽力结束本地 SSH 进程组，不发送远端 stop/cleanup/abandon。SIGINT/SIGTERM/SIGHUP还原本地信号处理后返回中断状态；SIGKILL无法由客户端兜底。

SSH/远端非零退出按原码返回；本地阻断返回1，中断返回128+signal。非零、未知、输出超限或文件漂移均不写本地成功状态、不重提；已经返回的 TASK_QUEUED 仅是 VM 提交响应，最终结果必须查询 VM。客户端不会宣称停止客户端就冻结了营业写入。

参数语义核对来源：[OpenSSH ssh(1)](https://man.openbsd.org/ssh)、[ssh_config(5)](https://man.openbsd.org/ssh_config)。当前仅审阅官方语义和源码；目标 Mac 实际 OpenSSH/Python、keychain/agent、公钥、sudo、VM工具安装及真实 SSH 断线行为仍需 D4 验收。

## 本批验证与后续

新增26项测试定义：准确命令映射与独立确认、SQL/兼容摘要与注入/重复/缩写参数拒绝；真实临时本地文件、元数据/私钥不读、公钥/host、替换/权限/链接/FIFO、最小环境与 agent；以本地管道子进程模拟 SSH 的有界输出/UTF-8/退出255/超时/文件漂移，以及本地profile、提交响应不冒充ACTIVE、信号恢复、非Mac/root拒绝和含空格路径、恶意搜索路径/同目录stdlib阴影模块下的shell启动器。测试不连接 SSH 或生产。Python3.9源码/3.10测试 AST、嵌套符号、重复测试和读回静态核对完成；本地未运行项目测试；上述26项已随最终head两条Release各1416项通过CI，真实Mac行为仍未验收。

下一步先解决已登记x86_64 Mac的Python3.8.2与当前3.9+门槛不匹配、核真实SSH参数，再完成首次安装操作者/结果查询接线和准确生产材料准备。就绪后在非营业维护窗口进行生产首用验证；新隔离实例、完整隔离故障矩阵与VM/数据库恢复实演统一后置。更新前停写、手动快照、内容核验、恢复材料及离机确认继续保留，不伪改restoreProven或把未验收记为通过；生产当前未执行，暂停研究保持。
