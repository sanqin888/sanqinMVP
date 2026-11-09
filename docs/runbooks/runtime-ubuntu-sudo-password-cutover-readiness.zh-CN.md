# SanQ 生产 VM：ubuntu sudo 密码认证与精确免密授权切换预案

> 2026-11-02；**READINESS DESIGN / LOCAL ONLY / NO PRODUCTION CHANGE / NO SUDOERS INSTALL / NO BOOTSTRAP / NO RUNTIME INSTALL**。用户已批准方向：“保留 ubuntu 管理员身份、普通 sudo 要密码、仅精确自动化免密”。这不等于对生产账号、sudoers、SSH 或 cloud-init 的逐项写入授权。FI-MAC-1B3b PR #3080 最终 head `42fc7a78e8e91d8e8dbad3948b59975ec43a9ed3` CI run `41502316067` SUCCESS，并于 2026-11-02 squash 合并 `dev` `19237f13704ec0b708a9b4b114559af9c3b2ef43`；**尚未进入生产**。

## 1. 用户生产 SSH 原始只读观察（不把终端转录当独立认证）

| 检查对象 | 操作者于生产 `ubuntu@sanq-web` 观察到 | 判读 |
| --- | --- | --- |
| `id` | `ubuntu` UID 1000，属 `sudo`、`docker`、`lxd` 等组 | root 能力不只取决于 sudo，不能宣称真正低权 |
| `passwd -S ubuntu` | `ubuntu L 01/25/2026 0 99999 7 -1` | 密码锁定；不能先撤销免密 sudo |
| `sudo -n -l` | `(ALL:ALL) ALL` 和 `(ALL) NOPASSWD: ALL` 及备份 helper | 默认普通管理员权限 + 全量免密叠加 |
| `/etc/sudoers` | `%sudo ALL=(ALL:ALL) ALL`，`@includedir /etc/sudoers.d` | 默认管理员组规则可保留 |
| `/etc/sudoers.d/90-cloud-init-users` | `ubuntu ALL=(ALL) NOPASSWD:ALL` | 当前全量免密授予点，root:root 0440 |
| `/etc/cloud/cloud.cfg` | `system_info.default_user.name=ubuntu`、`lock_passwd: True`、`sudo: ["ALL=(ALL) NOPASSWD:ALL"]` | 未来 cloud-init 再次初始化可恢复旧策略，必须兼顾持久配置 |
| `/etc/sudoers.d/sanq-backup` | root:root 0440，独立允许 `sanq-backup-protected-nginx` | 必须保留，当前备份 service `User=ubuntu` |
| `sshd -T` 默认值 | `pubkeyauthentication yes`、`passwordauthentication no`、`kbdinteractiveauthentication no` | 默认保持密钥登录；仍须审查 Match/Include 与 ubuntu 实际连接 |
| `/opt/sanq/install-bootstrap`、`/opt/sanq/deploy-state` | 不存在 | 查询入口目前无生产材料，不能进行完整首次安装原件正向验收 |
| `sudo -V` | 1.9.9 | 参数正则表达式匹配不能依赖 1.9.10+ 特性；不准用通用 `*` 放行动态安装 ID |

## 1.1 2026-11-03 凭据设置阶段（操作者原始回执）

- 操作者在现有 `ubuntu@sanq-web` SSH 会话执行 `sudo -n /usr/bin/passwd ubuntu`，返回 `passwd: password updated successfully`。随后 `sudo -n /usr/bin/passwd -S ubuntu` 返回 `ubuntu P 11/03/2026 0 99999 7 -1`；`su - ubuntu -c '/usr/bin/id -un'` 提示输入密码后打印 `ubuntu`。**PASSWORD_SET_AND_SU_AUTHENTICATED / 仅操作者终端回执**，不是 sudo PASSWD 认证验证，也不是 sudoers 切换成功证明。用户未提供密码，文档不得索要/保存。
- 截至本阶段没有修改 `/etc/sudoers.d/90-cloud-init-users` 或 cloud-init 配置，`NOPASSWD:ALL` 仍然存在；后续无密码 sudo 成功是旧授权的表现，不是密码认证的证明。用户此前分享 Lightsail 新快照列表，但仍未验证其 `Available` 及实际恢复能力；现有 Mac Runtime `sudo -n` 兼容缺口继续阻断权限收缩。密码阶段已 PASS，**sudo 权限正式切换仍 NO-GO**。

