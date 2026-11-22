# Runtime G3 — cloud-init sudo 与 Lightsail SSH CA 配置幂等性收口（2026-11-22）

> **当前结论：G3-1_MINIMAL_CANDIDATE_DOCUMENTED / G3-2_PLATFORM_RISK_DECISION_OPEN / OFFLINE_TESTS_AUTHORED_NOT_RUN / G3_SOURCE_READY=NO / AWS_DYNAMIC_RETEST_REQUIRED / PRODUCTION_SUDO_CUTOVER_NO-GO。**
>
> 本文基于 `dev@31e3ac6b23436cace344b824f752dc351cf831ec` 与 [2026-11-22 AWS 原始回执整理](Runtime-AWS实机sudo重初始化与离线救援演练报告-20261122.md)，并核对 cloud-init **上游 tag 25.2** 的写入实现；未取得 Ubuntu 包 `25.2-0ubuntu1~22.04.1` 的逐字节补丁对照，所以下文“源码机制”属于上游版本静态推理与 AWS 现象相符，不冒称已在安装包中再次逐行取证。当前未创建新 AWS 实例、未执行新的云重初始化、未编辑生产配置。源代码改动只含 **离线模型测试**，不接生产服务或赋予新的特权入口。此处 G3 专指 sudo/cloud-init 与 Lightsail SSH CA，不是旧 Runtime 首次安装监督阶段的同名 G3。

## 一、证据范围与所有权

| 对象 | 写入者/所有者 | 已有实测 | 本轮仍不能证明 |
| --- | --- | --- | --- |
| `/etc/cloud/cloud.cfg.d/99-sanq-sudo-password.cfg` | **SanQ 方案 B**，只覆盖 `system_info.default_user` 的 `name/lock_passwd/sudo` | AWS 25.2 合并值、普通重启、重新初始化与快照新实例的密码 sudo 均通过 | 完整干净镜像首启前预置 B；任意 datasource/vendor-data 变化 |
| `/etc/sudoers.d/90-cloud-init-users` | **cloud-init 生成物**，不是 SanQ 长期文件所有权 | 干净一条；普通重启不变；手动重初始化与恢复新实例产生两条相同密码规则，0 NOPASSWD | 所有可能的历史混合规则均安全、文件字节天然幂等 |
| `/etc/ssh/lightsail_instance_ca.pub` 与 `/etc/ssh/sshd_config` 中 CA 行 | 实测的 **Lightsail user-data 脚本** | 重初始化后 `TrustedUserCAKeys` 从 1→2；`sshd -t`、浏览器 SSH（主机密钥重新核验后）和 Mac 公钥 SSH 可用 | 第三次重跑、前置 Include/Match、未来 CA 内容更新或平台实现变更 |
| Mac Runtime 客户端/backup helper | 各自原 Runtime/Ops 和 backup owner | 原生 Mac `ssh -tt` 密码 sudo 与 TTY 失败恢复通过；G2 专用白名单曾在隔离机通过 | **正式** `sanq-deploy-manual.sh status` 远端端到端，生产切换后自然备份 |

原 AWS 回执是用户终端输出与 AWS 控制面摘要，不是此次新动态验证。**不可改写原报告 1→2 结果为 PASS；不可从 sudoers 同文重复直接推出将来不会权限漂移。**

## 二、G3-1 根因：cloud-init 25.2 追加是“规则块包含判断”

上游 `cloudinit/distros/__init__.py`（tag `25.2`，`Distro.write_sudo_rules`）的核心机制：

1. 为 `ubuntu` 和 B 的 `sudo: ["ALL=(ALL:ALL) ALL"]` 组装以下**完整连续字节**（包括开头空行、注释与结尾 LF）：
   ```text

   # User rules for ubuntu
   ubuntu ALL=(ALL:ALL) ALL
   ```
