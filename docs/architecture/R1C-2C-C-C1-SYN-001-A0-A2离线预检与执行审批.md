# R1C-2C-C — C1-SYN-001 A0–A2 离线预检与执行审批准备

**2026-10-22 / 基线 dev@9845e698 / LOCAL SOURCE+TESTS PREPARED / A3-A4 NOT EXECUTED。**

## 1. 权威继承与范围

- 最新 [R0 §4.1 最小必要取证](Runtime更新-R0冻结设计.md) 与 [C0 §7 限定关闭](R1C-2C-C-C0独立身份与保管链证据复核.md)：`C0 HISTORICAL EVIDENCE CLOSED / LIMITED-ACCEPTED`，不重新做 B-004，不再要求第三方人士见证、签署 PDF、多跳归档。
- [C1-SYN-001 已合并设计](R1C-2C-C-C1-SYN-001受控观察设计与审批草案.md) D0：SYN-01 为 `exec/open/read/exit`，SYN-02 为 `fork/child exec/mmap/exit`，两者都是**非业务、非 root、隔离可丢弃 Guest 上的专项技术观察**。不等同于 Runtime 主线 C1 完整执行消费认证；当前 R0 也不再默认强制穷举所有 Python/ELF/dlopen。
- 本次为 Runtime/Ops 模块内 **A 类独立能力**：新增 `ops/runtime/c1_syn001_approval_offline.py` 及 `ops/runtime/tests/test_c1_syn001_approval_offline.py`，只消费调用方提供的准确三份源字节与**可选的不可信现场声明**，生成不可授予权限的审批预览。无 CLI、无本地文件读取、无子进程、网络、SSH、Guest、VM、ptrace、修改宿主或生产系统的行为；不修改 v1 reviewer、正常更新核心或启动提案。
- Git 只存冻结候选摘要和脱敏示例；真实 VM UUID、VDI、IP、SSH 原始 key/known_hosts、实际 boot/ns、用户凭据和现场回执必须留在私有受控位置。

## 2. D0 源材料精确冻结

仓库已有惰性 `.py.txt` 候选（**不因文件后缀而变成可执行脚本**），对应下次经过批准后的私有 Guest 路径如下：

| 源文件 | 批准后候选目标路径 | 原始字节 | SHA256 |
| --- | --- | ---: | --- |
| `C1-SYN-001-SYN-01.py.txt` | `/tmp/sanq-c1-syn-001/syn01.py` | 1028 | `7e5d7e810ffd1e0a2720ada15a26e9a39004fda50ecd1317c8f80c82c9974cac` |
| `C1-SYN-001-SYN-02.py.txt` | `/tmp/sanq-c1-syn-001/syn02.py` | 1641 | `411fa8ebc54301c554d3380d7d778d9cd7ae176b62833a3218673b5054c7c546` |
| `C1-SYN-001-input.txt` | `/tmp/sanq-c1-syn-001/input.txt` | 25 | `8df9b096863665361212a14784dccabcc9de929bd524ec1529ed1eb2f1df6552` |

**无源码再生成许可**。任何材料改变、大小不符、编码变化、末尾 LF 变化均拒绝；在现场拷贝后仍需对真实文件原始字节校验。受控目录目标为 `0700`，预检查权限/所有者、symlink/bind/shared mount，输入默认只读；仅依赖文件 SHA 不能证明观察期间不可替换。

## 3. A0 实验当次身份与隔离核对（NOT EXECUTED）

现场负责人与内部审核人核对（**无需外部见证**），先从受控 Mac/VirtualBox 操作配置与首次建信所用 Guest 控制台得到批准的 VM UUID、VDI UUID、SSH host key SHA256；严禁首次见到未知 SSH key 就自动批准或 `StrictHostKeyChecking=no`。然后对同次当前 Host/Guest 回执进行准确对照：

| 核对目标 | 预期来源与判定 | 当前 |
| --- | --- | --- |
| VM/VDI | SanQ 批准对象 UUID 与当前 VBoxManage 观察值一致、正确磁盘；VM running | `OPEN / SITE UNKNOWN` |
| Host-only/NIC | 指定 Host-only 网络，非目标网卡/桥接/NAT 与剪贴板/拖放配置符合既有隔离准则 | `OPEN / SITE UNKNOWN` |
| SSH 连接 | 由受控 Guest 控制台建立准确 host key pin；连接时与被批准值比对，未知/变化 key 即停止 | `OPEN / SITE UNKNOWN` |
| Guest | 独立从批准的 Guest 会话获取实际 UID/GID（非 root）、boot ID、mount/pid namespace、时钟、解释器版本与 ptrace_scope | `OPEN / SITE UNKNOWN` |
| 实验文件和工具 | 实际 `/usr/bin/strace`、`/usr/bin/python3.12`、loader 及关键源原始字节 SHA 与可信包成员/已批准来源核对；目录不可跨出私有范围 | `OPEN / SITE UNKNOWN` |

