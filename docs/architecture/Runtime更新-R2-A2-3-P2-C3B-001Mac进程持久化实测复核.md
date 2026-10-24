# R2-A2-3 — P2-C3B-001 Mac 本机 SQLite 进程级持久化实测复核

> **2026-10-24（America/Toronto）｜OPERATOR_TRANSCRIPT REVIEWED / MAC PROCESS-LEVEL PASS_SCOPED / P2-C3B-001 CLOSED_SCOPED / NO MAC OR GUEST ACCESS BY MCP / PRODUCTION NO-GO。** 操作者提供 Mac Terminal 完整执行记录（当前对话附件），本文件记录该记录可直接支持的结果。没有独立签署的现场取证包、OS 掉电测试或远端 CAS 认证回执；不得将本实验升级为 P0-01、S03 或真实 OFF_HOST authority。

## 1. 源码与边界

- 来源固定到 `dev@c8e1c13d402ffb92eb568b5c817fc76a26d89212`（PR #2924 squash merge；Actions #7497 SUCCESS，`ops-checks` 报告 Runtime `Ran 600 tests ... OK`）。源文件只从该固定提交下载到**Mac 用户私有实验目录**；未复制生产机、项目数据库、支付/外卖密钥或生产 Docker 配置。
- 操作者在 `~/Library/Application Support/SanQ-Runtime-CAS-Lab/P2-C3B-001/` 下新建实验根及 `source/`、`data/`，四级目录实际 `apple` owner、`0700`。本目录仅是隔离用户态实验位置，不是可信 root-owned service custody。
- 八份来源文件均经 `git hash-object` 对照预先核验过的固定 Git blob SHA，8/8 `OK`，回执为 `SOURCE_VERIFICATION_PASS`。本次没有记录这八文件的另外一套独立归档签名，也未将原件上传仓库。
- 平台来自此前 P2-C1 实测：macOS Catalina 10.15.8 x86_64，系统 `/usr/bin/python3` 3.8.2、其 sqlite3 模块 SQLite 3.28.0，本地 APFS/FileVault 已开启；Host-only interface `bridge100/192.168.56.1`。本次**没有**新启动 Guest/Host-only CAS 监听、mTLS 或 launchd 服务。

## 2. 原生测试与持久化读回

| 批次 | 操作者实际执行与输出 | 有界结论 |
| --- | --- | --- |
| B01 目录/固定源码 | 4 个目录 owner `apple`、mode 0700；8/8 blob SHA 匹配 | `SOURCE_AND_DIRECTORY_PASS_SCOPED` |
| B02/B03 Mac unittest | `/usr/bin/python3 -I -S -B -m unittest discover ... -p test_maintenance_off_host_cas_sqlite.py -v`；22 个逐项 `ok`，`Ran 22 tests in 1.897s / OK` | 本机 Python/SQLite 的 22 项 synthetic 用例 `PASS`；含并发请求、错误 predecessor/nonce、伪身份、损坏/模式拒绝。不是生产身份认证 |
| B04 同进程提交 | 新建 `data/authority.sqlite3`，使用显式 synthetic enrollment，顺序提交两个 epoch；输出 `PERSISTENT_COMMIT_PASS`，epoch=2，phase=`READY_TO_ARM`，state SHA256=`01a468d8cfd3fe153ade329a20248c5f0e93da08f3a22c701e1ac5a66c6aa604` | `SQLITE_COMMIT_PASS_SCOPED` |
| B04 独立进程重开 | 第二个 Mac Python 进程读到 epoch=2、phase=`READY_TO_ARM`，原两笔 request 查到回执：历史 `is_current_head=false`、最新 true；`REOPEN_AND_RECEIPT_PASS` | `REOPEN_PASS` |
| B05-A 真实子进程未提交中断 | 子进程 `BEGIN IMMEDIATE` 后临时更改 head epoch 为 999，未 `COMMIT` 即向自身 `SIGKILL`；父进程核验退出信号码并重读仍为 epoch=2；`B05_A_PROCESS_CRASH_ROLLBACK_PASS` | `UNCOMMITTED_ROLLBACK_PASS`；不是整机掉电 |
| B05-B 真实子进程已提交中断 | 子进程通过真实 `OfflineSqliteCas.submit()` 提交 epoch=3、phase=`INCIDENT`，成功返回至子进程后、对父进程报告前向自身 `SIGKILL`；父进程读到权威 head=3、历史提交查询成功且为 current；`B05_B_COMMIT_THEN_LOST_RESPONSE_PASS` | `COMMIT_THEN_RESPONSE_LOSS_PASS`；不是在 commit 系统调用中的 crash |
| B06 权限/损坏检查 | Mac unittest 包含缺 DB 不自动初始化、symlink/0644 拒绝、篡改 receipt/head/audit 拒绝；没有对**保留中的** `authority.sqlite3` 单独做文件损坏操作 | `SYNTHETIC_TEST_PASS_SCOPED`，不冒充 standalone destructive-failure proof |

B05 后 `FINAL_EPOCH: 3`、`FINAL_PHASE: INCIDENT`。此处 `INCIDENT` 是**实验数据字段**，不构成真实 Docker/生产/VM 事故或授权阻断执行的证据。

## 3. 证明边界及不能升级的权限

- Mac 本机 SQLite 单写 CAS/逻辑重放、用户态进程被杀死后读回获得限定正例证据；**未测试物理突然断电、Mac 整盘恢复旧快照、跨主机最新 epoch 防回滚、真实离机保管/回执验签**。
- 当前客户端身份是字符串声明，实验 `OfflineCasReceipt` 刻意不是 P1 `CustodyReceipt(location=OFF_HOST)`；没有 mTLS、证书配置、网络通信、Guest-side root-owned local receipt、跨宿主 authenticated authority。
- `P0-01A–F` 所需真正 systemd/docker.service/docker.socket/直接 dockerd 绕过、daemon-only crash、live-restore 写者及 G06 独立救援均**未运行**。已观察的 Recovery Clone 冷启动、原 VM 双快照不等于生产 AWS 恢复验收。
- 不编辑/删除 Mac 实验数据库、WAL/source 或 VM 基线；后续若要增加 Mac 服务、专用账户、证书、监听或 Guest 投送/写入，需要准确对象、回退与单独授权。
- `P2-C3A SOURCE/CI PASS`；`P2-C3B-001 MAC PROCESS-LEVEL PASS_SCOPED / CLOSED_SCOPED`；`P2-C3C AUTHENTICATED COMMUNICATION NOT_DESIGNED/NOT_AUTHORIZED`；`S03/G06/S09 OPEN / P0-01 NOT_RUN / C5-G2 NO-GO`。

## 4. 后续决策门禁

本文件只收口 P2-C3B 的**进程级**目标。是否立刻引入 P2-C3C Mac Host-only 认证服务，须与 R0 主线的 `S03` 真实启动屏障验证、`G06` Docker 外独立救援、`S09` AWS 实例恢复及长期 `S2` 备份可恢复能力优先级比较；**不得仅因离线 CAS 已通过而自动安装服务或开始生产维护**。

用户在 2026-10-24 要求先文档更新、再只读审阅仓库并建议优先级。此文档更新本地待审，未获得远端推送/PR/合并授权。