## 1.2 2026-11-03 定时备份状态检查（操作者原始回执）

- `systemctl is-active sanq-backup.timer` → `active`；`systemctl show sanq-backup.timer -p NextElapseUSecRealtime` → `Tue 2026-11-03 08:30:00 UTC`（多伦多当地 03:30 EST）；`systemctl show sanq-backup.service -p Result -p ExecMainStatus` → `Result=success` 与 `ExecMainStatus=0`。
- **BACKUP_TIMER_ACTIVE / LAST_RECORDED_SERVICE_RESULT_SUCCESS（只读观察）**。这不能单凭结果属性证明最近一次数据库/远程备份归档完整，亦不能证明改动 sudoers 后的下一轮备份能够继续成功。保留 `/etc/sudoers.d/sanq-backup` 专用授权并在切换后观察下一次正常定时运行；不主动执行有副作用的备份 helper。

## 2. 本次权力边界及现有自动化消费者

- `/etc/sudoers` 中的 `%sudo ALL=(ALL:ALL) ALL` 保持，`ubuntu` 始终是管理员；日常人工 `sudo` 需密码。SSH 保持密钥认证，禁止为方便而启用 SSH 密码登录。
- `ops/backup/sanq-backup.service` 使用 `User=ubuntu`，`backup-db.sh` 第 328 行 `sudo -n "$PROTECTED_NGINX_HELPER" "$NGINX_FILENAME"`，现有 `sanq-backup.sudoers` 仅允许该 helper 且 helper 再校验**恰好一个**归档文件名。严禁改动备份脚本、服务、helper、现有来源合同；严禁仅凭 sudoers 显示授予就宣布真实备份 PASS。
- `ops/release/sanq_deploy.py` 的 `REMOTE_PREFIX` 对 `collect_deployment_plan.py` 和 `release_task.py` 的查询、计划、日志、提交、回滚全部统一调用远端 `sudo -n`；去掉全量免密后，**全部未列入新白名单的 Mac Runtime 命令会预期失败**。不能直接照旧加入 `NOPASSWD: /usr/bin/python3 ... *`：这等同授予过宽 root 脚本入口。必须分离审阅只读入口/写入型发布入口及准确凭据/单次审批，或在切换窗口明确接受 Runtime Mac 调用暂停。
- `ops/release/sanq_install_live.py` 的 `installation-submit` 是写入型命令，与 `installation-evidence-query` 不同，不得作为免密“查询”授予；`install-bootstrap/<source>` 当前也不存在。FI-MAC-1B3b 查询是否获得免密规则，必须等其固定 root-owned 来源/版本及**准确** source/retention 审阅后另行审批。
- `ubuntu` 同时属于 Docker/LXD 特权组，本方案只收紧 sudo 交互，并不提供可信 root 权限隔离、容器能力撤回或完整零信任边界。

## 3. 切换前 GATE（均须留真实回执）

**G0 身份与恢复**：先确认 AWS/Lightsail 控制台可登录、生产实例所在 Region/实例身份、已有及可创建的**手动实例快照**，并核实快照可用于创建新实例。Lightsail 网页 SSH 仍须原实例账户/SSH 权限，**不是独立 root 救援控制台**。官方另有 root 系统盘快照→新数据盘→挂载至另一实例的离线访问路径；该路径是灾难恢复备选，不能被视为已经验证成功。快照回退可能丢失快照之后的订单/会员/账目写入，运行中的数据库快照不当然等于应用一致性备份；不得以整机快照直接覆盖后续生产交易。在这两条官方恢复路径中，优先方案仍是同一运行 VM 内经验证的旧 sudoers 备份与第二管理 SSH 会话原位回退。保留一个已登录会话，另开独立会话测试；在 Mac 上保留原 SSH 密钥和 hostkey 固定信息，不通过聊天提供密码/私钥。不触碰 Docker/网络，也不在 03:30 EST 每日备份期间切换。官方参考：https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-create-a-snapshot-of-your-instance.html 、https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-create-instance-from-snapshot.html 、https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-create-an-instance-root-volume-snapshot.html 。

