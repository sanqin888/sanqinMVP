# Runtime sudo 权限切换：现场只读验收包（2026-11-09）

## 2026-11-14 · G2 备份专用 sudo 规则实验与生产脚本来源比对

**G2_SUDO_POLICY_LAB_PASS / PRODUCTION_CUTOVER_NO-GO**

操作者在隔离 VirtualBox `sanq-runtime-lab`（sudo 1.9.9）临时安装与生产规则同样匹配 helper 路径和归档名的 sudoers 条目，以及仅检查参数的模拟 helper。每项测试前清除 sudo 认证缓存。最终退出码依次为 `NORMAL_RC=1`、`VALID_HELPER_RC=0`、`INVALID_NAME_RC=1`、`EXTRA_ARG_RC=23`。普通 root 命令需要密码，合法备份名免密进入模拟 helper，格式明显不符的名称在 sudo 层被拒绝，两个参数由模拟 helper 拒绝。前次额外参数用例在 sudo 层提前被拒绝，修正测试输入后取得上述结果。移除临时规则及 helper 后 `visudo -c` 全部通过，输出 `LAB_CLEANUP_DONE`。

从 Runtime Bundle 的固定源码提交 `a84b72007e6b4e82c981101e56c897355757c0ff` 取得两个 Git 文件的原始字节并计算 SHA-256。两项均与 [H16/H17 的 Bundle 和生产实装记录](../architecture/Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) 一致，也与本轮 G2 生产只读取证所报的摘要一致。

| 生产实装路径 | 审阅源码路径 | SHA-256 |
| --- | --- | --- |
| `/home/ubuntu/backup-db.sh` | `ops/backup/backup-db.sh` | `fee7556667376a417a995f0a2bf4aa2c9241dac0eeb4b3022067be0467345437` |
| `/usr/local/sbin/sanq-backup-protected-nginx` | `ops/backup/sanq-backup-protected-nginx` | `df91e37ca252afad9bfe665d6f3e72239d957c8f11767e38dc6ce51ac5226322` |

**生产实装静态比对通过。** 操作者在 `sanq-web` 现场执行只读 `stat` 和 `sha256sum`。`/home/ubuntu/backup-db.sh` 为普通文件、`ubuntu:ubuntu`、`0750`，`/usr/local/sbin/sanq-backup-protected-nginx` 为普通文件、`root:root`、`0755`。两份当前 SHA-256 均与上表中从固定 Git 提交独立复算的摘要一致。

生产仍保留 `NOPASSWD:ALL`。切换后的首次定时备份以及 Mac 人工 sudo 通道仍待现场验收。

## 2026-11-14 · G0 Lightsail 手动快照现场回执

操作者提供的 Lightsail 实例快照页显示，实例位于加拿大（蒙特利尔）区域 `ca-central-1`、可用区 `ca-central-1a`，手动快照列表有以下两个条目。

| 手动快照 | 控制台创建时间（EST，UTC−05:00） | 列出的磁盘 |
| --- | --- | --- |
| `Sanq-AWS-1794697663` | 2026-11-14 18:07 | 60 GB SSD 系统磁盘 |
| `Sanq-AWS-1794427910` | 2026-11-11 15:12 | 60 GB SSD 系统磁盘 |

