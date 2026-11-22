# Runtime AWS 实机 sudo、重初始化与离线救援演练报告（2026-11-22）

> **结论：`AWS_LAB_EVIDENCE_RECORDED / PERMISSION_AND_RECOVERY_CORE_PASS / CONFIG_IDEMPOTENCE_FAIL / PRODUCTION_SUDO_CUTOVER_NO-GO`。**
>
> 证据来源为操作者于 2026-11-22 在 AWS Lightsail 浏览器 SSH、AWS CloudShell 和 Mac 终端提供的命令与原始返回。本文是**终端回执整理**，不是通过仓库 CI 对 AWS 操作的独立复现，也不是生产变更授权。实验实例、救援盘及本批快照已于同日删除，保留的是本文和会话中记录的摘要及验收结论；未导出完整云端日志/原始取证包。时间如未特别注明均为 UTC，现场多伦多时间为 EST（UTC−05:00）。
>
> 相关合同：[sudo 生产现场只读验收与回退](Runtime-sudo权限切换现场只读验收-20261109.md)、[sudo 切换就绪与权限边界](runtime-ubuntu-sudo-password-cutover-readiness.zh-CN.md)、[Runtime Mac 人工入口](Runtime最小执行器Mac入口.md)、[AWS 快照与维护冻结](../architecture/Runtime更新-AWS快照与维护冻结方案.md)。本轮属于 **Runtime/Ops 实验与取证**，未改变代码、业务模块、数据库、CI 或生产配置。

## G3 后续静态复核索引（2026-11-22；不改写本轮 AWS 结果）

已在独立工作包 [G3 cloud-init / Lightsail 配置幂等性收口](Runtime-G3-cloud-init与Lightsail幂等性收口-20261122.md) 分析 cloud-init 25.2 完整规则块检测与 Lightsail user-data 的追加行为，提出 sudoers 官方规则块最小候选，并对 SSH CA 重复提出单独风险接受门禁。本报告下文记录的 AWS 真实 **1→2、幂等性 FAIL** 不变；G3 新候选尚未执行 AWS 动态复测，正式 Mac Runtime E2E 与生产权限切换仍 **NO-GO**。

## 1. 目标、环境与边界

本轮集中验证：① cloud-init 25.2 下方案 B 密码 sudo 的实际生效、原位回退、普通重启持久性和重新初始化行为；② Mac 普通 SSH TTY sudo 认证与终端恢复；③ Lightsail 实例快照恢复为**新实例身份**后 sudo/SSH 仍可用；④ 从系统盘快照恢复独立数据盘、附加另一实例并以只读方式访问故障源系统配置；⑤ 删除本轮所有付费实验资源。

| 项目 | 本轮固定事实 |
| --- | --- |
| AWS 区域 / AZ | `ca-central-1` / `ca-central-1a` |
| 原实验机 | `SanQ-RUNTIME-LAB-AWS`，EC2 instance ID `i-0cb5a4da6610e3c5e` |
| 快照恢复机 | `SanQ-RUNTIME-LAB-RESTORE-20261122`，ID `i-0af6c60d8f26df76a` |
| 规模 | 两台实例均为 `small_3_0`（2 GiB RAM / 2 vCPU / 60 GB），AWS Linux 根卷 |
| 系统 | Ubuntu 22.04.5 LTS；实验机曾核 `6.8.0-1069-aws`；`/usr/bin/python3` 为 3.10.12 |
| cloud-init | 新实验机最初 26.1；实验前降至与生产当时基线一致的 `25.2-0ubuntu1~22.04.1`；数据源 `DataSourceEc2Local` |
| 管理入口 | Mac 加密 Ed25519 用户身份、Lightsail 浏览器 SSH；云平台仅在浏览器和 CloudShell 中由操作者操作 |
| Mac 源码 | 本机仓库 `ad8d7a18`（PR #3084），工作树干净；`sanq-deploy-manual.sh`、`sanq_deploy_manual.py`、`sanq_deploy.py` 可读、帮助命令可运行 |
| 排除项 | 生产 `Sanq-AWS`、生产 SSH/sudoers、生产快照、业务服务/容器、数据库、真实 Runtime 安装/发布/回滚、生产备份定时运行均**未修改或执行本轮演练** |