**G1 状态及风险补查（只读）**：

```bash
# 核实潜在用户/来源特定 Match 和 cloud-init 的 include/用户覆盖入口
sudo -n /usr/bin/grep -RInE '^[[:space:]]*(Match|Include|PasswordAuthentication|KbdInteractiveAuthentication|PubkeyAuthentication|AuthenticationMethods)[[:space:]]' /etc/ssh/sshd_config /etc/ssh/sshd_config.d 2>/dev/null || true
sudo -n /usr/bin/grep -RInE --include='*.cfg' '^[[:space:]]*(users:|default_user:|lock_passwd:|sudo:|ssh_pwauth:|name:[[:space:]]*ubuntu[[:space:]]*$)' /etc/cloud/cloud.cfg /etc/cloud/cloud.cfg.d 2>/dev/null || true
sudo -n /usr/sbin/visudo -c
sudo -n /usr/bin/passwd -S ubuntu
/usr/bin/systemctl --system show sanq-backup.timer --property=LoadState,ActiveState,SubState,NextElapseUSecRealtime --no-pager
```

如果 `sshd_config` 有 `Match`，须按真实 SSH 客户端来源的 `sshd -T -C user=ubuntu,addr=<实际客户端IP>,host=<实际反向主机>` 验证；不可以默认 `sshd -T` 代表所有来源。必要的输出均不得包含 SSH 密钥/密码。

**G2 授权例外判定**：每日备份专用免密保留；目前没有经过审阅、可在 sudo 1.9.9 中安全覆盖可变 source/retention 的通用白名单；Mac Runtime 全命令统一 `sudo -n` 的兼容缺口必须得到明确处置：要么在切换期间禁用该客户端自动化并标记 `RUNTIME_MAC_CLI_BLOCKED`，要么单独开发与审阅精确范围的代理/调用适配层。不得为了让它“继续工作”而添加通用 `NOPASSWD: ALL`、通配 Python/script 权限。

**G3 云初始化持久行为**：`90-cloud-init-users` 是已生成 sudoers，直接修改它只能改变当前实例。cloud-init 官方定义 `cc_users_groups` 为 `once-per-instance`，重启通常不会重新运行本模块；重置实例身份、手工运行 `cloud-init clean` 或在新实例重建时可能再应用旧默认策略，官方明确警告生产不可贸然重跑 cloud-init。受审候选是在 `cloud.cfg.d` 增加受限 `#cloud-config` 配置、利用 cloud-init 官方的顶层 `user` 对默认 `ubuntu` 进行覆盖（候选键仅 `name: ubuntu`、`lock_passwd: false`、`sudo: ["ALL=(ALL) ALL"]`）；但**候选还未在同版本实例验证**，不得现在写入、执行 `cloud-init single` 或假定已有 `90-cloud-init-users` 会自动替换。先在离线同版本环境验证最终 YAML 合并、sudoers 生成顺序、已有用户密码不被覆盖、组/shell/home/SSH key 未改变，再审定文件名/权限和回滚。官方参考：https://docs.cloud-init.io/en/latest/reference/modules.html 、https://docs.cloud-init.io/en/latest/howto/rerun_cloud_init.html 。

## 3.1 Mac Runtime sudo 密码认证适配决策（2026-11-03 历史只读审计；随后用户已授权方案 C）

**已核源码事实**：

