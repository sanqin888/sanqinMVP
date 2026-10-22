# R1C-2C-C — C1-SYN-001 / A0-GUEST-001 只读身份与关键工具原件复核

**2026-10-22 / 本地证据复核 / 原件不入 Git / 未执行新的 Guest 或 SSH 命令。**

## 1. 本次授权、对象及继承

- 用户已单独授权 `A0-GUEST-001` 只读身份核验，延续 [A0-SITE-001 §6](R1C-2C-C-C1-SYN-001-A0-SITE-001现场只读审批包.md) 的 Host `PASS_SCOPED`；历史 C0 仍 `CLOSED / LIMITED-ACCEPTED`，不重复 C0 见证及过度取证。
- 操作员首先在**同一台已启动的 VirtualBox Ubuntu 控制台**（非 SSH）取得 `/etc/ssh/ssh_host_ed25519_key.pub` 指纹、非 root 用户及 Host-only IP；首次向程序输入时漏掉 `SHA256:` 前缀，程序 `BLOCKED`，后来按要求完整输入，经指纹比对才连接 SSH。旧格式失败不视作 SSH host-key mismatch，也不隐瞒。
- 被执行的 Mac 检查程序 `A0-GUEST-001-Mac-ReadOnly-20261022.py` SHA-256 为 `0a58984adcc373f43bf53ba1f91d21c8c9948e4df12a29606a926f1c96c420af`，与操作员运行前给出的摘要一致；本轮独立读取本地程序文本，确认其使用 `StrictHostKeyChecking=yes`、精确 `UserKnownHostsFile`、只允许 `ssh-ed25519`，并在远端执行 G01–G07 指定读取命令；不会因为这些设计属性就推断所有外部来源已受认证。
- 本轮取得操作员上传的 **`A0-GUEST-001-20261022T145533Z.zip`**，整个原 ZIP SHA256 `f309e9a96c6cda5c79d7e0fdf452606c53ab6b32237656e387f5fc6e653f70ec`。私有源原件及准确 VM/VDI/SSH 公钥/IP、boot ID 与 namespace 数值不提交 Git。

## 2. 离线原件完整性

| 核验 | 实际独立离线结果 |
| --- | --- |
| 归档结构 | 30 个 ZIP 条目：1 个目录、29 个普通文件；总解压大小 17,007 B，无重复条目、CRC 错误、路径穿越或 symlink |
| 清单 | `SHA256SUMS.txt` **28/28 原件全部 SHA256 相符**；完整覆盖目录内除自身以外的全部 28 个普通文件（包含 `receipt.json`、`known_hosts.approved`、13 组 stdout/stderr） |
| 13 条原始命令 | Host `S00–S05` 6 条 + Guest `G01–G07` 7 条；**13/13 rc0**、每项 `timedOut=false`、`overBudget=false`、`gap=null` |
| receipt/原件映射 | 13 组输出的原始字节长度与 SHA256 对应一致；UTC 顺序连续自报约 `2026-10-22T14:55:33.764Z` 至 `14:55:42.460Z` |
| stderr | 12 组为空；`S05-keyscan` stderr 60 B 为 SSH 服务版本 banner，而非报错；该项目 `rc=0` 且原件摘要匹配 |

上述核验仅证明**收到的归档内部一致且所含原始回执确实描述了相应命令结果**，单靠自述时间/摘要不能证明其独立外部来源及运行期间无法替换。

## 3. S00–S05 身份与 SSH 信任链限定核验

