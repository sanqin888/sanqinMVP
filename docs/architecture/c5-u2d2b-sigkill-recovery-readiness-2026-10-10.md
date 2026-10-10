# C5-U2D-2B — SIGKILL 故障注入与隔离恢复验证（首批）

**状态：LOCAL TEST IMPLEMENTATION / NOT YET EXECUTED IN CI / ROOT LAB NOT VERIFIED / PRODUCTION NO-GO**  
**基线：** PR #2781 已合并至 dev，merge `65ad49f32e67a7b5eaabba3b6d50011e3194d2f4`，GitHub Actions #7146 7/7 PASS。独立工作分支 `audit/c5-u2d2b-failure-recovery-readiness`。

## 1. 已有能力与审计边界

本阶段参考 `AGENTS.md`、`.github/workflows/ci.yml`、`docs/architecture/c5-u2d2-installer-readiness-audit-2026-10-10.md`、`docs/architecture/c5-u2d2a-offline-operator-installer-2026-10-10.md`，及既有 `ops/runtime/offline_root_private_installer.py` 和 `ops/runtime/tests/test_offline_root_private_installer.py`。

U2D-2A 已验证**普通异常注入**和 Linux 原子目录交换的目录/字节语义，但 Python 异常**不等同进程死亡、内核崩溃或突然断电**。它只有硬编码的 `/tmp/sanq-u2d2a-lab-*` 实验边界，且没有任何生产命令入口、配对应用/备份排他证明或可信 root 安装凭据。本次不扩大权限模型，不改 `SOURCE_FILES`、发行/镜像/应用部署/数据库/CI workflow，也不触碰生产 VM。

## 2. 第一批新增测试

`ops/runtime/tests/test_offline_operator_sigkill.py` 在 CI 普通用户权限下，先通过原测试模块建立**一次性** 0700 私有 `/tmp/sanq-u2d2a-lab-*` fixture。仅对这一 fixture 启动一个独立 Python 子进程。子进程将 U2D-2A 的内部测试 checkpoint 接到 **`os.kill(os.getpid(), signal.SIGKILL)`**；不会终止 unittest 进程、宿主机服务、Docker、MCP 或其它 PID。父进程检查真正的 `-SIGKILL` 返回码（不把抛出异常当 SIGKILL），随后使用现有只读 incident inspector 检查实际文件内容和 Journal。

涵盖 8 个中断点：

| 中断点 | 预计 active / retention | Journal / 意义 |
| --- | --- | --- |
| `before_journal` | old active，新候选与 old preimage 已形成 | 无 Journal；必须拒绝自动重试 |
| `pending_journal_before_parent_fsync` | old active | PENDING 文件已 rename，但父目录尚未 fsync；**不宣称断电可恢复** |
| `after_journal` | old active | PENDING durable |
| `after_exchange_before_parent_fsync` | new active，old candidate | 原子交换 syscall 已返回，父目录 fsync 未完成；**不宣称断电可恢复** |
| `after_exchange` | new active，old candidate | PENDING Journal 滞后 |
| `after_exchange_journal` | new active，old candidate | EXCHANGED_UNCONFIRMED |
| `after_retained` | new active，old previous | EXCHANGED_UNCONFIRMED Journal 滞后 |
| `after_final_journal` | new active，old previous | PREVIOUS_RETAINED |

每个 SIGKILL 后必须保留完整 `recovery/preimage`、17 文件/Manifest 与三份 dynamic bytes；旧应用 previous SHA 不变；Journal 只能被**只读**检查器分类，`automaticRecovery=false`、`authorizedToMutateProduction=false`；已有候选/快照/Journal 阻断再次执行。额外检验 SIGKILL 释放子进程 `flock`，但未关闭事故事务不能因为锁释放而自动继续。所有实验路径均由 `TemporaryDirectory` 测试 fixture 独立收尾，禁止通用生产清理行为。

## 3. 尚未完成的 U2D-2B 门禁

1. **CI 权威结果**：新文件已写入本地 isolated workspace，但按 `AGENTS.md` 未执行本地 lint/test/build；仅在用户审阅并明确授权 PR 后，GitHub Actions `api-checks` 中的 `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'` 才会运行新 SIGKILL 用例。当前不得写为 PASS。
2. **root UID/GID 与私有路径证据**：当前 GitHub runner 是非 root，不能证明真正 root:root 文件、ubuntu-owned `.env` 0600、ACL/xattrs、目录跨父 FD 完整防竞态。需在**另一台隔离的、可销毁的 Linux VM**上逐项审阅并执行有限 fixture 测试；不使用生产 `/opt/sanq`，不让 root 直接运行用户可修改的 checkout 或 staging。该操作不在本阶段自动执行。
3. **TOCTOU 防护**：`Path.rglob` 和若干 `Path.stat/read_bytes` 仍是路径级两次查验，尚非 fully fd-anchored/openat2 内核级限定。必须在独立代码审阅中补齐父目录 fd anchoring、`O_NOFOLLOW`、`fstat`/inode identity 和换名竞争故障测试，不能将纯展示用 U2D-1 claims 作为 root 可信事实。
4. **真正冷崩溃/断电**：SIGKILL 只杀应用进程，Linux kernel/页缓存仍在；`renameat2` 并不直接证明 crash-durable。须另行在虚拟磁盘可回滚的隔离 VM 上测试断电/重启恢复、设备损坏/快照外部可恢复性。这不是 CI PASS 的自动推论。
5. **生产应用兼容与维护排他**：新版 Runtime target main SHA、GitHub archive 源证明、运行 App 逆向兼容、backup helper/systemd、MCP/deploy 关闭屏障及独立异机恢复证据都未核对；C5-U2D-2C 继续 BLOCKED。

## 4. 交付规则

本次第一批仅新增标准库 SIGKILL unittest 和本记录，不修改生产 Runtime、Docker、数据库、helper、旧快照或当前 `17` 文件白名单。默认不运行任何本地测试，完成本地代码和工作区差异审阅后停在用户审阅点；另行授权后再推 PR 至 dev、CI 全绿后合并。

**退出判定：`U2D-2B SIGKILL TESTS AUTHORED / CI PENDING / ISOLATED ROOT+COLD RECOVERY STILL BLOCKED / PRODUCTION NO-GO`。**