实验用途的 cloud-init 25.2 历史 `.deb` 在实验前核对 SHA-256 为 `6e8be438cd8da87f68be77c4f6d227b74098db209971c86964651cdf9b9bf645`，`apt-get -s` 仅计划该软件包降级；实际安装后 `dpkg --audit` 无异常。此项只证明实验软件版本对齐，不是从 Ubuntu 22.04 全新镜像首启前注入方案 B 的验收。

## 2. 方案 B 的活动配置与原位回退

实验机 `/etc/cloud/cloud.cfg.d/99-sanq-sudo-password.cfg` 采用以下配置（`root:root`、0644）：

```yaml
#cloud-config
system_info:
  default_user:
    name: ubuntu
    lock_passwd: false
    sudo: ["ALL=(ALL:ALL) ALL"]
```

| 对象 | SHA-256 |
| --- | --- |
| 方案 B drop-in | `3617cb7d07f492bd88fea70238da79fc4c184fb62918df1c1dccee7d4bccf6de` |
| 重初始化前干净的 `/etc/sudoers.d/90-cloud-init-users` | `0deb6ffe0f031baa94c5367ff4fc77cf616fbb820229d4b0e9d1b6720bb399d4` |
| 重初始化后的 `90-cloud-init-users` | `0a0651e7f29a7e78613db305abc69c5747605c13baa55d7b19dd6cd67e7a75f9` |
| `/home/ubuntu/.ssh/authorized_keys` | `b7de239001a0754f50d082388d82e98666a7c5f8573ae8c3c3e07be8829950fa` |

实验机 `ubuntu` 密码先行设置，`passwd -S ubuntu` 报 `P`，SSH 服务保持公钥认证（`PubkeyAuthentication yes`、`PasswordAuthentication no`、`KbdInteractiveAuthentication no`）。

**重要的中间过程，不得被结果掩盖：** 先在已经由 cloud-init 26.1 初始化过的系统上执行 `cloud-init single --name users-groups --frequency always`，观察到 cloud-init **追加**密码规则，而未删除旧 `NOPASSWD:ALL`；因此单次模块返回 0、`visudo -c` 通过或交互 sudo 成功，都不能证明活动 sudoers 已经干净。操作者随后在保留 root 回退会话的情况下用原子替换方式安装仅含一条 `ubuntu ALL=(ALL:ALL) ALL` 的干净 sudoers；还实测恢复旧免密规则后 `sudo -n id -u` 可再次成功，并连同移除方案 B drop-in 验证云配置回退；最后重新放回干净密码 sudoers 和方案 B。

此阶段有现场回执：`sudo -k; sudo -n id -u` 因需要密码而非零；交互 sudo 经密码成功输出 `0`；`sudo -l` 无全量 NOPASSWD；`visudo -c` 通过。**原位回退 PASS，干净策略重装 PASS**，不代表历史 cloud-init 文件的自动收缩已实现。

## 3. G3：普通重启、完整重新初始化与实际差异

### 3.1 普通重启（PASS）

2026-11-22 05:53:16 UTC 左右执行正常 `systemctl reboot`。重连后实例 ID 未变化，cloud-init `25.2` 为 `done` 且 `errors: []`；方案 B 和干净 sudoers 的 SHA-256 与重启前一致，`90-cloud-init-users` mtime 未变化；`ubuntu` 仍为 `P`，`sudo -n` 拒绝免密、交互式 sudo 密码成功；Mac 独立 SSH 可重新登录。登记 `AWS_B_NORMAL_REBOOT_PERSISTENCE_PASS`。