2. `90-cloud-init-users` 不存在时：以 `util.make_header()` 加此块创建，模式 0440。
3. 文件已存在时：仅在**整个 content 子串**不在现有文本时，调用 `util.append_file`。不是“有同样的一行就不添加”，也不是覆盖、剔除旧的 NOPASSWD。
4. `cc_users_groups` 正常按 **once-per-instance** 执行；普通 reboot 不会强制重写。完整 `cloud-init clean --reboot` 清掉实例执行标记后重跑；快照成为不同 instance ID 时同样须预期用户模块再次应用。

因此，AWS 中此前为当前实例**人工原子替换**的“只留一行 `ubuntu ALL=(ALL:ALL) ALL`”与官方完整 content 不同。重新初始化时官方识别不到原块，就在文件末尾追加一份，形成两条同文密码规则。这解释第一次 1→2；若后续**保留完整官方块且没有其他写入者**，同版 `write_sudo_rules` 的子串检查应跳过再追加。**这只是静态演绎，尚未得到 AWS 连续两次 clean 的现场证明，也没有证明其它来源绝不写同一文件。**

### 最小候选（方案 B 不变、但调整未来一次性切换的生成物准备方式）

- 仍保留 B 的精确 YAML、账户现有密码、SSH 公钥策略、`%sudo` 管理员规则与独立 `sanq-backup` 精确白名单；**绝不**增加 NOPASSWD、`sudo -S` 或新的 root 自动执行器。
- 未来**单独获批准的切换窗口**，不再把 `90-cloud-init-users` 规范化为“只包含单独规则的一行”。拟用文件的 **sudo 权限效果仍为一条密码 sudo**，但保存与 cloud-init 25.2 生成逻辑相同的完整 `# User rules for ubuntu` 规则块（以及必要的官方生成标头），使 `write_sudo_rules` 检查有机会直接命中。
- 在 root 保护的原字节回退包、同文件系统临时文件、`root:root 0440`、`visudo -cf` 与完整 `visudo -c` 后，才考虑原子交接。必须在切换前用**现场实际安装的 cloud-init 包**核对完整规则块与当前额外 sudoers；任何 NOPASSWD、未知赋权、与精确匹配不符或 hash 漂移均停止。不能复用上一轮“一行候选”的旧 SHA 作为新候选 SHA。
- 这个候选**不修改** cloud-init 源码、default_user 配置合同或生成目录的常驻所有权；只是改变未来一次性准备生成物的字节形状。尚未授权将该候选部署到生产或新云实验机。

## 三、G3-2 根因：Lightsail user-data 平台脚本不具重复追加保护

原 AWS 回执仅确认 16 行 user-data 的片段：脚本会写入 `/etc/ssh/lightsail_instance_ca.pub`，以 `>> /etc/ssh/sshd_config` 追加空行及 `TrustedUserCAKeys /etc/ssh/lightsail_instance_ca.pub`，再重启 SSH；**并没有**针对同一指令的已存在检查。正常 reboot 在默认 per-instance user-data 语义下通常不重跑，完整 clean/reinit 与新实例身份则有再运行风险。脚本其余行未完整语义审计，不能断言所有平台副作用均已知。

OpenSSH 的 `sshd_config(5)` 说明绝大多数参数**第一个得到的值生效**。两条**完全相同**的 `TrustedUserCAKeys` 在当前实测条件下可被 `sshd -t` 解析；这不能证明其余 Include/Match 先后、CA 公钥文件内容或来源特定 `sshd -T -C` 都安全。Mac 普通公钥认证主要使用独立的 `authorized_keys`，但仍须分别实测，不能从浏览器 SSH 成功推断 Mac 一定成功。新的 host key 必须通过独立可信来源重新核验，不能自动移除 strict host key 检查。

**所有权边界：** 脚本及其 CA 信任关系来自 Lightsail 平台 user-data，不是 SanQ 仓库管理的 SSH 配置。直接改脚本、把用户 CA 配到其它 include、自动删除原行、禁用 `TrustedUserCAKeys`、替换 sshd 认证方式，都涉及平台脚本/SSH 信任合同或 root 配置改动，**须先列明影响并经单独明确授权**。本轮不做。