- `ops/release/sanq_deploy.py` 的固定 SSH 路径 `_ssh_argv` 带 `-n -T` 和 `BatchMode=yes`，`_execute_transport` 为 `stdin=subprocess.DEVNULL`；`REMOTE_PREFIX` 固定 `sudo -n`。对读取计划、准备计划、查询发布任务、发布和回滚全部适用；每次 SSH 独立会话，无供下一次复用的认证票据。
- `ops/release/sanq_install.py` 的公开 `status` 只读 `/usr/bin/systemctl --system show`，不通过 sudo；这条**非特权状态观察路径保持原样**，但只证明观察时 systemd 属性，不可替代 root 私有原件查询或安装成功证明。
- `ops/release/sanq_install_live.py` 的 `installation-submit` 虽允许同一 SSH 会话实时 stdin，但仍使用 `sudo -n`，不能借此夹带 sudo 密码；同一 stdin 已保留给原子证据帧，混入认证信息会破坏帧合同。
- `docs/runbooks/Runtime最小执行器Mac入口.md` 明文要求固定 profile、独立 SSH 密钥和 hostkey、无代理转发/PTY、无程序密码交互、stdin 关闭、输出先有界捕获和验码。**放开 stdin/PTY 属于安全传输合同调整，不是简单替换 sudo 选项**，根据 `AGENTS.md` 需要先说明影响与替代方案并取得明确授权。

**备选方案**：

| 方案 | 优点 | 代价及结论 |
| --- | --- | --- |
| A. 现有 Mac CLI 不变，登录 SSH 后人工执行 `sudo` | 不修改旧认证/传输源码；仍可在 SSH 终端输入密码 | 原 Mac 固定命令、原计划输出及审核包装不能完整复用；切换后将 `RUNTIME_MAC_CLI_BLOCKED` 作为明确已知限制，只能用于人工应急，不能冒充正式恢复更新能力 |
| B. 对所有 Mac root Python 命令增加 `NOPASSWD` | 旧 Mac CLI 无需改动 | 违背密码认证目的；尤其 `collect_deployment_plan.py` 含准备计划及 `release_task.py` 含提交、回滚和内部动作，sudo 1.9.9 无法用参数正则安全限制变化的 plan/source；**拒绝** |
| C. 原 SSH 客户端保持原有 `-n/-T/DEVNULL/sudo -n`；新增独立明确的人工 `sudo` 密码通道（推荐，待单独授权） | 不降低原固定通道安全性；操作者只在准确批准的操作、一次 SSH 会话中通过远端受控 TTY 输入密码，避免自动缓存、命令行/环境变量/日志传递密码 | 新增 Mac 传输和认证合同；原输出先缓冲/UTF-8/控制字符防护不能简单套到 TTY；必须设计限定输出、未知结果与真实 Mac 验证，且不得扩展 VM 运行 owner |

**推荐 C 的最小实施边界（尚未开始代码实现）**：