### 3.2 完整重新初始化（执行与权限 PASS；幂等性 FAIL）

准备阶段已留存原字节摘要和三份可用实例快照，并检查 Lightsail user-data：它是 16 行 shell script，第 4 行写入 `/etc/ssh/lightsail_instance_ca.pub`，第 9 行向 `/etc/ssh/sshd_config` 追加空行，第 10 行以 `>>` 追加 `TrustedUserCAKeys`，第 13 行重启 SSH。其余脚本行为没有被完整语义审计，不能称整份脚本被全面认证。准备检查：`visudo -c` / `sshd -t` 均通过，`/etc/cloud/clean.d` 未发现文件。

操作者仅在原实验机执行一次 `sudo /usr/bin/cloud-init clean --reboot`。重启后 Lightsail 浏览器 SSH 报主机密钥记录不匹配，经控制台重置记录后重新登录；`cloud-init status --long` 返回 `done`、`errors: []`、`DataSourceEc2Local` 和原 instance ID。密码 sudo `sudo -v` 成功，`sudo -n id -u` 返回 **1**，drop-in 与 `authorized_keys` 哈希未变化；`visudo -c`、`sshd -t` 通过。

| 状态 | 重初始化前 | 重初始化后 |
| --- | --- | --- |
| `90-cloud-init-users` 活动规则 | 1 条密码 `sudo` | **2 条相同密码规则** |
| `NOPASSWD:` | 0 | 0 |
| `TrustedUserCAKeys` 配置指令 | 1 | **2** |
| Ed25519 SSH hostkey | `SHA256:cmff44GnkMQgGkBegFLGJUzSLjwBJFoa1r4RKXhw8Ow` | `SHA256:0KfehOADs/bFw6faZxt9oeTqvylaA7Mpc8UGFa+IyTc` |
| ECDSA SSH hostkey | `SHA256:9jmkL8S2zpaD2z8okqQV4TslotKm+1rarwnROgd1tG8` | `SHA256:2U1QjAgR0U6N4/wUz8+DGWS7tWgMEL0+mxgKjPrGeIs` |

Mac 通过**独立核验**的新 ECDSA 指纹和临时 `known_hosts` 再次登录原实验机，返回 `ubuntu`、正确 hostname、退出码 0，登记 `G3_REINIT_MAC_SSH_RECOVERY_PASS`。旧主机密钥不得被默认为可信。

**定性：** 此次未观察到 NOPASSWD 回归、密码认证可用；但重复生成的两条 sudo 规则与两条 CA 配置指令证明**配置幂等性 FAIL**，不可仅凭现时功能正常改称 G3 无保留关闭。不能从单次重新初始化推断无限次重复执行或任意未知配置状态下的安全性。

## 4. G4/G5：Mac 终端与正式 Runtime 客户端的实际覆盖

- Mac 原生 `ssh -tt` → 远端 `sudo -k -p` → `id -u` 实际出现密码挑战，输入正确实验密码后输出 `0`，SSH 会话关闭。另一轮三次密码输入错误，远端返回非零（`SSH_TTY_RC=1`）；实验机通过浏览器 SSH 再次 `sudo -v` 成功，账户并未失去管理能力。
- 在后一轮失败路径，Mac 对比 SSH 前后 `stty -g`，返回 `MAC_NATIVE_TTY_RESTORED_PASS`。**仅验证原生 SSH 终端恢复，未验证 `sanq_deploy_manual.py` 自身的 TTY 恢复代码。**
- Mac 仓库 `--help` 正常；`/bin/sh ops/release/sanq-deploy.sh local-check` 返回 `LOCAL_PREFLIGHT_OBSERVED` / exit 0，CPython **3.14.10**、`x86_64`、隔离标志、目录 FD、非阻塞管道、SSH 参数解析均被观察到；输出中的 `remoteOperationPerformed=false`、`sshConnectionTested=false`、`readyToInstall=false`、`canExecute=false` 为预期。
- Mac 现有 `~/.sanq-deploy` 目录为 0700，`identity` / `known_hosts` / `target` 为 0600；**未覆盖或更改此配置**。
- 实验机明确缺少 `/opt/sanq/runtime`、`collect_deployment_plan.py`、`release_task.py`；未通过正式安装合同投放 Runtime 工具，**没有运行 `sanq-deploy-manual.sh status <plan-id>`**，更无真实 `apply`、`rollback`、发布完成或 SQL 验证。正式客户端远端端到端验收保留 `PENDING`。