## 四、方案比较与推荐

| 方案 | 安全性 / 平台兼容性 | 复杂度与升级影响 | 回退与结论 |
| --- | --- | --- | --- |
| **A. 利用 cloud-init 官方块本身去重**（sudo）+ 不主动触及 Lightsail | 不扩权；继续使用原 25.2 模块语义；保留 B 合同。若 cloud-init 升级改变生成格式必须再核对 | 极低；改变未来切换文件形状，不新增长期服务 | 现有 root 原字节包原子回退；**G3-1 优选**，仍需真实重初始化验证 |
| **B. 新增 root-owned post-init 正规化/一次性 helper**（sudo/sshd） | 可试图做到文件字节幂等，但与 cloud-init 执行顺序、Lightsail user-data 和 sshd 重启竞争；输入误判会锁死管理员 | 中高；新 privileged 安装、启动顺序、事故恢复和升级维护 | 需新增 root 交付/授权/失败测试、明确撤回；**不属于本次已授权边界，不实施** |
| **C. 让 SanQ 接管 Lightsail user-data 的条件追加** | 理论上可使 CA 行只写一次，但改变平台提供的浏览器 SSH 信任路径及未来重建行为，不能认为平台脚本允许 SanQ 安全改写 | 平台耦合高，必须重新审阅脚本所有权、版本、CA 更新、快照还原路径 | 单独云侧回退与失联救援；**须用户明确批准后另行实施** |
| **D. CA 重复保留，严格验证有效值并登记风险接受** | 保留平台所有权；相同值的重复通常不改变当前 OpenSSH 有效选项，但无限次文件增长/不同值前置/CA 轮换及未来升级仍有风险 | 最低，无常驻组件；每次重初始化需审查指令计数、哈希与实际访问 | 若漂移/未知则 NO-GO，保持两个管理会话及离线救援；**G3-2 暂推荐，但尚未获风险接受批准** |

**建议最小路线：A + D。** A 保证同版给定输入的候选 sudo 生成物内容保持不变；D 并不达成 SSH 配置的**字节幂等**，只提出带门禁的**有效策略等价性**风险接受。若用户坚持 G3 的两份生成文件均须严格字节幂等，则 D 不合格，需另行批准 B/C 的权限与平台边界变更。未批准风险接受前，**整个 G3 不能标 SOURCE_READY**。

## 五、G3 检查与真实动态验收合同（均为未来明确获准的窗口；本轮不执行）

### 必需证据：按场景独立记录

| 场景 | 对 sudo 的要求 | 对 SSH/CA 的要求 |
| --- | --- | --- |
| 干净首启 | 先证明方案 B 在首次初始化前已存在；`ubuntu P`，最终仅密码管理员授权、无宽泛免密 | 核平台 user-data 准确来源、CA 文件身份、key-only 与浏览器 SSH |
| 普通 reboot | 实例 ID、sudoers 原字节 hash、规则数、权限及时间戳均稳定；`sudo -k; sudo -n id -u` 非零且交互成功 | 不增加 CA 行；`sshd -t` 与 `sshd -T -C` 安全，Mac 公钥登录 |
| 一次 complete clean/reinit | 有真实 cloud-init 执行记录；`NOPASSWD:ALL=0`；密码 sudo 成功，`visudo -c` 通过 | 浏览器 SSH/CA 有效；指令重复明确分级；独立核验新 hostkey 后 Mac 公钥重新登录 |
| **再次** complete clean/reinit（单独隔离授权） | G3-1 A 候选须保持 canonical block 和完整文件 hash、规则数不再增长；有时间戳/哈希与源版本证明 | D 的 CA 文本会继续追加：**严格文本幂等 FAIL**；仅在明确风险接受与有效值、CA 身份、安全连接不漂移时才允许记“语义等价（有限案例）”，不可称字节幂等通过 |
| 快照新实例身份 | 不继承旧实例身份或 hostkey 的验收；主动验证 B 与生成文件 | 受控新 hostkey 复核；平台 CA 仍有效；新地址/端口/入出站与业务冻结另审 |
| 失败/回退 | 原始文件字节、SHA、owner/mode 可用；双 SSH 会话中 A 持续有 root；`visudo -c`、密码/回退策略复核 | `sshd -t` 和真实新连接先 PASS，再退出旧会话；失联按已记录磁盘快照离线救援路径处理，不猜测生产业务可原样启动 |