五批历史 `C1-HOST-001～005` 的摘要/原件为背景证据，不可替代新的实时 VM State 或 SSH host key 检查。历史 C0 限定关闭也不是新会话 `A0 PASS`。

离线审批模块可接收 *caller-supplied* `expectedVmUuid/observedVmUuid`、`expectedVdiUuid/observedVdiUuid`、`expectedSshHostKeySha256/observedSshHostKeySha256`、`expectedHostOnlyNetwork/observedHostOnlyNetwork`、`vmState`、`guestUid/guestGid`、`guestBootId`、`mountNamespace`、`pidNamespace`、三组 `expected/observed Strace/Python/Loader Sha256` 等字段；所有字符串仅用于**离线声明一致性**。程序不查询现场，不会把用户提交的“相等”声明等同已认证来源，不回显私有身份信息；其返回的 `a0Approved/a1Approved/a2ExecutionAuthorized/guestExecutionAllowed/readyToInstall/productionAuthorized` 永远为 `false`。

## 4. A1 与 A2 两场景逐项命令候选

冻结执行形式为 `argv` 数组，不允许 shell、`eval`、`sudo` 或默认以 root 执行。仅在另一次准确现场审批通过后，才能转为被允许执行的操作：

```text
SYN-01:
/usr/bin/strace -ff -ttt -T -yy -s 128 -o /tmp/sanq-c1-syn-001/raw/syn01.trace /usr/bin/python3.12 -I -S -B /tmp/sanq-c1-syn-001/syn01.py SYN-01

SYN-02:
/usr/bin/strace -ff -ttt -T -yy -s 128 -o /tmp/sanq-c1-syn-001/raw/syn02.trace /usr/bin/python3.12 -I -S -B /tmp/sanq-c1-syn-001/syn02.py SYN-02
```

- `cwd=/tmp/sanq-c1-syn-001`，`umask=0077`；白名单 `HOME=/tmp/sanq-c1-syn-001`、`PATH=/usr/bin:/bin`、`LANG=C`、`LC_ALL=C`、`TZ=UTC`，不把生产 secrets/SSH agent/PYTHONPATH 传入。精确启动器、环境隔离实现仍需后续审批。
- 两个场景**单独批准、单独归档**：每场景 wall ≤30 s、raw 总量 ≤8 MiB、单 trace ≤4 MiB；若 trace 写满/超时/子进程未退出/rc 未知，按故障保留原件并 `BLOCKED`，不得静默截断、清理或改报成功。 `strace -o` 不会自行采集外层 stdout/stderr/rc：批准前还必须冻结带独立运行结果回执、预算及 fail-closed 清理策略的采集器；不能把这里的命令行当完整可运行操作方案。
- `SYN-02` 必须保留原始 fork/child exec 顺序。旧 v1 reviewer 对 `PROCESS_EXEC` 恰一次、首尾事件的限制未变；若记录无法表达，按真实 `EVENT_ORDER_INVALID` 或 `CHILD_UNTRACED` 上报，**不能修改 v1、合成缺失事件或将 raw strace 当完整消费认证**。
- 源材料/工具的 SHA 命中仅证明 bytes 一致，不能自动证明实际运行中不可替换。官方来源链 S1 既有技术成果可在其准确版本范围复用；不因关闭 C0 重验所有稳定系统库。

## 5. 测试和审批结论

- 离线模块使用 Python 标准库，仅构造 `argv`、白名单环境和预算声明，不执行程序。单元测试从仓库读取**惰性源候选字节**，校验大小/SHA、非 root、预算与记录策略；覆盖缺现场回执、错误 SHA、额外/交换文件、未知字段、SSH host key 不符、VM/VDI 不符、未启动 VM、root/布尔 UID、未知场景等负例。
- 预期 CI：现有 `.github/workflows/ci.yml` 中 `ops-checks` 的 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`；MCP-workspace 无 lint/build/test 执行权限，**未运行**。任何 CI SUCCESS 必须以未来用户授权 PR 的准确 head 为准。
- **当前 A0 = OPEN / A1 = PARTIAL-OPEN / A2 = NOT AUTHORIZED；A3、A4、A5 = NOT EXECUTED。** `C0 CLOSED/LIMITED-ACCEPTED` 不改变 `C1 DYNAMIC OPEN / C5-G2 NO-GO / S2 DAILY PAUSED`。
- **下一次需独立批准的范围**：对准确 Mac/VM/Guest 的 A0 只读现场检查；固定文件安全投送/私有临时目录创建与实际 SHA；独立 stdout/stderr/rc 采集器与超时/配额/失败保全；然后**分场景审批** A3/SYN-01 和 A4/SYN-02 的真实 `strace`。此文及新代码都**不是**运行许可，也不需要第三方人员签署。