## 5. G0/G06：快照恢复与离线救援

### 5.1 实例快照恢复为独立实例（系统与权限核心 PASS）

2026-11-22 06:01:28 UTC 的 `SanQ-RUNTIME-LAB-B-REBOOT-PASS-20261122` 快照已核 `available`、来源 `SanQ-RUNTIME-LAB-AWS`、60 GB。该快照采集于**普通重启通过之后、完整 clean/reboot 之前**，因此在快照中 sudoers 仍是单条干净密码规则。

从快照创建 `SanQ-RUNTIME-LAB-RESTORE-20261122`（创建请求 06:44:39 UTC）；新 instance ID 为 `i-0af6c60d8f26df76a`，不是原机 ID。其 cloud-init 25.2 `done`、`errors: []`、数据源 `DataSourceEc2Local`；`sudo -n` 返回 1、交互 `sudo -v` 返回 0；drop-in、sudoers 和 `authorized_keys` 摘要分别为上述 `3617…`、`0a065…`、`b7de…`。新实例首次启动后同样产生 **2 条密码规则、0 条 NOPASSWD**。这验证了**已有快照在新实例身份下重初始化**，并不等同于一张全新干净 Ubuntu 首启前即预置方案 B。

恢复机初始默认开放 80/22 的公网 IPv4/IPv6 入站；操作者随后关闭 HTTP、把 SSH 限定为单一来源 IPv4（/32）及 Lightsail 浏览器连接来源，CloudShell `get-instance-port-states` 最终只见 TCP 22 的受限规则。该入站防火墙不等于限制出站网络。

恢复机 SSH `sshd -t` PASS、`TrustedUserCAKeys` 为 2 条，根盘 `nvme0n1` 60 GB，`nvme0n1p1` 正常挂载到 `/`。新 hostkey：
- Ed25519：`SHA256:OHkJOJLkvi7v1mtfUlAwWyDx0bWGqqy0SzDmlvKnaaI`
- ECDSA：`SHA256:iL4mgOEtHMUNy/lrEGmh12HqJspjKt0sTjkxqzhwcWs`

Mac 用 AWS 浏览器 SSH 核对的 ECDSA 指纹与临时 `known_hosts` 匹配，公钥登录恢复机返回 `ubuntu`、`ip-172-26-7-26`、准确新 instance ID 和 `RESTORE_MAC_SSH_RC=0`；不修改默认 `known_hosts` 或 `~/.sanq-deploy`。登记 `AWS_SNAPSHOT_RESTORE_MAC_SSH_PASS`。

### 5.2 根卷磁盘快照与只读挂载（PASS，限定为离线读取）