### 必须分别核验的具体门禁

1. **精确版本/来源**：`dpkg-query` 的 Ubuntu 安装包版本、`cloud-init --version`、datasource/instance ID、有效合并配置和 `cc_users_groups` 执行频率；若不是经过核对的 25.2，则重新审阅上游函数，不能沿用静态推导。
2. **sudo 规则与顺序**：以 root 只读统计每份有效 sudoers 文件中的全部 `ubuntu`、`%sudo`、`NOPASSWD`/ `PASSWD` 与备份 helper 条目；核文件模式/符号链接、`@includedir`、`sudo -l` 的实际最后匹配；`visudo -c` 只是语法门禁。切换后不能只看单文件 grep 或一个成功的 `sudo -v`。
3. **认证**：每次用新的 TTY 执行 `sudo -k`、`sudo -n /usr/bin/id -u`（必须非零）、普通 `sudo /usr/bin/id -u`（必须输入密码后得到 0），错误密码必须被拒绝。普通 sudo 不得因为专用 backup 例外获得任意 root 免密。现有定时备份最终需下一次**自然**调度与归档完整性回执，不运行生产 helper 试错。
4. **SSH**：`sshd -t`，再对 Mac 实际来源及浏览器 SSH 实际来源分别核 `sshd -T -C user=ubuntu,addr=<实际来源IP>,host=<实际host>` 的 `pubkeyauthentication yes`、`passwordauthentication no`、`kbdinteractiveauthentication no` 和准确 `trustedusercakeys`。清查含 Include/Match 的**配置顺序**；CA 文件存在、owner/mode、真实公钥指纹需与独立可信平台来源核对，不在聊天传播公钥/私钥全文。CA 行文本重复虽相同仍必须明确计数。
5. **Mac 主机密钥**：正常 reboot 不得静默放弃旧 pin；重新初始化和新实例须使用可信控制面/独立通道核新 Ed25519/ECDSA 指纹，以专用临时 `known_hosts` 连接，避免修改生产 `~/.sanq-deploy`，绝不 `StrictHostKeyChecking=no`。
6. **重复执行/回退**：每次事件前后记录两份配置的 SHA、规则计数、CA 文件指纹、有效策略及登录结果。**生成物字节幂等、有效权限幂等、可恢复性**三者分开判断。失败时使用**预先已取得 root 的 A 会话**安全原子恢复原件，配置/语法/新 SSH 认证核对完成后再撤旧会话；A 丢失则按已验证的 Lightsail 盘快照只读离线恢复能力安排单独批准的修复，不自动恢复运行态生产整机。
7. **停止条件**：任何全量 NOPASSWD、用户密码异常、sudoers/sshd 语法失败、前置不同 CA 值、CA 文件身份不明、SSH 密码认证开放、Mac/浏览器 SSH 无法建立新的认证连接、备份精确白名单丢失、真实客户端状态未知，全部 **NO-GO**。若 D 获风险接受批准，也只能针对记录中已知且验证过的相同 CA 指令重复；新的数量/其他配置变化必须重新审批。

不在生产环境运行 `cloud-init clean`、`cloud-init single`、`sshd restart` 或执行下面的动态案例；**这张表是验收合同而不是已执行命令记录**。旧 AWS 只有一次 complete clean + 新实例快照演练，不等同新候选的两次重初始化。

## 六、代码/测试及剩余准入