**G0 快照可用性核对通过。** 操作者通过 AWS CloudShell 执行 [Lightsail `get-instance-snapshot`](https://docs.aws.amazon.com/cli/latest/reference/lightsail/get-instance-snapshot.html)，返回 `Name=Sanq-AWS-1794697663`、`Source=Sanq-AWS`、`Region=ca-central-1`、`State=available`、`CreatedAt=2026-11-14T23:07:50.268000+00:00`（多伦多 18:07:50 EST）。`Sanq-AWS` 为 Lightsail 来源资源名，`sanq-web` 为此前 VM 内取证使用的 Linux 主机名。

**G0 远端归档清单核对通过。** 操作者在 `sanq-web` 通过 `rclone lsf` 核对数据库、加密配置及加密 Nginx 三个远端目录。三类归档各有 5 个文件，2026-11-10 至 2026-11-14 的五组时间戳逐组对应。选取最新批次 `20261114_083010`，包含 `sanqin_db_20261114_083010.sql.gz`、`sanqin_config_20261114_083010.tar.gz` 和 `sanqin_nginx_20261114_083010.tar.gz`。

**G0 离机归档读取与 gzip 完整性通过。** 操作者在 Mac 只读挂载 `sanq-rclone-crypt-escrow-20261001.dmg`，使用其中 rclone 配置的私有临时副本，从 Google Drive 读取 `20261114_083010` 批次三个远端对象。数据库归档读取，以及加密配置和 Nginx 归档的解密流，均通过 `gzip -t`。此次验证独立于生产 VM 和此前的 VirtualBox 恢复机。

**G0 离机 PostgreSQL 15 逻辑恢复通过。** 操作者在 Mac 用 Postgres.app 15.20 启动全新临时数据库实例，经专用 Unix socket 导入同批次 SQL，`DB_RESTORE=PASS`。查询结果为 `_prisma_migrations` 205 条、未解决 0 条，`Order` 3248 条、`PaymentTransaction` 0 条、`AccountingJournalEntry` 2174 条。`PaymentTransaction` 的零行结果与 [2026-10-09 离机验收](runtime-backup-cutover-c4p2d-acceptance.zh-CN.md#41-d1--macbook-独立恢复-20261009_033755)一致；该历史值用于解释此表计数，未用于断言当前恢复点的全渠道支付或全部业务数据一致性。演练使用 `NOLOGIN` 占位角色，正式角色及登录恢复另行验收。

**G0 从实例快照进入恢复配置页通过。** 操作者在 Lightsail 打开 `Sanq-AWS-1794697663` 的[新实例配置页](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-create-instance-from-snapshot.html)，截图显示蒙特利尔 `ca-central-1a`、双栈、通用型 2 GB RAM / 2 vCPU / 60 GB SSD（12 美元/月），页面选用 SSH 密钥 `id_ed25519_lightsail`，自动快照未勾选。现场停在提交前，实例启动和 SSH 登录仍待验证。

**独立救援演练可合并安排，当前继续准备。** [sudo 切换手册 G0](runtime-ubuntu-sudo-password-cutover-readiness.zh-CN.md#3-切换前-gate均须留真实回执) 将系统盘挂载列为灾难恢复备选。切换前须确认可行的独立救援方式，并落实两个 SSH 会话与 sudo 配置原字节回退。当前已取得整机快照可用、恢复配置页可打开和离机 PG15 导入的回执。生产切换保持 `NO-GO`。

| 合并验证项 | 暂定目标与回执 |
| --- | --- |
| sudo G0 / Runtime G06 | 在 `ca-central-1a` 新建干净 Ubuntu 救援机并验证独立 SSH；如选择[系统盘救援路径](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-create-an-instance-root-volume-snapshot.html)，再将系统盘快照派生的数据盘只读挂载，记录 sudoers/SSH 配置的可读性。 |
| sudo G3 / G4 / G5 | 复用这台干净 AWS 测试机。对齐生产 Ubuntu、cloud-init 和 sudo 版本，核对实际 datasource、SSH 密钥登录、方案 B 和正常重启；按 Runtime 工具安装合同核对来源，用独立 Mac SSH profile 验证真实 TTY 密码挑战及固定只读状态查询。实际验证以工具与配置就绪为准。 |
| Runtime G07 / AWS S03–S05、S09 | 在同一批 AWS 演练中，以已落实首启隔离与维护冻结的来源快照创建独立目标，验证快照来源、覆盖、恢复数据和首启无业务副作用。生成独立目标需要另一实例身份；可复用同一演练窗口和证据，现有 VirtualBox C2 维持限定关闭。 |

11 月 14 日的整机快照来自运行中的生产机，启动前的业务冻结未验证。Lightsail 实例防火墙控制入站流量，允许出站；保持该快照用于灾难恢复，待首启隔离方案就绪再安排整机启动演练。参见 [Lightsail 防火墙](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-firewall-and-port-mappings-in-amazon-lightsail.html) 及 [Runtime AWS 快照与维护冻结方案](../architecture/Runtime更新-AWS快照与维护冻结方案.md)。本段为批次方案，AWS 实例和救援盘尚未创建。

## 生产 sudo 候选与原位回退准备

操作者确认先继续现有环境的准备，系统盘救援与需新 AWS 实例的测试留待同一批验收。当前取证范围包括活动 sudoers 的原字节摘要、属主、权限和完整语法，以及内存中合成的候选策略。拟将 `90-cloud-init-users` 中 `ubuntu ALL=(ALL) NOPASSWD:ALL` 换成 `ubuntu ALL=(ALL:ALL) ALL`，并按现有顺序纳入 `sanq-backup`。使用生产同一版本的 `visudo -c -s -f -` 检查完整候选输入；该检查验证语法，运行时认证、文件属主权限和自动备份行为分别留回执。

**生产 sudoers 基线与候选语法核对通过。** `sanq-web` 上 `visudo -c` 对主文件和三个条目均返回 `parsed OK`。四份活动文件均为普通文件、`root:root 0440`。完整内存候选由该机 `visudo -c -s -f -` 解析，返回 `stdin: parsed OK` 和 `SUDO_CANDIDATE_SYNTAX_PASS`。

| 对象 | SHA-256 |
| --- | --- |
| `/etc/sudoers` | `5ae1d5673f987e403c3d08a209798e737169f5f89286862963b6b28d09fb619c` |
| `/etc/sudoers.d/90-cloud-init-users` 原件 | `ce77628b58ced2e80b4edeea9d4654bd4609669fa77c49f39ac7582852c3dd96` |
| `/etc/sudoers.d/README` | `016d919662c52917d4bb5976f50519011c333ab3b0ba686370bba16dec88baf5` |
| `/etc/sudoers.d/sanq-backup` | `232cc78d3db075f94a54590ac9517c46e8c611f04d74d29f8ba3796ca987630c` |
| `90-cloud-init-users` 候选 | `d839670689b90c5cfd36309339b1ba4067d25cff8592d983314a0daf712d5252` |

候选摘要对应将来拟替换的单个文件。此次 `visudo` 检查覆盖按顺序组合的完整候选；原件 SHA-256 用于确认切换时的输入和回退后的字节。生产策略认证和回退尚未执行。

方案 B 的持久化候选沿用 `system_info.default_user`，只覆盖 `name: ubuntu`、`lock_passwd: false` 和 `sudo: ["ALL=(ALL:ALL) ALL"]`。既有生产内存合并回执已通过；正式切换将当前 sudoers 与未来 cloud-init 实例初始化作为两项验收。生产写入及重跑 cloud-init 仍处于 `NO-GO`。

将来获准切换时，先准备 root 私有的活动策略与相关 cloud-init 配置原字节备份，登记路径、SHA-256、属主和权限。会话 A 在改动前取得并验证 root 权限，保留作原位回退；会话 B 使用新开的 Mac 公钥 SSH 验证冷缓存下普通 sudo 拒绝免密、人工密码成功、备份专用规则和新 SSH 登录。若验证失败，由 A 恢复原件并复验完整策略；如果将来已安装新的持久化 drop-in，同步撤回该文件。当前摘要采集与候选检查无落盘备份，与切换窗口回退就绪是两项回执。

## 2026-11-11：隔离 VM cloud-init 方案 A / 独立方案 B 初始化及普通重启均通过（操作者终端回执）

> **LAB_A_INIT_AND_REBOOT_PASS / LAB_B_MERGE_INIT_AND_REBOOT_PASS / PRODUCTION_CUTOVER_NO-GO。** 以下仅记录 VirtualBox 实验机，不表示生产云 VM 已更新 sudoers/cloud-init、生产 Mac CLI 真实密码认证已验收或生产恢复链已准备好。本节按新证据追加，以下 2026-11-09 记录仍保留其当时状态。

- **B（独立快照实验普通重启持久性，最新 2026-11-11 回执）**：在独立 B-INIT 通过后，操作者只运行 `sudo reboot`（未运行 cloud-init clean），Mac 端第一次粘贴 `00~ssh ...01~` 被 shell 拒绝为 `command not found`；随后的正确 SSH 命令以 `IdentitiesOnly=yes`、`PreferredAuthentications=publickey`、`PasswordAuthentication=no`、`KbdInteractiveAuthentication=no` 与指定 ED25519 密钥成功重新登录，该粘贴失误与 VM 初始化无关。重启后 `sudo cloud-init status --wait --long` 为 `done / errors: [] / DataSourceNoCloud [seed=ds_config_seedfrom,file:///var/lib/sanq-sudo-lab/nocloud/]`，`cloud-init query v1.instance_id` 为 `iid-sanq-sudo-baseline-001`。`/etc/sudoers.d/90-cloud-init-users` **mtime 保持 `2026-11-11 19:41:56.227999594 +0000`**，文件仍为 `ubuntu ALL=(ALL:ALL) ALL`，`grep` 返回 `NO_NOPASSWD_RULES`；`sudo -k; sudo -n /usr/bin/id -u` 提示需要密码且 `sudo_n_exit=1`，后续普通 sudo 再次提示密码并完成 `stat/cat` 等取证。`ubuntu P`、所有 `visudo -c` 解析通过。对 Mac 来源地址/ubuntu 的 `sshd -T -C` 返回 `pubkeyauthentication yes / passwordauthentication no / kbdinteractiveauthentication no / authenticationmethods any`；公钥指纹 `SHA256:ZVFCYycHOGd2VnIPXmvO+HQwit2hB8v5l94NH9unT1E` 匹配，路由只有 `192.168.56.0/24 dev enp0s3 src 192.168.56.6`，无默认外网路由。**LAB_B_NORMAL_REBOOT_PASS**：同版本 NoCloud/VirtualBox 可丢弃实验机中，B 从 A 前快照独立重建后通过配置合并、真实 cloud-init 初始化和普通重启；它不证明 AWS 生产真实 datasource/vendor-data、精确 backup-helper NOPASSWD 例外及恢复/TTY 运行端到端已验收，生产仍 NO-GO。
- **B（独立快照实验真实初始化，2026-11-11 回执）**：在 A 前同一实验 VM 快照重新恢复、NoCloud+B 重建并取得 12/12 合并检查 PASS 后，操作者先 `sudo -k`、`sudo -n /usr/bin/id -u` 得到 `sudo: a password is required`、`sudo_n_exit=1`；普通 sudo 提示密码后成功返回 `0`，再次 `sudo -k`。最终预检 `B_CONFIG_READY`、`NOCLOUD_READY`、`A_DISABLED`，`ubuntu P`，ED25519 指纹匹配，只有 Host-only 路由。之后**仅在 VirtualBox 实验机**执行 `sudo cloud-init clean --reboot`；Mac 以强制公钥、禁 SSH 密码及键盘交互重新登录成功。重新初始化后的 `cloud-init status --wait --long` 为 `done / errors: [] / DataSourceNoCloud`、instance `iid-sanq-sudo-baseline-001`；`/etc/sudoers.d/90-cloud-init-users` **新生成于 2026-11-11 19:41:56 UTC**，规则确认为 `ubuntu ALL=(ALL:ALL) ALL`，无 `NOPASSWD` 匹配；再次 `sudo -k; sudo -n /usr/bin/id -u` 为密码要求、`sudo_n_exit=1`，后续交互 sudo 提示密码且能获取 root 文件；`passwd -S ubuntu` 仍 `P`，`visudo -c` 全部 OK。与恢复基线相比，针对 `ubuntu` 和来源 `192.168.56.1` 的 `sshd -T -C` 有效配置从 `pubkeyauthentication yes / passwordauthentication yes / kbdinteractiveauthentication no` 变为 `pubkeyauthentication yes / passwordauthentication no / kbdinteractiveauthentication no`；已实证 Mac 强制公钥登录成功。ED25519 指纹 `SHA256:ZVFCYycHOGd2VnIPXmvO+HQwit2hB8v5l94NH9unT1E`、仅 `192.168.56.0/24` 无默认路由均保持。普通用户读 0600 B drop-in 的 `REDACTED ... insufficient permissions` 告警不构成初始化错误。**LAB_B_INIT_PASS / LAB_B_NORMAL_REBOOT_PENDING**；尚不能声明正常 reboot 的持久性或生产配置可直接复用。下步仅对本实验克隆执行普通 `sudo reboot`（不 clean），对比 sudoers 时间戳与内容，复验 sudo/SSH/no-default-route/cloud-init 身份与无错误。

- **实验环境与初始基线**：VirtualBox 独立克隆 `SanQ-SUDO-LAB-01`；Ubuntu 22.04.5、`cloud-init 25.2-0ubuntu1~22.04.1`，起初 `DataSourceNone`（`iid-datasource-none`），`/etc/cloud/cloud.cfg` 的 `system_info.default_user.sudo` 仍为 `["ALL=(ALL) NOPASSWD:ALL"]`，但 sudoers.d 当时只有 README。实际 `sudo -k; sudo -n /usr/bin/id -u` 提示需要密码、退出码 1，交互 sudo 密码后输出 0；`passwd -S ubuntu` 为 `P`。路由仅 `192.168.56.0/24`，无默认路由。该初始检查并不等于云默认规则重跑测试。
- **NoCloud 实例初始化**：在实验克隆机中建立隔离 `file:///var/lib/sanq-sudo-lab/nocloud/` seed，实例 ID 为 `iid-sanq-sudo-baseline-001`；`network.config: disabled`、`ssh_pwauth: false`；从 `users: []` 初始验收开始。静态 schema 与 `visudo -c` 通过，`cloud-init clean --reboot` 后 `DataSourceNoCloud`、`status: done`、`errors: []`，用户 sudo 仍需密码。第一次重新初始化后 `/home/ubuntu/.ssh/authorized_keys` 为 **0 字节**，导致 Mac `Permission denied (publickey)`；通过 VirtualBox 控制台及 Host-only 网络传送**公钥**恢复，未传输私钥、未启用 SSH 密码登录。Mac Host-only 桥接地址曾暂时缺失，后确认 `bridge100=192.168.56.1/24` 且到实验机 `192.168.56.6` 路由正确。恢复的 SSH ED25519 公钥指纹为 `SHA256:ZVFCYycHOGd2VnIPXmvO+HQwit2hB8v5l94NH9unT1E`。
- **A（顶层 `user`）静态预检**：NoCloud `user-data` 设 `users: [default]`，`/etc/cloud/cloud.cfg.d/99-sanq-sudo-A.cfg` 指定 `user.name: ubuntu`、`lock_passwd: false`、`sudo: ["ALL=(ALL:ALL) ALL"]`、已核对的 `ssh_authorized_keys`。两个配置的 schema、系统 schema、sudoers 语法及公钥指纹均通过；`ubuntu P`，root 私有目录保留了 NoCloud user-data 与 authorized_keys 基线副本。
- **A（真实重新初始化）**：执行的仅是 **实验克隆机** `sudo cloud-init clean --reboot`。重连 Mac 公钥 SSH 成功，NoCloud `status: done / errors: []`、实例 ID 保持；`/etc/sudoers.d/90-cloud-init-users` 由 cloud-init 新建且实际内容为 `ubuntu ALL=(ALL:ALL) ALL`；`grep -Rns NOPASSWD /etc/sudoers /etc/sudoers.d` 无命中；清缓存后 `sudo -n /usr/bin/id -u` 返回密码要求、`sudo_n_exit=1`，`sudo -l` 仅显示普通 `ALL` 授权（两处，均非 NOPASSWD）。`passwd -S ubuntu` 为 `P`；SSH 公钥、`visudo -c` 与无默认路由均通过。普通用户读取 0600 cloud 配置产生 `REDACTED ... insufficient permissions` 警告，不属于初始化错误。
- **A（普通 reboot 持久性）**：执行 `sudo reboot`（未 clean）；Mac 公钥再次登录成功。cloud-init 仍 `done / errors: []`，同一 NoCloud ID，`90-cloud-init-users` 的原生成时间和 `ubuntu ALL=(ALL:ALL) ALL` 均保持；`sudo -n` 在 `sudo -k` 后仍返回 1，`ubuntu P`，`visudo -c` 通过、公钥指纹一致、仅 Host-only 路由。**A-INIT PASS / A-REBOOT PASS**。
- **B（`system_info.default_user`）静态预检**：已保留 A 配置及 sudoers 文件副本；在实验机新建 `99-sanq-sudo-B.cfg`，包含 `system_info.default_user.name: ubuntu`、`lock_passwd: false`、`sudo: ["ALL=(ALL:ALL) ALL"]` 和经核验的 `ssh_authorized_keys`，将 A drop-in 移离活动配置目录。操作者回执 `cloud-init schema --system` = `Valid schema user-data`、`visudo -c` PASS、`A_CONFIG_DISABLED`、`A_EVIDENCE_SAVED`、`ubuntu P`。**此时机器的 `90-cloud-init-users` 仍是 A 阶段产物；B 未重新初始化，不能将现有 sudo 行为归功于 B，也不能将 schema 校验等同于有效合并规则正确。**
- **B（额外重启前只读回执，2026-11-11）**：操作者再次检查显示 `A_DISABLED`、`B_PRESENT`；B 配置中的 ED25519 公钥指纹与 Mac 已验身份 `SHA256:ZVFCYycHOGd2VnIPXmvO+HQwit2hB8v5l94NH9unT1E` 一致；`ubuntu P 10/24/2026 ...`，IPv4 路由仍仅 `192.168.56.0/24 dev enp0s3 src 192.168.56.6`，无默认路由。**这些证明配置存在、SSH 恢复输入与账号/路由基线正常，但不证明 B 的嵌套 `system_info` 合并结果或 B 已重新初始化。** 依据 cloud-init 25.2 实现，建议在重启前以只读 `cloudinit.util.read_conf_with_confd('/etc/cloud/cloud.cfg')` 核最终基础配置，仅输出无敏感摘要；特别对比 `system_info.distro/network/paths` 未漂移、默认用户 sudo/lock 与公钥一致。
- **B（cloud-init 25.2 合并配置只读验收，2026-11-11）**：操作者用实验 VM 已安装的 Python/cloud-init `util.read_conf` 与 `util.read_conf_with_confd` 读取基础配置（非运行模块）；`user_name`、`password_unlocked`、`password_sudo`、`ssh_keys_preserved`、`distro_unchanged`、`network_unchanged`、`paths_unchanged`、`groups_unchanged`、`shell_unchanged`、`modules_unchanged`、`top_level_A_absent`、`seed_users_default` 共 **12/12 PASS**，最终 `B_MERGE_PREFLIGHT: PASS`。仅证明这次基础文件/drop-in 合并及 NoCloud seed 中的 `users` 预期符合检查，不代表重跑后的模块实际 sudoers 输出；也不等于验证未来生产 datasource/vendor-data 的所有配置来源。**B-MERGE PASS / B-INIT PENDING**。
- **B（2026-11-11 独立快照恢复后状态）**：操作者报告已将 `SanQ-SUDO-LAB-01` 恢复至 **方案 A 测试之前的 VirtualBox 快照**。恢复后在实验机执行 `stat/cat /etc/sudoers.d/90-cloud-init-users` 均为 `No such file or directory`；`cloud-init schema --system` 发现 `/var/lib/cloud/instances/iid-datasource-none/cloud-config.txt` 中 user-data schema 有效（network-config version 2 因无 netplan API 被跳过），`visudo -c` 仅验证 `/etc/sudoers` 和 `sudoers.d/README`，均 PASS。**这与恢复到 A/NoCloud 实验前基线一致，但尚未核实 B drop-in/NoCloud seed/公钥及 cloud-init 版本是否仍存在；之前 B 静态 12/12 PASS 属于恢复前已丢弃的 VM 状态，不得沿用为恢复后新状态。** 此时缺少 `90-cloud-init-users` 是预期基线差异，不能作为 B 失败；应先只读审计恢复后文件/身份/网络，重建等价 NoCloud+B 而非直接 `cloud-init clean --reboot`。若确认与 A 共享准确前快照，B 可作为独立基线对照；尚未运行 B init。
- **B（恢复后的完整基础检查，2026-11-11，操作者回执）**：`cloud-init --version` 仍为 `/usr/bin/cloud-init 25.2-0ubuntu1~22.04.1`；`status: done / detail: DataSourceNone / errors: []`，`ubuntu P`，路由只有 `192.168.56.0/24 dev enp0s3 src 192.168.56.6`。原 NoCloud `98-sanq-lab-nocloud.cfg`、A/B drop-in 及 `/var/lib/sanq-sudo-lab/nocloud/{meta-data,user-data}` **均 MISSING**；`ssh-keygen -lf ~/.ssh/authorized_keys` 返回 `is not a public key file`，尚不确定是空文件还是格式错误。运行 `cloud-init status` 出现 `99-installer.cfg` 和 `90-installer-network.cfg` 因普通用户权限不足的 REDACTED 告警，不等同 cloud-init 执行失败。**恢复版本与隔离网络符合独立 B 起点，但公钥/NoCloud/B 均需重新建立并核验；不得沿用恢复前 B 的 12/12 PASS，不能直接 clean/reboot。**
- **B（恢复后 SSH 状态复核）**：操作者报告已通过 SSH 连接实验 VM，但在该会话运行 `ssh-keygen -lf ~/.ssh/authorized_keys -E sha256` 输出 `is not a public key file`；`sudo passwd -S ubuntu` 为 `ubuntu P 10/24/2026 ...`，`ip -4 route` 仍只有 `192.168.56.0/24 dev enp0s3 ... src 192.168.56.6`。不能将登录成功误认为这个公钥文件有效，也不能据此保证再次 cloud-init clean 后 SSH 不失联；先检查/备份现有文件，仅传送 Mac `.pub` 公钥并核对指纹，安装后从 Mac 新会话实测密钥认证，再创建 NoCloud+B。未执行 B init。
- **B（恢复 SSH 授权文件成功、认证方式待核，操作者回执）**：原 `/home/ubuntu/.ssh/authorized_keys` 经 `stat` 确认为 `0 bytes 600 ubuntu:ubuntu`；Mac `id_ed25519.pub` 与 VM 上传的 `~/sanq-lab-b.pub` 公钥指纹均为 `SHA256:ZVFCYycHOGd2VnIPXmvO+HQwit2hB8v5l94NH9unT1E`。操作者在实验 VM 备份空的旧文件至 root-only evidence，再以 `0600 ubuntu:ubuntu` 安装公钥，`ssh-keygen -lf` 成功。Mac 新 SSH 会话登录、`whoami=ubuntu` 且公钥指纹相符，授权文件恢复 **PASS**。**新发现**：安装公钥之前的 Mac `scp` 出现 `ubuntu@192.168.56.6's password:` 并成功，意味着当时该 SSH 连接允许某种密码认证回退（须以有效 `sshd -T -C` 和仅公钥客户端实测复核），不能宣称实验机 key-only PASS。应先核真实 SSH 认证配置；后续 NoCloud `ssh_pwauth: false` 生效及禁密码验证必须另行验收。尚未重建 B / 未 clean，生产 NO-GO。
- **B（恢复后 SSH 有效认证策略核验，操作者回执）**：在恢复后实验 VM 上使用 `sshd -T -C user=ubuntu,addr=192.168.56.1,host=192.168.56.1` 读取到 `pubkeyauthentication yes`、`passwordauthentication yes`、`kbdinteractiveauthentication no`、`authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2`、`authenticationmethods any`。Mac 以 `PreferredAuthentications=publickey`、禁密码/键盘交互、明确 ED25519 identity 连接并执行 `/usr/bin/id -un`，返回 `ubuntu`。因此 **公钥路径 PASS，但恢复快照时 SSH_PASSWORD_AUTH_ENABLED**；首次公钥 SCP 可用账户密码是合理的。下一步仅在独立 B 实验中重建与 A 同等的 NoCloud `ssh_pwauth: false`，在 B init 后用相同 `sshd -T -C` 与公钥强制连接复验；禁密码未通过不得标记 key-only，不能依赖未验证的隐含 sshd 变更。生产 SSH 仍无写入。
- **B（2026-11-11 恢复 A 前快照后重新重建的独立实验，最新操作者回执）**：从该快照恢复并修复 SSH 公钥后，已重新创建 NoCloud seed、`98-sanq-lab-nocloud.cfg` 和 **仅 B** `99-sanq-sudo-B.cfg`（`system_info.default_user`）；操作者运行内置 cloud-init `read_conf_with_confd` 对照，`user_name / password_unlocked / password_sudo / ssh_keys_preserved / distro_unchanged / network_unchanged / paths_unchanged / groups_unchanged / shell_unchanged / modules_unchanged / top_level_A_absent / seed_users_default` **12/12 PASS**，`B_MERGE_PREFLIGHT: PASS`。本轮与此前被快照抹去的顺序 B 预检是**两个不同的 VM 状态**，此回执才是独立 B 的最新有效静态门禁；尚无 B init/普通 reboot 输出。下一步仅在确认 VirtualBox 控制台与测试前恢复快照可用后进行 **实验机** `cloud-init clean --reboot`；之后取证新 sudoers 内容/时间、清 sudo 缓存后的非交互拒绝与交互成功、账号 P、公钥 SSH，以及 `sshd -T -C` 是否由当前 `passwordauthentication yes` 变成 `no`。若禁密码失败只能给 B-sudo 部分 PASS，不得宣称整体 key-only PASS；生产始终 NO-GO。
- **B 的下一道门禁**：优先从 A 前的准确升级后快照重新开始独立 B 试验；如未恢复相同初态，只能标记为 **A→B 顺序试验**，并且在 B 重初始化前核查 cloud-init 生效的 `system_info.default_user`、`system_info.distro/paths/network` 等未被意外改变、NoCloud 公钥保留、账户密码及 VirtualBox 控制台恢复入口。随后才考虑隔离机再次 `cloud-init clean --reboot`、新生成 sudoers 与 `sudo -k/-n`、SSH、普通 reboot 测试。**不要在 AWS 生产机执行 cloud-init clean/single 或重启试错**。
- **未解除的生产门禁**：生产既有 `NOPASSWD:ALL`、精确备份 helper 白名单/最后匹配顺序、最新可靠快照及实际恢复能力、Runtime 生产安装及 Mac 人工通道端到端验收、生产 datasource/vendor-data 与配置层级都仍需单独审阅和授权；生产 sudoers/cloud-init 切换保持 **NO-GO**。


> **CURRENT: PR3081_MERGED_DEV / SOURCE_CI_PASS / MAC_SSH_PTY_PASS / MANUAL_CLIENT_E2E_NOT_VERIFIED / CLOUD_INIT_PERSISTENCE_NOT_PROVEN / PRODUCTION_SUDOERS_NOT_CHANGED / CUTOVER_NO-GO**
>
> 本文只列出**读取状态、不改变配置、不执行发布**的步骤及后续必须单独批准的变更边界。没有新的部署/发布/回滚/安装授权，也不得将 sudoers 切换和 cloud-init 重新运行捆绑实施。

## 2026-11-09：独立实验 VM 软件包认证与安装（操作者真实回执）

- 实验实例：VirtualBox 独立 Full Clone `SanQ-SUDO-LAB-01`，原 `Recovery-01` 保持关闭；Host-only `192.168.56.6/24` 且无默认路由；安装前有独立快照 `PRE-CLOUDINIT-TEST`。宿主机当时约 41 GiB 可用；克隆初始 VDI 实际约 3.9 GiB。与生产 AWS 断开。
- 本地 `02-verify-on-lab.py` 验证 Ubuntu Archive Automatic Signing Key (2018) 有效 GPG 签名 `F6ECB3762474EDA9D21B7022871920D1991BC93C`，被认证 `Packages.xz` 2992800 bytes SHA256 `23689efbc7e2ecb2e427fd6af9dbedfc2b45f8ed0492b3463e276db7b1e55a4d`，及精确 `cloud-init_25.2-0ubuntu1~22.04.1_all.deb` 586108 bytes SHA256 `6e8be438cd8da87f68be77c4f6d227b74098db209971c86964651cdf9b9bf645`；工具输出 `ALL INTEGRITY CHECKS PASS`。校验使用实验 VM 的 Ubuntu archive keyring；不是未经验证的外部 hash。
- `sudo apt-get -s install ./cloud-init_25.2-0ubuntu1~22.04.1_all.deb` 输出仅 `1 upgraded, 0 newly installed, 0 to remove`，由 `24.2-0ubuntu1~22.04.1` 升至 `25.2-0ubuntu1~22.04.1`；实际 `sudo dpkg -i` 完成 `Setting up cloud-init`，`cloud-init --version` 与 `dpkg-query` 均返回 `25.2-0ubuntu1~22.04.1`，`sudo dpkg --audit` 无输出。**LAB_PACKAGE_SIGNATURE_HASH_VERSION_AND_INSTALL_PASS**。
- 安装日志里 `dpkg: warning: unable to delete old directory '/etc/systemd/system/sshd-keygen@.service.d': Directory not empty` 是未致安装失败的目录清理告警；`debconf` 未安装 Dialog、回退 Readline；首次实验机 sudo 密码误输后第二次通过。**暂不删除旧目录，必要时只读查验**。
- 这仅完成实验机**软件版本准备**，还没有 A/B cloud-init 用户合并测试、sudoers 行为测试或恢复快照验证。**建议停机后对升级后的克隆建立 `CLOUDINIT-25.2-READY` 快照，之后逐套恢复该快照，以防反复清除旧 Runtime 实验身份资料**。
- 官方 cloud-init 25.2 [clean 命令参考](https://docs.cloud-init.io/en/25.2/reference/cli.html)：`cloud-init clean --logs --reboot` 会在实验机重跑初始化并可能影响 SSH/账号/网络，必须在独立 VM 快照和可用 VirtualBox 控制台之后、已确认 NoCloud 测试 datasource 的情况下单独执行；**绝不在生产或原 `Recovery-01` 上使用**。

## 一、截至本轮的权威事实与证据边界

- 方案 C：PR [#3081](https://github.com/sanqin888/sanqinMVP/pull/3081) 最终 head `cdc195da52fd3bc6cc6f71a4faa46eb5b9ee552d`，GitHub Actions [#41582786567](https://github.com/sanqin888/sanqinMVP/actions/runs/41582786567) `SUCCESS`，squash 合并 `dev` `9859b8e6f1b01fbd8f293e8f50cd7e8c16eb1955`。CI 包含 Linux runner 上 CPython 3.14.10 的 Mac CLI 离线夹具和 CPython 3.10 的 release 夹具；不是用户 MacBook/OpenSSH/远端 sudo 实测。
- 新人工入口在 `ops/release/sanq-deploy-manual.sh`，只在 Mac 真 TTY 下用 `ssh -tt`、固定 hostkey/SSH Agent 和 `sudo -k -p` 执行**已存在**的 Runtime 固定指令；不会为不存在的生产工具创建安装。原 `sanq-deploy.sh` 仍用 `ssh -n -T` + `sudo -n`。生产尚未验证新人工入口。
- 操作者 2026-11-03 终端回执：`ubuntu` 的密码已设为 `P`，`su - ubuntu -c '/usr/bin/id -un'` 经人工密码返回 `ubuntu`；这只证明本地账户认证，不能证实已发生 sudo 的密码挑战。
- 操作者当时回执：`sanq-backup.timer` 为 `active`，最近记录 `Result=success`、`ExecMainStatus=0`，下次当时为 2026-11-03 03:30 EST。**这不是 2026-11-09 的备份成功凭据**，需重新查询最近实际运行/备份原件可用性。
- 2026-11-02 手动 Lightsail 实例快照存在，用户表示无异常；截至 2026-11-09 快照已有一周且恢复链未演练，**不是当前最新业务数据的恢复点**。实际切换前须核最新快照状态、数据库备份和该时点的数据损失/恢复策略。
- 之前生产配置：`sudo 1.9.9`，`/etc/sudoers` 保留 `%sudo ALL=(ALL:ALL) ALL`，`/etc/sudoers.d/90-cloud-init-users` 曾有 `ubuntu ALL=(ALL) NOPASSWD:ALL`，`/etc/sudoers.d/sanq-backup` 曾有精准 helper 授权；`/etc/cloud/cloud.cfg` 曾有 `lock_passwd: True`、`sudo: ["ALL=(ALL) NOPASSWD:ALL"]`。需要复核**当前实时字节/规则先后**，不能从此前观测推断现在仍完全一致。
- MCP `system_status` 2026-11-09 UTC 观察：Docker `active`，磁盘约 35GB 可用；此观察没有权限代替生产 sudoers/备份/SSH 测试。历史 Mac 测试曾在 VM 得到 `/opt/sanq/runtime/ops/release/release_task.py` 不存在的输出；**当前是否已经安装须再次只读确认**。

## 2026-11-09：现场预检首轮真实回执（操作者提供，非独立系统取证）

- **Mac**：`git status --short` 没有输出，`git log -1 --format='%h %s'` 为 `9859b8e6 feat(runtime): add operator-only TTY sudo password channel (#3081)`；固定 Mac Python 为 `3.14.10`；`/bin/sh ops/release/sanq-deploy-manual.sh --help` 返回 argparse 帮助，未建立 SSH 会话。故 `MAC_DEV_CLEAN / PYTHON314_PASS / LOCAL_HELP_PASS`，**尚不代表**真实 `ssh -tt` 和 sudo password flow 通过。
- **VM**：`sudo -n /usr/sbin/visudo -c` 报 `/etc/sudoers`、`90-cloud-init-users`、`README`、`sanq-backup` 均 `parsed OK`；`passwd -S ubuntu` 返回 `ubuntu P 11/03/2026 0 99999 7 -1`。当前 `90-cloud-init-users:4` 仍有 `ubuntu ALL=(ALL) NOPASSWD:ALL`，`sanq-backup:4` 仍存在受限 helper 规则。说明**语法正常，未完成权限收缩**；仅凭这两行还不能排除其他 sudoers 匹配规则或确认以后保留 helper 免密。
- **VM 备份**：`sanq-backup.service` 返回 `Result=success`、`ExecMainStatus=0`、`ExecMainExitTimestamp=Mon 2026-11-09 08:30:47 UTC`，即多伦多当日 `03:30:47 EST`。**当日服务最近记录结果 PASS**；仍未独立验证真实远程归档可恢复，`sanq-backup.timer` 本次没有提供最新 `ActiveState/NextElapse` 输出。
- **VM Runtime**：`test -f /opt/sanq/runtime/ops/release/release_task.py` 返回 `runtime_tool_rc=1`。当前用户权限视图下该文件**未发现**，因此不能用 `sanq-deploy-manual.sh status/plan/apply/rollback` 当作生产密码链路测试，需另设单独权限与安装审阅。
- **首轮尚未提供（后续第二轮已经补齐部分）**：Mac→VM 非 sudo 的 PTY 输出、生产 cloud-init 配置层叠证据、sudoers.d 有效文件清单、最终匹配顺序、生产 SSH `sshd -T` 最新输出、当日 timer 状态、可恢复的最新快照和备份验证。第二轮已取得 Mac PTY、sudoers.d 文件清单、timer，但其余仍缺，**正式 sudoers 切换仍 NO-GO**。
- **发现一项用户界面边界**：人工新入口 `--help` 复用了旧 parser，因此列出 `profile` / `local-check` 等命令，但人工执行入口 `_operation` 白名单仅接受固定 Runtime 命令。这是帮助信息和实际允许命令集合的差异，暂不影响单独 `--help` 预检；后续需做局部说明/修正，不能把所列所有子命令都当作人工入口可用功能。

## 2026-11-09：现场预检第二轮真实回执（操作者提供）

- MacBook 执行 `ssh sanqaws -tt /usr/bin/tty` 返回 `/dev/pts/1`，SSH 会话正常关闭。**SSH_REMOTE_PTY_PASS**，但这里使用现有 `sanqaws` SSH 别名，而不是 `sanq-deploy-manual.sh` 的固定三文件 profile；没有触发 sudo 密码挑战，不等于新人工客户端端到端通过。
- `/etc/cloud/cloud.cfg` 当前匹配 `users:`（行 7）及 `system_info.default_user`（行 94），`ubuntu`（行 95）、`lock_passwd: True`（行 96）和 `sudo: ["ALL=(ALL) NOPASSWD:ALL"]`（行 99）。`/etc/cloud/cloud.cfg.d` 在本次模式下未显示匹配行；**不能据此断言该目录为空、没有其他 YAML 文件/自定义覆盖或云初始化会在正常启动自动重新设置已存在的账号**。当前配置仍包含日后可能重新施加的旧默认权限；必须离线确认同版合并/生成行为，绝不能在生产调用 cloud-init clean/single 做验证。
- `find /etc/sudoers.d -maxdepth 1 -type f` 返回：`sanq-backup root:root 440`、`README root:root 440`、`90-cloud-init-users root:root 440`。与第一轮 `visudo -c` 全通过组合，只能确认这些 sudoers.d 文件当前权限和语法正常；`README` 为说明文件不应当作另一个授权，仍应审查 `/etc/sudoers` 全局 include 与实际 `sudo -l` 输出。
- `sanq-backup.timer`：`ActiveState=active`，`LastTriggerUSec=Mon 2026-11-09 08:30:18 UTC`、`NextElapseUSecRealtime=Tue 2026-11-10 08:30:00 UTC`，即当地 11 月 9 日 03:30:18 和 11 月 10 日 03:30 EST。结合首轮 `sanq-backup.service Result=success / ExecMainStatus=0`、`ExecMainExitTimestamp=Mon 2026-11-09 08:30:47 UTC`，判定 **BACKUP_TIMER_AND_SERVICE_RECENT_RESULT_PASS**；未验证远程归档内容、数据可恢复性。
- **结论**：Mac PTY、账号、sudoers 语法、备份服务/定时器已获现场回执；**CLOUD_INIT_OVERRIDE_NOT_VALIDATED / ROOT_PASSWORD_SUDO_NOT_TESTED / VM_RUNTIME_TOOL_NOT_PRESENT / RECOVERY_NOT_FRESH / PRODUCTION_CUTOVER_NO-GO**。

## 三轮核查补充：cloud-init 官方文档与本实例风险边界（2026-11-09）

- 官方 `cc_users_groups` 频率为 **once-per-instance**，并非普通重启都运行；但当实例身份变化、手工重置/再执行或者从镜像创建新实例时，用户规则可能再次应用。当前文件仍有 `lock_passwd: True`、`sudo: ["ALL=(ALL) NOPASSWD:ALL"]`，属于**未来重新应用的风险**，不是已经观察到密码再次锁定。
- 官方支持 `user` 覆盖发行版 `system_info.default_user`，并注明已存在账户的 `sudo` 与 `lock_passwd` 可重复应用；但是 `users` 列表的配置与默认项、平台 datasource 的 user-data/vendor-data 优先级，以及本机实际 cloud-init 版本/模块执行结果，尚需核实。不在生产直接写入 `/etc/cloud/cloud.cfg.d`、不运行 `cloud-init clean/single/init`、不通过重启试错。
- 下一步**仅可作为离线候选，不是生产写入命令**的意图：确保默认 `ubuntu` 不被云初始化再次锁定（`lock_passwd: false`），同时恢复需要密码的 sudo（`sudo: ["ALL=(ALL) ALL"]`）。准确使用顶层 `user` 还是其它配置形式、覆盖文件名、解析顺序、安装后生成的 sudoers 内容，必须根据**生产同版本** cloud-init 的配置合并与离机验证定案，不能把此候选直接复制到 VM。
- 官方参考：[用户模块与频率](https://docs.cloud-init.io/en/latest/reference/modules.html)、[用户配置示例](https://docs.cloud-init.io/en/26.1/reference/yaml_examples/user_groups.html)、[配置来源优先级](https://docs.cloud-init.io/en/latest/explanation/configuration-priority.html)。`sudoers` 官方手册也明确：多个规则最后匹配者生效，`@includedir` 按字典序读取，并跳过名字中带点的 sudoers 文件；新的同名或更晚规则不能未经核实地盖掉备份 helper：[sudoers(5)](https://man7.org/linux/man-pages/man5/sudoers.5.html)。

### 尚需操作者提供的最小只读证据

```bash
# VM：cloud-init 包及模块配置，只读
cloud-init --version
dpkg-query -W -f='${Version}\n' cloud-init
sudo -n sed -n '1,14p' /etc/cloud/cloud.cfg
sudo -n find /etc/cloud/cloud.cfg.d -maxdepth 1 -type f -printf '%f\n'
sudo -n grep -nE '^[[:space:]]*(cloud_init_modules:|cloud_config_modules:|cloud_final_modules:|-[[:space:]]*(users[_-]groups|ssh|set[_-]passwords)([[:space:]#]|$))' /etc/cloud/cloud.cfg

# VM：sudoers 实际读取入口及当前 ubuntu 可执行规则，均不执行特权业务命令
sudo -n grep -nE '^[[:space:]]*(%sudo|@includedir|#includedir)' /etc/sudoers
sudo -n -l
```

`sudo -n -l` 仅查看授权列表，不执行实际提权动作；如果因为具体策略返回非零，记载该事实而不是重试修改。不要分享密码、私钥、数据库、AWS userdata 内容。使用 `find` 只列 cloud.cfg.d 文件名，不读取可能含秘密的用户数据。

## 2026-11-09：cloud-init 版本与 sudo 完整授权第三轮真实回执（操作者提供）

- `cloud-init --version` = `/usr/bin/cloud-init 25.2-0ubuntu1~22.04.1`，`dpkg-query` 同版。**CLOUD_INIT_VERSION_25_2_CONFIRMED**；任何离线验证必须锁定此发行包版本与 Ubuntu 22.04 环境，不可拿更新版本默认行为替代。
- `/etc/cloud/cloud.cfg` 首部为 `users:\n  - default`；已有 `system_info.default_user ubuntu / lock_passwd: True / sudo: ["ALL=(ALL) NOPASSWD:ALL"]`。文件清单为 `05_logging.cfg`、`README`、`90_dpkg.cfg`。云初始化对以 `.cfg` 结尾的 drop-in 依**字典序读取并由较晚值覆盖较早值**，`README` 不属于 drop-in；但是这两份 `.cfg` 的内容和 datasource/user-data 是否有更高优先级**仍未验证**。官方参考：[cloud.cfg.d 的读取约定](https://github.com/canonical/cloud-init/blob/main/config/cloud.cfg.d/README)。
- `/etc/sudoers:50` 为 `%sudo ALL=(ALL:ALL) ALL`；`:54` 为 `@includedir /etc/sudoers.d`。本机当前 `sudo -n -l` 列出 `(ALL : ALL) ALL`、`(ALL) NOPASSWD: ALL` 和 `(root) NOPASSWD: /usr/local/sbin/sanq-backup-protected-nginx sanqin_nginx_*.tar.gz`。结合前两轮原件行，**AUTHORITY_SOURCE_CONFIRMED**：普通 sudo 的宽泛免密确实仍然生效，专用备份 helper 的精确例外存在。该列表是当前授权声明，不证明权限切换后的密码/备份实际行为。
- 官方 cloud-init **25.2** 用户配置明确允许顶层 `user` 覆盖默认用户，且已存在用户的 `lock_passwd` 和 `sudo` 可重新应用；但官方示例提示 `users[0]` 与 `user` 的优先关系；本机为 `users: [default]`，必须以**同版实际 normalize/merge 实测**确定哪个 override 生效后，才允许写持久文件。源码/实测未完成时，`user: {name: ubuntu, lock_passwd: false, sudo: ["ALL=(ALL) ALL"]}` 仅作为离线候选，不是直接执行的生产配置。参考：[cloud-init 25.2 官方示例](https://docs.cloud-init.io/en/25.2/reference/examples.html)。
- **切换策略目前仅为设计**：保留 `%sudo ALL=(ALL:ALL) ALL` 和 `/etc/sudoers.d/sanq-backup`，在有可用独立回滚通道、最新快照/备份及明确授权之后，以 root-owned 原件保全、`visudo` 候选校验与原子替换调整 `/etc/sudoers.d/90-cloud-init-users` 的 `NOPASSWD:ALL`。暂定收紧为 `ubuntu ALL=(ALL) PASSWD:ALL`（或经同版验证确认仅保留 `%sudo` 即可），不得另外创建可能盖过备份例外的通用权限。最终采用何种文本/顺序取决于离线验证结果。
- **暂停门禁**：生产仍缺现成 Runtime 发布工具（操作者 `runtime_tool_rc=1`）；即使 sudoers 改好，新人工 Mac Runtime 入口也不能用于发布/回滚，也不能宣称已端到端实测。因此不能以“CI 全绿 + TTY PASS”视作生产部署链路已恢复。

### 还需要的只读检查（精确范围，不查看云凭据和 user-data）

```bash
# 已知的两份 cloud-init drop-in：只查用户/权限有关的 YAML key，不查看整个文件
sudo -n grep -nE '^[[:space:]]*(users:|user:|default_user:|lock_passwd:|sudo:|system_info:|name:)' \
  /etc/cloud/cloud.cfg.d/05_logging.cfg \
  /etc/cloud/cloud.cfg.d/90_dpkg.cfg || true

# 同版本用户模块是否启用，读取固定模块目录名而不执行该模块
sudo -n grep -nE '^[[:space:]]*(cloud_init_modules:|-[[:space:]]*users[_-]groups([[:space:]#]|$))' /etc/cloud/cloud.cfg

# sshd 的本次实际有效基础配置，验证未开放 SSH 密码认证
sudo -n /usr/sbin/sshd -T | grep -E '^(pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication) '
```

上述输出中 `grep` 无匹配时退出 1 本身不是错误；只说明该模式下未匹配，**不能证明 cloud-init 用户配置最终合并 PASS**。如果 SSH 有 `Match` 按来源重写身份规则，仍需专门 `sshd -T -C` 带真实连接上下文核对。

## 2026-11-09：第四轮 SSH 与 cloud-init 模块探测回执及纠错

- 操作者执行两份已知 drop-in 的用户/权限键 grep，没有匹配行；仅说明 `05_logging.cfg` 和 `90_dpkg.cfg` 没有匹配该模式的简单键，不代表已验证全部 datasource/vendor-data 或动态来源。
- `sshd -T` 返回 `pubkeyauthentication yes`、`passwordauthentication no`、`kbdinteractiveauthentication no`，**SSH_DEFAULT_KEY_ONLY_PASS**。若 `Match` 规则存在，仍须提供实际客户端上下文输出才能判断该登录的最终设置。
- **纠正前次检查命令的不准确性**：我们写的 grep 使用 `users-groups`，但 cloud-init 的模块名通常为 **`users_groups`（下划线）**；所以只匹配到 `27:cloud_init_modules:` 不能推出用户模块未启用，更不是模块缺失的证据。cloud-init 官方 25.x base-config 示例使用 `users_groups`；cloud-init 模块名的 `-`/`_` 在命名层面可能等价，但 grep 的字符串匹配**不会自动等价**。来源：[cloud-init 25.1 base config](https://docs.cloud-init.io/en/25.1/reference/base_config_reference.html)。
- **一次补正的只读命令（不运行模块）**：

```bash
sudo -n grep -nE '^[[:space:]]*-[[:space:]]*(users[_-]groups|ssh|set[_-]passwords)([[:space:]#]|$)' /etc/cloud/cloud.cfg
```

- 最终仍保留 `CLOUD_INIT_25_2_OFFLINE_MERGE_NOT_PROVEN / MANUAL_CLIENT_SUDO_NOT_PROVEN / RUNTIME_NOT_INSTALLED / CUTOVER_NO-GO`。前述用户密码设为 P、备份 timer 及 service 最近成功、sudoers 有全局免密、人工 SSH PTY 有效等结论不变。

## 2026-11-09：第五轮 cloud-init 用户模块存在性确认

- 操作者使用更正后的正则读取 `/etc/cloud/cloud.cfg`，输出 `27:cloud_init_modules:` 与 `40:  - users_groups`；因此 **USERS_GROUPS_MODULE_CONFIGURED=PASS**。该结果仅确认模块在启动阶段的配置列表中，**不能证明 2026-11-09 再次运行、成功修改任何用户或已完成安全迁移**。此前 grep 漏检问题已关闭。
- 与已确认的 `cloud-init 25.2-0ubuntu1~22.04.1` 一起，官方模块参考说明 `cc_users_groups` 默认 **once-per-instance**；普通重启不必然重跑，但不能保证云实例 identity 变化、人工重置/强制执行和新建实例时不重新施加配置。版本对应的官方页面：[25.2 users/groups 模块](https://docs.cloud-init.io/en/25.2/reference/modules.html)。
- 官方 25.2 配置示例标注 `users[0]` 会影响或覆盖 `user` 指令；**不可仅凭顶层 `user: {name: ubuntu, lock_passwd: false, sudo: ["ALL=(ALL) ALL"]}` 就宣称能覆盖本机 `users: [default]`**。在相同 Ubuntu/cloud-init 25.2 的可丢弃离线环境里，必须并列对比 A：top-level `user` 覆盖和 B：合并 `system_info.default_user` 的明确覆盖或其他经源码确认的方式，并检查加载优先级、默认用户归一化、真实写出的 sudoers、锁定状态和只读备份授权；无充分证据时不选定最终生产 YAML。官方示例：https://docs.cloud-init.io/en/25.2/reference/examples.html 。
- **本阶段关闭的仅为“模块缺失疑问”，不是 cloud-init 持久权限策略或 sudoers 权限切换。** 仍需新鲜可用的恢复点、可执行 root 恢复链、真实 Mac 人工密码 canary、Runtime 生产工具安装/验证（可独立延期）及单独生产写操作授权。

## 二、MacBook 只读预检：不连接 Runtime、不输入密码

从本人的 MacBook 上、**包含最新 `dev` 且本地无未提交改动的 SanQ 仓库根目录**运行：

```sh
git status --short
git rev-parse --verify HEAD
git log -1 --format='%h %s'
/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14 --version
/bin/sh ops/release/sanq-deploy-manual.sh --help
```

`--help` 仅通过原 CLI parser 输出帮助，**不连接 SSH、不会验证密码/TTY**。如果尚未切换到已包含 `9859b8e6` 的 `dev`，应先审阅本地 Git 状态，另行决定如何更新；不要在脏工作树里盲目 `git pull`，不要用 `apply`/`rollback`/`plan` 当作连接测试。

如需验证 Mac 到生产 SSH 的**仅非特权 TTY 能力**，使用与日常 SSH 相同、已认识且已验证 host key 的目标连接 `ssh -tt <已有SSH目标> /usr/bin/tty`（不要照抄占位符）。期望返回远端 `/dev/pts/...`；此探测与新客户端的固定 SSH profile **并非同一项端到端身份验证**，不使用 `sudo`，不证明未来密码挑战会成功。

## 三、生产 VM 只读预检：由当前已获授权的 SSH 会话人工执行

当前全量免密尚未撤销前，以下命令仅观察配置与服务元数据。不复制 SSH 私钥、云凭据、完整 `/etc/shadow` 或数据库内容；不执行 `sudo -k`、`passwd`、`visudo -f` 写入、`cloud-init clean`、`cloud-init single`、备份 helper、部署/回滚：

```sh
# sudo 完整配置语法 + 账号密码状态
sudo -n /usr/sbin/visudo -c
sudo -n /usr/bin/passwd -S ubuntu
sudo -n /usr/bin/id -nG ubuntu

# 仅显示 sudoers 的身份/标签匹配相关行与已知两处受控规则
sudo -n /usr/bin/grep -nE '^[[:space:]]*(%sudo|@includedir)' /etc/sudoers
sudo -n /usr/bin/grep -nE '^[[:space:]]*ubuntu[[:space:]]' /etc/sudoers.d/90-cloud-init-users /etc/sudoers.d/sanq-backup
sudo -n /usr/bin/find /etc/sudoers.d -maxdepth 1 -type f -printf '%f %u:%g %m\n'

# cloud-init 的默认用户项（先确认相关文件存在），只看已知非秘密设置
sudo -n /usr/bin/grep -RInE --include='*.cfg' '^[[:space:]]*(users:|default_user:|lock_passwd:|sudo:|name:[[:space:]]*ubuntu[[:space:]]*$)' /etc/cloud/cloud.cfg /etc/cloud/cloud.cfg.d

# SSH 默认有效配置；如有 Match 规则，另按真实连接上下文核验
sudo -n /usr/sbin/sshd -T | /usr/bin/grep -E '^(pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication) '
sudo -n /usr/bin/grep -RInE '^[[:space:]]*(Match|Include)[[:space:]]' /etc/ssh/sshd_config /etc/ssh/sshd_config.d

# 定时器：观察当前最近/下次计划值和最后服务结果（不发起新备份）
systemctl show sanq-backup.timer --no-pager -p LoadState -p ActiveState -p LastTriggerUSec -p NextElapseUSecRealtime
systemctl show sanq-backup.service --no-pager -p LoadState -p Result -p ExecMainStatus -p ExecMainExitTimestamp
# 真实 VM Runtime 目标路径只核查是否存在，不执行其中任何命令
/usr/bin/test -f /opt/sanq/runtime/ops/release/release_task.py; echo "release_task_exists_rc=$?"
/usr/bin/test -f /opt/sanq/runtime/ops/release/collect_deployment_plan.py; echo "collector_exists_rc=$?"
```

注意：这些探测依赖目前仍存在的 `sudo -n` 权限，**在撤销 NOPASSWD 后不可假定无密码继续可用**。路径 `test` 返回 1 仅表示该调用身份/视图未发现文件，不应误报 VM 故障。回执可粘贴所列结果，隐藏无关主机标识/私人路径。

## 四、下一阶段批准前的安全门禁

| 门禁 | 放行要求 | 未满足时 |
| --- | --- | --- |
| G0 恢复 | 最近业务可接受的快照/数据库备份及**可行的独立救援方法**，至少两个 SSH 会话、明确 root 配置原字节回滚 | NO-GO；不能靠 Lightsail 浏览器 SSH 假冒 root 控制台 |
| G1 凭据 | `passwd -S ubuntu` 仍为 `P`；人工 `su` 已验证；实际 sudo PASSWD 尚须在临时且受控的现场阶段验证 | 不撤销全局免密 |
| G2 sudo 顺序 | 完整 `visudo -c` 通过；匹配顺序无其他隐藏 `NOPASSWD`；最后匹配的备份 helper 仍为免密 | NO-GO |
| G3 cloud-init | 对当前版本明确 `users/default_user/user` 合并含义及 `cc_users_groups` 再运行的行为；离线验证候选而不在生产试 `clean` | 不写持久覆盖 |
| G4 Mac | PR #3081 CI 全绿仅说明离线代码已交付；本机 parser + 非特权 TTY 探测须真实回执；完整密码挑战必须等待受审的现场 sudo gate | 不把未测 CLI 称为可用 |
| G5 Runtime | VM 正式工具来源/路径和版本存在且受验证，否则**不运行新客户端**的 `plan/apply/status/rollback` 假测试 | 单独留为安装工作，不用发布操作测 SSH |
| G6 备份 | 当前 timer 正常、最近成功记录与实际远程归档校验分开；切换后观察下一次自然运行成功 | 不把定时器 active 当恢复保证 |

重要：sudoers 采用**最后匹配规则生效**，`@includedir` 按文件名字典序读取；如果独立备份 helper 规则最后匹配，该 helper 可保持 `NOPASSWD`，但全量 `PASSWD: ALL` 的放置位置不能盖掉它。**不要创建以 `.conf` 结尾的 sudoers.d 覆盖文件并假定它生效**（sudoers 默认跳过名字含点的文件）。`sudo 1.9.9` 不应为变化的 source/retention 身份使用宽泛 wildcard 做精确脚本参数授权。参考官方 [sudoers 手册](https://man7.org/linux/man-pages/man5/sudoers.5.html)。

`cloud-init` 的顶层 `user` 可覆盖默认用户配置，但若 `users` 的第一个条目另有配置会影响优先级；因此不直接断言之前提议的 `user: {name: ubuntu,...}` 覆盖在此生产版本必然正确。离线同版验证后再选择受控持久策略。参考官方 [用户配置示例](https://cloudinit.readthedocs.io/en/stable/reference/yaml_examples/user_groups.html) 与 [基本配置示例](https://docs.cloud-init.io/en/latest/reference/base_config_reference.html)。

## 五、回执与下一次操作判定

本包交付状态 **READONLY_PRECHECK_READY / COMMANDS_NOT_EXECUTED / PRODUCTION_CUTOVER_NO-GO**。收到真实只读回执后，独立生成准确的 sudoers 候选原字节、操作顺序和回滚准入。生产密码认证 canary、替换 `90-cloud-init-users`、任何 `/etc/cloud` 写入、重跑 cloud-init、真实 Runtime 任务/安装/发布/回滚，均需要**另外的逐项明确授权**。