- 从**已完成重新初始化的原实验机**创建磁盘快照 `SanQ-RUNTIME-LAB-ROOT-RESCUE-20261122`（06:53:40 UTC），Lightsail `get-disk-snapshot` 返回 `completed`、来源正确、60 GB。
- 派生磁盘 `SanQ-RUNTIME-LAB-RESCUE-DISK-20261122`（06:56:19 UTC），在 `ca-central-1a` 状态 `available` 后附加到恢复机（06:58:04 UTC），控制面最终 `attached/in-use`。
- Linux 原根盘为 `/dev/nvme0n1`（EBS 卷 `vol0977fd8461704b484`），救援盘为 `/dev/nvme1n1`（EBS 卷 `vol002991d94e67bcc95`）；只挂救援盘 `/dev/nvme1n1p1`，绝不使用相同 UUID 推断目标。
- 挂载点 `/mnt/sanq-rescue-root`，`findmnt` 记录 `ext4 ro,nosuid,nodev,noexec,relatime,norecovery`，等效实现不回放 ext4 journal 的只读读取目的。未格式化、未 `fsck` 修复、未执行救援盘程序或写入。
- 离线取得 drop-in `3617…`、sudoers `0a065…`、`authorized_keys` `b7de…`，与原实验机一致；离线 Ed25519 指纹 `SHA256:0KfehOADs/bFw6faZxt9oeTqvylaA7Mpc8UGFa+IyTc` 与原实验机重初始化后一致；离线结构同为密码规则 2、NOPASSWD 0、CA 2。输出 `G06_OFFLINE_CONFIG_AUDIT_COMPLETE`。

**范围限制：** 这是从运行态快照恢复的静态配置读取，不是离线更改故障盘后启动验收；未验证生产数据库/服务的应用一致性、业务冻结、无外部副作用或完整恢复。操作者未在对话中提供 Ubuntu `umount` 的退出回执，所以只能明确登记 AWS 控制面后续 `stopped`、`detached/available`，不能单凭该记录宣称获得 OS 卸载 PASS 原始回执。

## 6. 本轮 AWS 资源清理（控制面已核）

| 类型 | 本轮实验资源名称 | 最终证据 |
| --- | --- | --- |
| 原实例 | `SanQ-RUNTIME-LAB-AWS` | `get-instances` 定向列表 `[]` |
| 恢复实例 | `SanQ-RUNTIME-LAB-RESTORE-20261122` | 同上 |
| 实例快照 | `SanQ-RUNTIME-LAB-AWS-1795324336`（05:12:21 UTC） | `get-instance-snapshots` 定向列表 `[]` |
| 实例快照 | `SanQ-RUNTIME-LAB-PRE-B-20261122`（05:31:41 UTC） | 同上 |
| 实例快照 | `SanQ-RUNTIME-LAB-B-REBOOT-PASS-20261122`（06:01:28 UTC） | 同上 |
| 磁盘快照 | `SanQ-RUNTIME-LAB-ROOT-RESCUE-20261122`（06:53:40 UTC） | `get-disk-snapshots` 定向列表 `[]` |
| 临时救援盘 | `SanQ-RUNTIME-LAB-RESCUE-DISK-20261122` | `get-disks` 定向列表 `[]` |

操作者先确认恢复机为 `stopped`，救援盘为 `detached/available`，删除磁盘后检查 `[]`；随后从 Lightsail 图形界面删除两台实验实例与四份快照。最后 CloudShell 对**本轮目标命名范围**执行实例、实例快照、磁盘、磁盘快照四组查询，均返回 `[]` 和 `AWS_LAB_RESOURCE_AUDIT_COMPLETE`。登记 `AWS_LAB_RESOURCE_CLEANUP_PASS`。不应将定向 `[]` 解释为账户/其他区域没有任何收费资源；已发生的历史用量仍可能入账。

**生产 `Sanq-AWS`、生产快照和实验 SSH Key Pair 均未列入本轮删除清单。** 本轮 2 实例 + 3 实例快照 + 1 数据盘 + 1 磁盘快照共 **7 项临时资源**已被定向核查删除。

## 7. 验收判定与后续门禁