- S00 机器可读输出确认与已登记候选 VM UUID 一致、`VMState=running`、`nic1=hostonlynetwork`、`nic2..8=none`、clipboard/drag-and-drop 禁用；S01 磁盘 UUID 和归属路径与目标 VM 一致；S02 `HostNetwork` 为 `Enabled`；S03/S04 IPv4/IPv6 forwarding 均为准确值 `0`。
- S05 的 `ssh-keyscan` 原始输出和 `known_hosts.approved` **完整 94 B 逐字节一致**，目标为现场 Host-only IP 的 `ssh-ed25519` 公钥。从该公钥的 Base64 原始字节重新计算 SHA256 指纹，**与 `receipt.json` 的控制台指纹及扫描指纹两者严格相等**；由用户在受控 Guest 控制台独立先取得的指纹值与记录一致。运行脚本使用 `StrictHostKeyChecking=yes` 和本批 private `known_hosts`，不是 SSH 首次连接自动信任。
- 实际 SSH 密码认证后成功执行 G01–G07；独立核验的是已归档的 raw 和工具运行路径，不是对所有 Host/Guest 溯源的外部公证。保留 `receipt.json` 原始 `consolePinAndScanMatch=true`、`guestAuthenticated=false`、`a0Approved=false`、`a1Approved=false`、`traceAuthorized=false`、`readyToInstall=false`，**不可倒改为 `true`**。本阶段“核验成功”指的是指定 SSH host key 与受控控制台先验 pin 的技术绑定和受限 Guest 读取成功，而非程序自动授予认证/执行权。

## 4. G01–G07 Guest 原始结果及现有可信来源候选对照

| G 项 | 实际 raw | 限定判定 |
| --- | --- | --- |
| G01/G02 非 root 身份 | UID `1000`，GID `1000`，均 rc0 | **非 root 验证通过** |
| G03 boot ID | 符合 UUID 格式，rc0 | 记录本次 Guest boot 身份；本身不是外部证书 |
| G04/G05 namespace | `mnt:[数字]`、`pid:[数字]` 格式正确，rc0 | 已获得本次会话的 namespace 线索；不推断完整进程闭包 |
| G06 ptrace | `ptrace_scope=1`，rc0 | 静态策略观测；不是 `strace` 在本次成功运行的证据 |
| G07 `/usr/bin/strace` | SHA256 `28f957c227012de0b18d1bd7fff2d396cb693ea60ed8013be68de071e84b5001` | 与既存 [R1-C §14.3](C5-G2-R1-B-只读GuestFD采集器与执行审批.md) 官方签名 Ubuntu `strace_6.8-0ubuntu2_amd64.deb` 包成员候选 SHA 相符 |
| G07 `/usr/bin/python3.12` | SHA256 `e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f` | 与既存 §14.3 `python3.12-minimal` 官方原件候选 SHA 相符 |
| G07 `/lib64/ld-linux-x86-64.so.2` | SHA256 `c20a2dc8917c755f02b94049356320fe1f62ac7d9df39302da` | 与既存 §14.3 `libc6` loader 包成员候选 SHA 相符 |

本批实际复核 G07 的三条 stdout 文本、长度和摘要；**没有重新读取或验证以前的 Ubuntu Release/Packages/.deb 签名原件**，因此“与现有可信来源候选 SHA 匹配”不是宣称本次重新做过签名验真。任何路径替换/运行期间字节保护及真实 `strace` 能力仍后续按风险决定。

## 5. A0 收口范围与后续

**最终技术裁定：**`A0-GUEST-001 RAW OFFLINE INTEGRITY = CHECKED`；`A0-GUEST-001 CONSOLE-PINNED SSH + NON-ROOT/BOOT/NS/PTRACE = PASS_SCOPED`；`A0-GUEST-001 THREE KEY EXECUTABLE SHA = EXISTING SOURCE CANDIDATES MATCHED`。结合此前 `A0-SITE-001 HOST PASS_SCOPED`，**A0 已达到本次非 root、可丢弃 VM 合成实验的受限技术身份与隔离核验目标**；该判断为 SanQ 内部技术审阅结论，**不覆盖原回执永久的 `a0Approved=false`，也不自动授予 A1/A2 或真实 trace 运行权限**。

**下一个有界工作包为 A1**：将冻结的三个 inert source/输入原始字节准确安全投送至同一 Guest 的私有测试目录，以受控身份验证实际位置、模式、源 SHA 和关键解释器/tool pins，明确不允许 root/自动安装/业务写入。任何新增文件写入、目录创建或独立执行程序仍需用户明确批准对应动作/目标；再单独审阅 A2 的真实 stdout/stderr/rc/预算采集器，最后才是 A3/A4 的 `strace` 场景审批。

本批未启动 VM（原已 running）、无新增 Host/Guest/SSH 命令执行、未修改 Runtime v1 或生产；`C0 CLOSED/LIMITED-ACCEPTED / C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。所有审计文档停在本地分支，**未授权远端交付**。
