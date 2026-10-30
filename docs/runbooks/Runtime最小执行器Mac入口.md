# Runtime 最小执行器 Mac 入口

> **2026-10-30（America/Toronto）｜D3_MAC_ENTRY_LOCAL / TESTS_NOT_RUN / MAC_ACCEPTANCE_OPEN / NOT_INSTALLED。**本文对应本地待审源码，不表示生产工具已安装或已允许执行生产更新。

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

下表为源码支持的接口，生产安装和统一隔离验收通过前不要对生产调用。SHA 为准确40位小写hex；plan-id、SQL审阅摘要和回退兼容摘要均为准确64位小写hex，不是分支、标签或 latest。

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

新增26项测试定义：准确命令映射与独立确认、SQL/兼容摘要与注入/重复/缩写参数拒绝；真实临时本地文件、元数据/私钥不读、公钥/host、替换/权限/链接/FIFO、最小环境与 agent；以本地管道子进程模拟 SSH 的有界输出/UTF-8/退出255/超时/文件漂移，以及本地profile、提交响应不冒充ACTIVE、信号恢复、非Mac/root拒绝和含空格路径、恶意搜索路径/同目录stdlib阴影模块下的shell启动器。测试不连接 SSH 或生产。Python3.9源码/3.10测试 AST、嵌套符号、重复测试和读回静态核对完成；未运行项目测试，本批尚无CI。

下一步由CI验证这批代码，再进行D4统一隔离安装、真实Mac往返、正常发布及失败冻结验收。完整真实恢复演练继续列交付后；交付前仍保留更新前手动快照、内容核验、恢复材料及离机确认，不伪改restoreProven。生产未部署，暂停研究保持。