| 验收域 | 结果 | 证据边界 |
| --- | --- | --- |
| AWS 实验机 sudo 密码认证、原位回退 | **PASS** | 有真实成功/拒绝与旧规则回退记录 |
| 方案 B 合并值与普通重启持久性 | **PASS** | 干净 sudoers、SHA、认证与重连 |
| cloud-init 完整 `clean --reboot` 执行 | **PASS** | 同实例重新初始化无 cloud-init 错误 |
| 重新初始化后的有效密码 sudo 与公钥 SSH | **PASS** | `sudo -n=1`、`sudo -v=0`、Mac 重连 |
| cloud-init / Lightsail SSH 写入幂等性 | **FAIL** | 密码 sudo 1→2，`TrustedUserCAKeys` 1→2 |
| Mac 原生 SSH PTY、终端失败路径恢复 | **PASS（原生 SSH）** | 不能代替正式人工 Runtime 客户端 |
| Mac Runtime `local-check` | **PASS** | 只验证本地解释器/FD/参数，非 SSH |
| 正式 `sanq-deploy-manual.sh` 远端 `status` | **PENDING** | 实验机未安装符合合同的 Runtime 工具 |
| 新实例身份的快照恢复与 Mac SSH | **PASS（系统/权限核心）** | 不含生产业务与数据库 |
| G06 故障源磁盘离线只读读取 | **PASS（读取）** | 不含写盘修复、恢复启动 |
| 生产业务冻结、整机/数据库完整恢复、备份 helper 切换后自然运行 | **NOT TESTED** | 不能据此授予生产恢复完整 PASS |
| 本轮定向 AWS 实验资源清理 | **PASS** | 四组 CloudShell `[]` |

**需要下一轮处理，但本次仅记录、不修改：**

1. **权限与 cloud-init 幂等性**：在当前仓库与生产 `cloud-init 25.2` 的真实行为边界内审阅如何避免 `90-cloud-init-users` 重复追加；避免只靠“最后一条规则生效”作为长期保证。不得自行重跑生产 cloud-init、随意擦除其生成文件或把 NOPASSWD 当备用。
2. **Lightsail CA 规则重复**：审计实际 user-data 的所有权、可调整性以及不破坏官方浏览器 SSH 的幂等化选项。不要未授权禁用 `TrustedUserCAKeys` 或直接改写云平台自动注入脚本。
3. **正式 Runtime 人工 TTY 端到端**：需要按已批准安装来源与权限合同完成 VM 端只读入口/固定 profile 的真实验收；不以手工 SSH 的 `id -u` 冒充正式客户端通过，不以不明来源的临时 Python 脚本充数。
4. **生产专用规则与备份**：`sanq-backup` 精确白名单、自然定时运行和生产原字节回退包必须在实际生产切换窗口再次单独验收。本轮干净 AWS 实验机没有该生产备份 helper。
5. **恢复策略界限**：本次没有启动生产实例快照；运行态生产快照可能包含未冻结业务/定时器与开放出站连接，不得由实验室系统恢复 PASS 推导可安全直接启动生产克隆。R2/C1 暂停项、真实 Runtime 安装/发布门禁及业务/数据库恢复缺口不因本报告自动关闭。
6. **下一步交付门禁**：如需修改方案或代码，应先核最新 `AGENTS.md`、架构/CI/实现边界；本地审阅后取得用户授权才允许推 PR 至 `dev`，必需 CI 全绿方可合并。**当前 `PRODUCTION_SUDO_CUTOVER_NO-GO` 不变。**

## 8. 取证完整性与来源限制

本报告使用终端文字回执与摘要，未保存原始 CloudShell 会话文件、日志包或 AWS 审计 API 导出；原实例/磁盘/快照在验收结束后已删除，**不可再从本轮 AWS 资源回收未采集的原始数据**。以下信息不在报告中保存：私钥、账户密码、完整 SSH 公钥、临时 Mac profile 文件原文以及生产凭据。哈希值是已展示的现场观察值，不是本报告重新从已删除实例中计算的结果。

文档记录 `PASS` 只代表对应且已明确界定的现场测试；`FAIL` 与 `PENDING / NOT TESTED` 保持独立，不将实验资源清理成功解释为项目整体部署或灾难恢复完成。