- 聚焦离线测试：`ops/runtime/tests/test_cloud_init_g3_model.py` 仅复现上游已阅读的“完整块存在则不追加”判定和 `>>` 行追加模型，覆盖单行起点、完整块多次执行、仍保留旧 NOPASSWD 的危险混合状态及 CA 先后顺序。测试**不导入安装在 AWS 的 cloud-init，也不连接、写入或模拟生产 sudoers/sshd**；这是已审阅源码模型与安全拒绝判定，**不是云平台 PASS**。
- MCP-workspace 不提供 test/lint/build 执行入口。修改 `ops/runtime/tests/**` 将按现有 `.github/workflows/ci.yml` 的 `ops-checks` 运行 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`，并经 `ops/release` 相关双版本回归；只有用户批准推送后才能得到新 head 的真实 CI 结果。
- **G3-1 候选可审，但 SOURCE_READY 不等于生产就绪**；G3-2 风险接受/是否改平台脚本仍待用户决策。若走 A+D，明确批准 D 并经过新的受控 AWS 实机重复验收后，才能将“已验证的有限语义等价”单独标记；不允许把严格字节幂等标 PASS。若选择严格字节幂等目标，先提出 B/C 的权限/云配置修改范围及新审批，**本地不擅自实施**。
- G4/G5 正式 Mac Runtime 客户端端到端也**尚未开始**，不能用旧原生 SSH、CLI help 或 local-check 冒充；生产 sudo 正式切换依然 **NO-GO**。C1、自建 CPython 与 R2 已暂停研究保持原状态。
- 不需要 Prisma migration；不变更业务 API、Docker、数据库、备份系统、Mac 客户端安全合同或 Runtime 发布执行器。

## 七、下一阶段 G4/G5 — 待用户单独授权后执行（当前仅定义任务）

1. **G4 只读来源与账户通道预检**：固定 Mac Python 3.14.10、OpenSSH 8.1p1 与独立测试 profile（本机 0700/0600、指定身份、独立 hostkey pin），校验无代理/无回退认证；VM 固定 Ubuntu、系统 Python、sudo/cloud-init 与 `/opt/sanq/runtime` 来源/安装状态。不能把“工具缺失”误当可执行，不能从网络连接成功进入真实发布。
2. **G5 只读最小 Runtime 端点**：在**单独获准且已有合规来源的隔离/目标环境**，核对固定 `collect_deployment_plan.py` / `release_task.py` 入口、解释器、root 权限模型、原两锁与只读身份；再使用正式 `/bin/sh ops/release/sanq-deploy-manual.sh status <准确64位测试plan-id>`，而非直接 SSH `id -u`。测试 ID 不存在时，只能记认证及受控状态查询的真实拒绝，不可报任务成功。
3. **交互/故障验收**：真实 TTY 必须挑战 sudo 密码；故意错误密码、超时、断线或 SSH hostkey 不匹配应被拒绝，检查 Mac `stty -g` 前后恢复，输出净化、边界错误及 VM 原状态可独立查询。正常的首次只读命令不执行 `apply/rollback`；不得人为触发业务停写或数据库迁移。
4. **生产前汇总门禁**：按 G3 的真实动态结果、备份自然调度、sudoers 原件回退、平台 user-data / SSH CA 风险签字与最新恢复点，逐项记录 G4/G5 PASS/PENDING/FAIL；只有经过授权的现场事实才能修改切换 NO-GO。

参考：cloud-init [25.2 `Distro.write_sudo_rules`](https://github.com/canonical/cloud-init/blob/25.2/cloudinit/distros/__init__.py)、[25.2 CLI / clean](https://docs.cloud-init.io/en/25.2/reference/cli.html)、[重新运行警告](https://docs.cloud-init.io/en/latest/howto/rerun_cloud_init.html)、[OpenSSH sshd_config(5)](https://man7.org/linux/man-pages/man5/sshd_config.5)、[AWS Lightsail SSH CA 说明](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-securing-linux-unix-amazon-ec2-instances.html)。