1. 新的明确手动子入口只接受现有已验证的 `plan/show-plan/show-sql/apply/status/logs/plan-rollback/show-rollback/show-rollback-sql/check-rollback/rollback/status-rollback` 准确参数和源身份；固定现有 SSH host、key、用户、固定 VM 命令及独立确认项。保留 `sanq-deploy.sh` 原安全路径和所有现有测试；**禁止**接受任意 shell、host、port、脚本路径、SSH/sudo flags、安装内部 run/cleanup。
2. 仅人工命令单次采用经独立审查的 SSH TTY 认证模式，由真实 Mac 终端直接将密码交给 VM `sudo`；Mac Python 层不得读取、记载、缓存、打印或向进程参数/环境提供密码；不采用 `sudo -S`、`sshpass`、askpass、自动回答提示或多次自动重试。ssh hostkey pin、Agent 身份筛选、禁止转发、单次连接/超时/本地停止约束仍需实测保留。
3. 新交互渠道的 stdout/stderr 会包含 PTY 行回显/认证提示/控制字符，**不得**沿用原机器可解析 JSON 成功判定或盲目重放终端控制序列；特别是 `apply/rollback` 只可解释为已尝试提交，结束/断线/超时始终 `UNKNOWN`，之后由原 VM 权威状态和原计划 ID 独立核查，不自动二次提交。认证失败与执行状态未知必须分开报告；不能把 sudo 密码成功当成发布/清理成功。
4. 优先保持非特权 `sanq-install.sh status` 原样；FI-MAC-1B3b 私有原件查询仍要等待固定脚本的真实生产部署、一次准确 sourceSha/retentionId 的独立 sudo 权限审批或后续受审阅的无任意参数 root-owned 验证器，不因新人工通道而开放任意 root Python。
5. 变更须先覆盖 Mac 3.14.10、VM 3.10、拒绝无 TTY/伪输入/未匹配 hostkey/坏密钥、命令注入、密码泄漏、超时/断线/未知提交/重复调用和来源漂移的离线测试，再经 GitHub Actions 全绿，真实 Mac/VM 有权限的操作者手动验收；不测试生产真实 apply/rollback 来证明连接。**直到 CI、现场认证和用户单独生产授权全部完成，不能切换现有 `NOPASSWD:ALL`**。

**需要单独批准的架构变化**：允许在不修改现有自动化 `-n -T` 传输路径的前提下，新增一个**显式人工、单次 SSH TTY 的 sudo 密码认证路径**。影响仅限 Mac 运维接入层及其测试/文档；不授予生产部署或 sudoers/cloud-init 写操作。若不批准，保持原客户端不变且不能宣称撤销全局免密后 Mac CLI 仍可用。

## 3.2 方案 C 本地实现验收状态（2026-11-03）

**EXPLICITLY AUTHORIZED FOR MAC SOURCE / LOCAL IMPLEMENTATION / TESTS NOT RUN / NOT INSTALLED。** 用户确认允许保留旧非交互客户端，并在同一 Runtime/Ops 模块新增独立人工 TTY sudo 密码通道。已在 MCP 本地分支写入 `ops/release/sanq_deploy_manual.py`、`sanq-deploy-manual.sh`，复用原白名单、审批/身份/SSH profile、禁转发和主机密钥 pin，只对新通道使用 SSH `-tt` 与 `sudo -k -p`，用户通过 SSH 继承的真实终端直接输入密码，不进入 Python。新实现严格 UTF-8/控制字符和输出上限、进程时限及 tty 恢复；用户可见的流式结果不构成 VM 任务成功，失败/未知不可自动再提交。另新增离线假 SSH/TTY 测试 `test_sanq_deploy_manual.py`，并更新 [Mac 原入口手册](Runtime最小执行器Mac入口.md) 和 [运行时交付合同](../architecture/Runtime最小执行器工具交付与安装合同.md)。原 `sanq_deploy.py`、`sanq-deploy.sh` 未改，VM/bash/docker/SSH/sudoers/cloud-init 均未配置更改。

**尚未验证项**：MCP-workspace 没有项目测试执行权限；GitHub Actions、真实 Mac OpenSSH8.1+Python3.14.10 下远端交互、sudo 密码回显行为、终端恢复、原 Runtime 工具生产安装与权限切换后的功能均未实测。用户批准的是源码开发，**并非**自动化 PR、生产权限修改、生产发布/回滚授权。sudoers 策略切换仍为 NO-GO。

## 4. 未来获逐项生产批准后的候选变更步骤（目前禁止执行）

