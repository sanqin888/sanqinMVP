# R2-A2-3 — VB-04D1 离线 Unit 依赖与安装 Manifest 合同实施记录

> 2026-10-24（America/Toronto）｜**LOCAL SOURCE COMPLETE / TESTS NOT RUN / REVIEW PENDING / NO PR / P0-01 NOT_RUN / PRODUCTION NO-GO**。基线 `dev@05ec6ef89a73878dee345ec82114f0230c8021c5`（PR #2926、CI #7501 SUCCESS）。本批依据用户“合并后开始下一步”的继续实施授权，只在 MCP-workspace Runtime/Ops 增加纯离线结构校验和负例测试。**不增加安装、网络、系统、Docker、Mac/Guest/生产写能力**。

## 1. 现有规范与依赖

依据根 `AGENTS.md`（第 1、4、10、11 节）、`.github/workflows/ci.yml`（`ops-checks` 中 Runtime `unittest discover`）、[R0](Runtime更新-R0冻结设计.md)、[R2-A2-2](Runtime更新-R2-A2-2禁入适配器与安装权限撤回设计.md)、[R2-A2-3](Runtime更新-R2-A2-3隔离启动屏障PoC就绪与持久化前置审计.md)、[VB-04C](Runtime更新-R2-A2-3-VB-04C启动守卫安装依赖与撤回设计.md)、`ops/runtime/maintenance_boot_guard{,_contract}.py` 与实验 sqlite CAS 模型。新代码归属 Runtime/Ops，不向 NestJS/Prisma 或 17 文件 Bundle 扩散，不改 P1/A2-1/原发布装置。

VB-04A/B 操作者原始回执显示 Guest Kernel 5.15 / systemd 249、三个 Unit 当前 inactive/disabled，`docker.service` 通过 `-H fd://` 依赖 `docker.socket`，`docker.socket` 监听 `/run/docker.sock` 并可触发 service，`containerd.service` 是独立入口。**此处输入只是用户提供的 Unit 字段声明，没有进 Guest 读文件或调用 systemctl。**

## 2. 交付文件与纯离线能力

- `ops/runtime/maintenance_boot_guard_install_manifest.py`：明确 `sanq.runtime.vb04d1-unit-install-manifest.v1` 版本的 `ObservedUnit`、`UnitBaseline`、`PathIntent`、`HookIntent`、`InstallManifest` 和 `OfflineManifestVerdict`。收到完整**调用方提供**的合成观察快照与候选路径意图时校验：
  1. 目标限三 Unit、systemd **249**、准确 vendor fragment / 启动命令 `dockerd -H fd://` / socket Listen/TriggeredBy；`inactive/disabled` 和无旧 Drop-in 作为**本实验候选**的前置条件，任何差异必须重新设计而非静默放行；
  2. 仅将三 Unit 间显式 `After/Before` 关系视作**简化静态有向图**，拒绝循环（不宣称覆盖外部所有 systemd target、implicit dependencies 或真实 systemd manager）；
  3. 限定候选 root-owned 的 9 个文件/目录路径、逐文件 SHA256 **声明**及 owner/mode **意图**；无文件读取/状态/权限的实测，更无安装时的 no-follow/atomic rename/fsync 实现；
  4. 同时必须有 `docker.service / SERVICE_PRE_EXEC` 与 `docker.socket / SOCKET_PRE_BIND` 的每次尝试重新核验/未知 DENY **意图声明**；无可执行 unit 内容、Guard CLI、unit 写入或 systemctl 调用；
  5. 强制保留 `DIRECT_DOCKERD_UNCONTROLLED`、`EXISTING_WRITERS_UNVERIFIED`、`OFF_HOST_AUTHORITY_NOT_VERIFIED`、`G06_RESCUE_NOT_VERIFIED`、`SYSTEMD_249_RUNTIME_NOT_TESTED` 五项阻断风险，不允许 manifest 自报消除。
- `ops/runtime/tests/test_maintenance_boot_guard_install_manifest.py`：固定结构正例仍 DENY，以及篡改身份/版本、Unit/Socket/daemon/依赖环、重复缺项、错误路径/属主/权限/摘要、遗漏双门禁、假冒 off-host 权限、P1/BUNDLE 边界等聚焦负例。

`evaluate_offline_manifest()` **永远** `decision=DENY`，`authorized_to_install=False`、`authorized_to_start_docker=False`、`can_arm=False`、`authenticated_off_host=False`。即使 `candidate=STATIC_STRUCTURE_VALID` 也仅是声明结构满足此合同的提示，不是已审系统级 Unit 语义、代码安全、源码来源或运行授权。

## 3. 尚未验证、未授权的安全门禁

- 不生成可执行 `.service/.socket/.conf` 安装文件；不编写或调用 installer/Guard interpreter/subprocess/fs/network；不访问 Mac 用户私有 SQLite 或 VM。
- Unit/目录/文件 SHA 均由测试构造或调用方声明，**未读取真实 root-owned 文件**；要证明实际 systemd 249 顺序和 socket pre-bind fail-closed，必须在独立审批的 Guest 中先验证 vendor 合同、unit 内容与状态机。当前 `systemd-analyze verify`、`systemctl show` 修改后核验、正反启动、G06 救援均 NOT_RUN。
- 直接运行 `dockerd`、已运行的 containerd/shim/writer、root/docker-group/备份脚本绕过仍为明确 BLOCKER；离机 mTLS/epoch/外部抗回滚、P0-01A–F、S03/G06/S09、R2-C4 全部未证明。
- 本批只在 workspace 编写；此工作区没有 lint/build/test 执行能力，**没有本地测试通过声明**。获用户审阅和远端 PR 授权后才以 GitHub Actions 作为 CI 验证；不得在本批直接推送远端或升级到 VM/root。

## 4. 下一道门禁

完成本地审阅后可单独批准本次 VB-04D1 的 GitHub PR/CI。随后仍需 **P2-C3C-min** 的真实认证离机账本设计与独立授权，以及 Guest 内经用户另批许可的 systemd 249 最小真实 Unit 试验、写者持续禁入、安装权限、准确 VM 快照与事故救援流程。在正式授权前，不能把离线声明当作 R2-C4 可用的 Live Guard。

`VB-04D1 LOCAL_IMPLEMENTED / REVIEW_PENDING / CI_NOT_RUN / REAL_BOOT_GUARD_NOT_INSTALLED / P0-01 NOT_RUN / PRODUCTION NO-GO`。