1. **已完成凭据设置（2026-11-03 操作者回执）**：`passwd -S` 为 `P`，独立 `su` 密码认证成功；这不证明 sudo 的密码验证已经实测。未来正式切换前重新确认该状态；保留现有密钥 SSH 和已登录的第二管理会话。
2. 检查 cloud-init 持久配置实际合并结果、用户密码锁定策略和 sudoers 生成机制；切换之前必须已准备好审核的固定版本配置、root 私有原件备份和控制台回滚步骤；不依赖“下次正常重启大概不会运行”的猜测。
3. 在 root 安全临时位置准备 **root:root / 0440** 的新 sudoers 内容，以 `visudo -cf <候选文件>` 核语法与现有规则匹配顺序。仅替换 `90-cloud-init-users` 的全量 `NOPASSWD:ALL`，保留普通管理员 `PASSWD:ALL` 和独立 `sanq-backup`；切换采用经审阅的原子方式，不能直接 `sed -i` 修改活动文件且不验证。
4. 在**新开**的 SSH 交互式 TTY 验证：先运行 `sudo -k` 清除本会话可能存在的认证时间戳，再检查未经授权的 `sudo -n /usr/bin/id -u` **非零**（否则旧的凭据缓存会掩盖缺陷）；交互式 `sudo /usr/bin/id -u` 提示密码并仅在正确密码后返回 `0`；另验证 `sudo -n -l` 的实际来源/规则与既有备份 helper 精确免密授权，注意 `sudo -n -l` 本身可能因认证策略返回非零，不能单独代表备份授权失败。不得为“测试备份”执行会生成/上传真实归档的 helper。
5. 确认 `sshd` 仍然仅密钥认证，正常新 SSH 登录、`visudo -c`、定时器等待及后续最近一次真实备份结果；采集日志时按隐私限制，只保存状态摘要和命令退出码。
6. 仅在上述全部 PASS 后退出旧管理会话；不得把 `sudo -n` Mac Runtime 不可用称为成功，若 G2 的处置条件不符则立即回滚。

## 5. 回滚与停止条件

- 回滚包：`/etc/sudoers`、`/etc/sudoers.d/90-cloud-init-users`、`/etc/sudoers.d/sanq-backup`、相关 `/etc/cloud/cloud.cfg` / `cloud.cfg.d` **准确原字节与 SHA256、owner/mode**，保管在**受保护的 root 路径**；绝不把敏感文件正文贴在聊天中。不需要更改或恢复业务 DB。
- 若丢失 sudo 权限，优先利用**仍具有 root 权限、已验证能够修改文件的既有会话**恢复原 sudoers；如账户已无法提权，则不能把 Lightsail 浏览器 SSH 当作 root 后门。采用事先准备的手动实例快照新建实例，或将系统盘快照制成数据盘挂到受信辅助实例离线诊断；这两条路径属于较重恢复，需另外核网络、IP、Cloudflare、备份与快照后的业务数据差量，不得擅自执行整机回滚。
- `sudo -n /usr/bin/id -u` 继续无密码成功（意外残留全量免密）、SSH 密码登录出现开放、备份 helper 白名单失效、cloud-init 覆盖未验证、`visudo` 失败、Mac Runtime 兼容风险未处置、主机身份/目录权限发生漂移，任一出现即 **NO-GO/回滚/保全证据**。
- 切换后仍须监测重新初始化对 `90-cloud-init-users` 的影响；默认 SSH/Sudo 密码配置和 Runtime 所需的人工发布审批必须保持独立。

## 6. 本批结论

**PASSWORD_SET_AND_SU_AUTHENTICATED / MAC_OPTION_C_LOCAL_SOURCE_AUTHORED / CI_NOT_RUN / SUDO_CUTOVER_NOT_AUTHORIZED**。FI-MAC-1B3b 已合并 dev 但尚未生产部署。账户密码已由用户手动设置并通过 su 认证；用户已明确批准新增人工 TTY 认证路径，本地源码、负向离线测试和手册已编写，旧非交互路径保留。**尚未获得该批源码的远端 PR 提交授权，未执行 CI 或真实 Mac 人工认证验收**；没有更改生产 sudoers、cloud-init、SSH、Docker、Runtime 或服务状态。下阶段先进行本地审阅→用户批准远端 PR→全部 CI 全绿合并 dev→真实 Mac/VM 独立认证和部署来源验证→再单独审批生产 sudoers/cloud-init 切换。
