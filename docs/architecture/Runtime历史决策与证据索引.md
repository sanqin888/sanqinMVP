# Runtime 历史决策与证据索引

> **R0 现行口径（2026-10-17 Toronto）：**用户已批准 D1–D5 推荐方案；[Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 统一当前决策、门禁与执行顺序。**R0 DESIGN FROZEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。设计批准不等于真实安装、恢复验收或生产命令授权；S2 暂缓不表示现役备份 timer 已停。

整理基线：`origin/dev@94bc7be6e6e7e40157af1fae42c79a488e7a85b8`，2026-10-17。本文承接 27 份旧篇的结论、替代关系、现场/实验范围、固定原文与原始证据定位。**不是新的安装手册，不重新确认任何 VM/文件仍存在，也不授予旧命令执行、snapshot restore、资源清理或生产权限。**

现行规则见 [Runtime 交付与安装约束](./Runtime交付与安装约束.md)。生产门禁及 G2 后续进展继续见 [G2 合同](./c5-g2-trusted-runtime-contract-2026-10-13.md)、[Recovery Kit](./c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md)、[S1](./c5-u2d-s1-protected-config-snapshot-2026-10-11.md)。本文不重写既有工作日志、G2 负面验收或原始 JSON 收据。

## retirements

| 决策变化 | 应保留的事实 | 不再作为当前指导的内容 |
| --- | --- | --- |
| C4 旧 checkout 路径 → 独立 Runtime/数据路径 | 旧基线发现的挂载、DB project、备份/helper与MCP依赖；后继切换按P2-C/P2-D各自范围验收 | C0/C3/C4旧“未切换”标题，不作为现在仍未安装的证明 |
| C2 checkout字节比对 → B2A外部原始Archive证明 | staging去除checkout依赖只覆盖staging，后续控制器/MCP需单独核实 | 仅因stage完成就删除生产checkout |
| C5-B3长期Root Launcher/Ed25519/ledger路线 | [2026-10-08退役记录](./postmod-ghcr-deploy-simplification-2026-10-08.md) 保留取消事实，旧B2B3设计仍有有用约束 | 常驻launcher、自动激活、签名实验作为现行必做路线 |
| 旧U2D inspect/journal恢复原事务 → Abort & Clean Reinstall | 旧root/lab/SIGKILL证据仍有限有效，现行独立Kit/全新事务/不复用旧journal | 按原事务相位续跑、默认恢复旧树、自动二次exchange |
| 2B2-C三检查点断电计划退役 | NOT EXECUTED；原始归档/VM快照需保留，掉电仍NOT VERIFIED | 继续执行已删helper或把“退役”登记为PASS |

## 承接总表

所有“原文”链接锁定同一个整理基线，不随 dev 后续变化。Git blob SHA 是 Git tree 中的准确对象身份，**不是实际安装的源码或原始实验 Archive SHA256**。每行的摘要保留结论与限定范围，完整历史理由和未采用选项仍可直接查看对应固定原文。

| 编号/旧篇 | 已承接的结论与限制 | 现行/证据去向 | 固定原文 / Git blob SHA |
| --- | --- | --- | --- |
| `u1` — U1 更新合同 | 惰性 old/new 17 项清单与独立 Runtime/app 身份；相同 source、无源变化、PENDING、错误 volume/owner/授权拒绝。原“从旧 journal 恢复”方向由 Recovery Kit 替代。 | provenance、handoff | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u1-runtime-update-contract-2026-10-09.md) · `b9013fe24cfc39e8dd0f2df27494b04d2b044e33` |
| `u2a` — U2A 私有准备 | 先外部认证原 Archive 再创建 0700 私有新树，保留原字节并回读；不安装、不改变 SOURCE_FILES，未完成准备资产隔离。 | staging | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2-trusted-runtime-installer-2026-10-09.md) · `0cc85a9eca5008df4b8130f797b47e7c6c813b14` |
| `u2b` — U2B 非 root harness | 仅 direct /tmp/sanq-u2b-offline-*，拒绝 root；单次 exchange、独立 preimage/journal 与五类注入中断，非真实断电/生产安装。 | handoff、evidence-limits | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2b-offline-runtime-handoff-2026-10-09.md) · `d2f17d19563fc89bd5ee1b8ee292201db7de4db5` |
| `u2c-evidence` — U2C 现场消费者审查 | 保留 2026-10-10 17/17、Runtime/app SHA、mount、cwd/fd、owner/mode、同设备 scratch 及其证据限制，见下节现场表。 | layout、handoff | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2c-production-runtime-consumer-audit-2026-10-09.md) · `4a15049ec3d154e8644ebd3a90b0d028ef7873bf` |
| `u2c-readiness` — U2C 就绪审查 | 原先未获证的各 gate 是该时点状态；随后 U2C 只补齐有限现场证据，没有可信 root installer/维护屏障或生产批准。 | handoff、现场表 | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2c-production-runtime-handoff-readiness-2026-10-09.md) · `a098868d57bff7f1864b01905a074acd279d7636` |
| `u2d-design` — U2D 原安装/恢复设计 | 保留独立 operator、双维 SHA、三份动态副本/inode 策略、外部消费者与原子交接约束；旧 inspect/prior-tree/manual-resume 恢复步骤已替代，不作为可执行 playbook。 | handoff | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d-trusted-runtime-installer-design-2026-10-09.md) · `8014f978738aa35d4c931cbc628ea6d3da2e0537` |
| `u2d1` — U2D-1 纯证据审阅 | review_handoff_intent/inspect_handoff_incident 只检 caller claims；old/new/previous slots、journal lag、distinct inode 等逻辑成功也永不授权。 | provenance、evidence-limits | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d1-inert-handoff-evidence-review-2026-10-10.md) · `a53f0010cd50abf25e34bf1970931ad3b6d3173e` |
| `u2d2` — U2D-2 权责审查 | 方案 A 一次性 root-private 开发与动态文件 logical-path/inode 可变策略曾获本地/隔离开发授权；不是生产 source execution、stop service 或部署授权。 | handoff | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2-installer-readiness-audit-2026-10-10.md) · `a8ed956232b4d98c6caed916c84df2579f1ceeef` |
| `u2d2a` — U2D-2A 受限内核 | 固定 /tmp/sanq-u2d2a-lab-*；完整三树、cross-parent exchange、no-clobber previous 与 journal，仅 lab 可用；archive callback 是 synthetic seam。 | handoff、evidence-limits | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2a-offline-operator-installer-2026-10-10.md) · `33dcda37bbb14cfcdb7a6b722f8a3a0804a257a1` |
| `u2d2b` — U2D-2B SIGKILL | 八个真实子进程 SIGKILL 窗口已在后继记录获 CI 结果；只杀 fixture 子进程，不证明内核/断电，父 fsync 前窗口不保证落盘。 | SIGKILL 表 | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2b-sigkill-recovery-readiness-2026-10-10.md) · `cb0603130d30b0a466ac21565ad330a30db2fbf1` |
| `u2d2b2` — 2B2 root/cold 审查 | Path.rglob/祖先替换、root/ubuntu、synthetic provenance、竞争与冷恢复问题；现有只读 FD helper 不自动修复 kernel 写路径。 | handoff、evidence-limits | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2b2-root-cold-recovery-readiness-audit-2026-10-10.md) · `e97339554ea90f5d99dc7fc43e13197fce957bdd` |
| `u2d2b2a` — 2B2-A FD inventory | 只读 direct-/tmp fixture，21 项有界 no-follow FD/metadata 盘点；不校验真实 Archive 来源，不排除 ABA、后续写者或全局竞争。 | evidence-limits | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2b2a-offline-fd-inventory-2026-10-10.md) · `8fd1b9953811196efbfdd1a41a247e452b67d4c0` |
| `u2d2b2b` — 2B2-B root lab | 保留真正 root/ubuntu、ext4、9 tests/三树/持久 summary 读回的有限 PASS 与原始 hash/path；未完成 cold/power-loss 或真实发布来源证明。 | root-lab-evidence | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2b2b-isolated-root-test-plan-2026-10-10.md) · `abde11d61e92b1a43f0a140d2be57924848e912d` |
| `u2d2b2c` — 2B2-C 退役断电计划 | helper 已移除，方案 NOT EXECUTED；保留独立归档 SHA、clone/快照和 /tmp 消失观察，不执行旧 poweroff/磁盘恢复指令。 | retired-cold-plan | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/c5-u2d2b2c-cold-powerloss-experiment-plan-2026-10-10.md) · `fa06f46b60c8a7ba088a1dbb0eab4c3f681b8118` |
| `ghcr-a` — GHCR A 成对发布 | 触发 main CI SHA、平台/digest/revision、两个镜像与 release-proof、latest seal/actor、bounded main discovery；当时本地状态不是当前生产状态。 | publication | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-a-release-discovery.md) · `4f06297b3122b555a53e305d37e29611f37bf67e` |
| `ghcr-c0` — C0 布局盘点 | 旧路径、backup/helper/MCP/Compose 风险与替代方案为切换前基线；inspect_layout 为只读信息，不授予切换/删除。 | layout | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c-runtime-layout-readiness.md) · `bc2c18cf22cf57a4041df34825fb2104e7140870` |
| `ghcr-c1` — C1 Bundle | 确定性同 SHA fixed members、外部来源和最后 seal 顺序；不包含配置/用户数据；原相对 uploads/checkout 假设由后续 source/cutover 替代。 | publication | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c1-runtime-bundle.md) · `52815962d05a980ddde312a36eddb51d000861d7` |
| `ghcr-c3` — C3-A 备份就绪 | 跨资源非原子、uploads非全历史、未装 source template 不证明主机 parity；固定DB/数据、离机恢复、停写增量与helper权限。 | layout、备份边界 | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c3-backup-readiness.md) · `9b53bdfa2539a842df93654751805527df084f72` |
| `ghcr-c3b` — C3-B 路径决策 | 方案B保持ubuntu身份/timer/retention，root helper固定参数/私有临时上传，marker/new-old匹配及共享本地目录残余风险；不是自动安装授权。 | 备份边界 | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c3b-backup-path-decision.md) · `2190216dba7223febac39986e063b38761bd4f98` |
| `ghcr-c4b` — C4-B 源码实施 | 固定Runtime/DB/uploads/project、explicit root operator、env UID/GID/mode、manifest/digest、readiness 与外部组件成组切换；早期 Git 比较门禁不当成现行恒定能力。 | layout、现行状态入口 | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c4b-runtime-path-implementation.md) · `1145fd7985d1a08a49e591988728407ab5d4ce66` |
| `ghcr-c5a` — C5-A 源码退役审查 | MCP、staging、deploy、旧 Manifest 自述来源与90天留存缺口；audit_source_retirement 永不授权删除，后续已选择GitHub main/full SHA读模型。 | 源码退役后继 | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5-source-retirement-readiness.md) · `e1d5c7bbd6feaac1e216b2df554bde474d0b4a1f` |
| `ghcr-c5b1` — C5-B1 Archive外部哈希 | same publish run 的最新 bot status 与 exact compressed bytes；不下载/保证 Artifact存在，不是签名或永久留存。 | publication、provenance | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5b1-runtime-artifact-trust.md) · `2f6f7cc7ae441e319346b5a5eaf56ac4ac36e4e0` |
| `ghcr-c5b2a` — C5-B2A 惰性暂存 | 独立来源替代 checkout 字节比较，只 stage 原始Archive与源树，不读取env/数据/激活；旧 deploy Git 叙述是当时基线。 | staging | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5b2a-runtime-staging.md) · `b7e2bcf135358b82e6dc85c139fae8da95b59ab1` |
| `ghcr-c5b2b0` — C5-B2B0 回退来源审查 | 单纯 previous image 无法证明匹配Runtime；handoff audit校验私有staging/外部Archive/成员，所有ready为false；不切生产权威。 | provenance | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5b2b-deploy-trust-readiness.md) · `006c05e31d044375b1a78d05f4b4495bf280ec95` |
| `ghcr-c5b2b1` — C5-B2B1 历史版本 | exact SHA main ancestor、最新双 seals/同 run、两镜像digest与原字节；pure transition绑定current/previous，仅非执行意图。 | provenance | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5b2b1-versioned-runtime-contract.md) · `8ff3320229effbde57c820e43b4eeaadca7a2e93` |
| `ghcr-c5b2b2` — C5-B2B2 安装计划 | plan_install仅校验拟议journal与proof形状、保留project/volume，pending/failed需人工处置；不写journal、不认领真实安装。 | provenance、handoff | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5b2b2-install-plan.md) · `abb844d4b4938ccd5299cf69188798edb283fdb8` |
| `ghcr-c5b2b3` — C5-B2B3 安装就绪 | 当时的外部常驻Launcher/签名/ledger方向后被用户取消；保留原子性vs持久性、真实历史回退和backup外部安装责任；不复活该路线。 | retirements、handoff | [原文](https://github.com/sanqin888/sanqinMVP/blob/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/postmod-ghcr-batch-c5b2b3-installer-readiness.md) · `020b02155fd9e2fe6225924af74b77ba5a1a67f8` |

## u2c-evidence

### 2026-10-10 生产主机点时证据

来源是当时 read-only MCP 状态与**操作员自行执行后提交的脱敏 SSH 输出**，不是本次整理重新执行的检查。早期 readiness 表中的 pending 随后只补齐了下列有限事项，生产安装始终 NO-GO。

| 项目 | 原始记录 | 证明范围 / 未证明事项 |
| --- | --- | --- |
| 03:06 UTC Compose | api/web/worker/db四容器healthy，应用SHA `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` | 点时健康，不是当前主机证明 |
| 文件系统/目录 | ext4 `/dev/nvme0n1p1`，st_dev `66305`；Runtime root 0:0/0755/inode290798 | 同设备与metadata，不是掉电持久性 |
| 动态文件 | env1000:1000/0600/inode284104；state0:0/0600/inode284106；marker0:0/0644/inode290926 | 原观察值；不反映当前inode或新授权 |
| Timer/service/MCP | timer active/waiting，下次2026-10-10 07:30UTC；backup inactive/dead PID0；tunnel active PID2388208 | 不能推断未来helper/非合作消费者不存在 |
| `/proc` | bash2700387及sudo2759535/2759536、python2759537仅有cwd | 观察者自身/操作shell需离开Runtime；单次无其他匹配不是排他或阻止新消费者 |
| 实际数据挂载 | API/worker source `/srv/sanq/uploads`；DB `sanq-app_pgdata`、Docker volume host目录 | 三容器挂载不指向Runtime；不证明其他消费者没有引用 |
| 03:43:10.618622UTC 完整性 | RESULT PASS，17/17 source/Manifest/bytes/owner/mode；Manifest source `a84b72007e6b4e82c981101e56c897355757c0ff`；env/state current为上述应用SHA，ACTIVE，previous为上述Runtime SHA | 完整性/状态一致性，不是独立重验原发布Archive；两种SHA不同是允许的 |
| 03:51:36.736277UTC scratch | 独立批准的 `/opt/sanq/.sanq-u2c-renameat2-*` 临时目录，exchange/reverse、inode/sentinel、同设备66305及精确cleanup均PASS | 同文件系统syscall支持；没有交换active Runtime，没做服务stop、冷故障、维护屏障或生产安装 |

当时 GitHub-backed `read_file` 对生成态 `runtime-release.json` 返回 repository 404，**不能据此判定主机安装文件不存在**。完整主机 inventory 后由操作员提供；当前MCP查询语义与主机事实仍需分开。

## SIGKILL 表

早期 U2D-2A exception 注入和后续子进程真实 SIGKILL 是不同证据。U2D-2B1 后继审查记录 PR #2782 / `d07ca95b22d65191c724dfddf412b848ca41d9f3` / CI run `38026488259` 7/7 绿；只证明CI Linux fixture观察和拒绝重跑，不证明root VM、kernel panic或掉电。

| 窗口 | fixture预期与限制 |
| --- | --- |
| before_journal | old active，候选/preimage已形成，无journal也不能盲目重试 |
| pending_journal_before_parent_fsync | PENDING已rename，父目录未fsync；不保证断电后存在 |
| after_journal | old active，PENDING已同步 |
| after_exchange_before_parent_fsync | new active/old candidate可见；两parent未fsync，不保证断电namespace |
| after_exchange | new active/old candidate，journal可落后 |
| after_exchange_journal | EXCHANGED_UNCONFIRMED |
| after_retained | new active/old previous，journal可能仍落后 |
| after_final_journal | PREVIOUS_RETAINED |

每项只 SIGKILL fixture 子进程，检查 `-SIGKILL`、完整preimage/17+Manifest+3dynamic、previous应用SHA不变、只读incident分类及占用目录拒绝再次执行。子进程锁释放不等于事故已关闭。正常TemporaryDirectory测试清理不授权生产清理。

## root-lab-evidence

### 2B2-B 2026-10-10：独立 VM 的有限关闭

| 来源 | 保留身份/结果 | 边界 |
| --- | --- | --- |
| 测试源基线 | PR#2783 `956549d3175dee2681f22475e9d3f322885a0ace`；dev CI `38052072638` 7/7 | 精确源码pin，非生产权限 |
| 操作员VM | Intel/Catalina MacBook、VirtualBox、Ubuntu24.04.5 x86_64、Linux6.8.0-146、Python3.12.3、guest-only25GB VDI、`/dev/sda2 ext4`，snapshot `SanQ-Clean-Baseline` | root0:0与ubuntu1000:1000真实分离；无生产数据/secret/mount，不证明当前还可用 |
| 第一次root metadata | `/tmp/sanq-u2d2b-tbhu1h4i` 0:0/0700、dev2050；env/state/marker inode1048595/1048596/1048597、0600/0600/0644 | OWNER/MODE/DEVICE 点时PASS |
| sentinel probe | 保留 `.sanq-u2d2b-xchg-j0ck_0e9`；cross-parent-FD exchange/reverse、synthetic动态bytes/UID/GID/mode、inode映射、原fixture不变PASS | 不是完整17项/Archive来源、SIGKILL、冷恢复或写路径防竞态 |
| root-private源码 | `/root/sanq-u2d2b-pin-956549d3`，各目录root0700、脚本root0600，与固定git show逐项pin；曾纠正目录mode差异 | 不从ubuntu可写checkout以root执行 |
| 原模块root测试 | `test_offline_root_private_installer.py` 9 tests / 6.076s / OK | synthetic Archive callback；TemporaryDirectory已清理这些用例，不是后续三树证据 |
| 独立proof脚本 | `sanq-u2d2b-root-full-transaction-proof.py`，SHA256 `64ff3ba1ac69e2f20437c9d2bb797440440533a69f1a373212e486705b0b8030` | 当时独立查看源码/hash后由操作员执行；未作为本次新可执行资产交付 |
| 完整fixture | `/tmp/sanq-u2d2a-lab-8x1jy0gd`、`evidence.json`；active/preimage/previous每树21项（17source+Manifest+3dynamic），共63项；inode独立、source执行位、journal/retention、占用lab重跑拒绝PASS | 合成来源lab内核，不是实际Archive外部认证或全主机排他 |
| 持久summary读回 | root目录0700 inode1048615，evidence0600 inode1048703；active1048650/preimage1048676/previous1048622，dev2050 | 后续stat/cat只证明这些路径metadata和summary存在；不是重启/flush后的63项逐文件hash再验 |

summary原字段：`status=ISOLATED_ROOT_FULL_TRANSACTION_PASS`，`sourceCommit=956549d3175dee2681f22475e9d3f322885a0ace`，`sourceMembers=17`，`perTreeVerifiedMembers=21`，`preservedMembers=3`，`verifiedSlots=[active,preimage,previous]`，`journalPhase=PREVIOUS_RETAINED`，`incidentObserved=previous_retained`，`dynamicBytesUidGidModePreserved=true`，`crossTreeInodesDistinct=true`，`oldRuntimeExecutableModeRetained=true`，`automaticRecovery=false`，`productionActivationAuthorized=false`，`syntheticArchiveVerifierOnly=true`，`powerLossRecoveryVerified=false`。

结论严格为 **2B2-B OPERATOR-EVIDENCED ISOLATED ROOT LAB VERIFIED/CLOSED / RETAINED SUMMARY READBACK PASS**。不覆盖FD helper与kernel全部写操作集成、非合作竞争、真实发布来源、2B2-C冷断电或生产安装。保留VM snapshot、root-private源码和lab证据；不从这份索引执行旧root命令或删除/恢复资产。

## retired-cold-plan

2B2-C 的 prepare/hold/FAULT_READY、三检查点 poweroff/VDI 取证方案从未执行，`c2_cold_powerloss_probe.py` 后已移除。这里只保留准备期资产、关键取证限制和 **NOT EXECUTED / POWER LOSS NOT VERIFIED**；不把旧步骤当成现行验收任务或命令清单。

- 原 VM `SanQ-Linux-Test` 及 `SanQ-Clean-Baseline` / `SanQ-2B2B-Verified`；另建全克隆 `SanQ-Cold-Recovery-Test`、guest `sanq-cold-recovery-test`，loopback NAT 2223，`/dev/sda2 ext4`、独立VDI。原记录 medium UUID `e163a4fc-f4f4-47fd-8263-8a0c1723ac12`，`Parent UUID: base`，主机路径 `/Users/apple/VirtualBox VMs/SanQ-Cold-Recovery-Test/SanQ-Cold-Recovery-Test.vdi`；不推断该盘现在是snapshot后当前attached子盘。
- 原证据归档 `SanQ-2B2B-lab-evidence-20261010.tar.gz` 在Mac和guest核对 SHA256：`78023e504b1fcd423303d808306f2bd21307c5040a41e8eb6f39852c0de10986`。六项关键成员包括三Runtime树与旧lab；guest保留 `/var/lib/sanq-c5-u2d2c/verified-baseline.tar.gz`（目录0700、文件0600），Mac另有离机副本；当时执行sync及hash检查不证明以后掉电结果。
- 干净停机下建立 `SanQ-C2-PreFault-Baseline`。普通clone启动后两处旧root `/tmp` lab已不见；即使/tmp为ext4且tmpfiles timer活跃，具体原因仍未证明。后来启动不能替代故障前磁盘证据。
- 旧设计要求全powered-off差分VDI链独立捕获，**先于boot**；取证副本不作为启动盘，read-only且禁journal replay（`ro,noload,nodev,nosuid,noexec`），额外复本才用于cold boot。先boot再capture或证据盘写入应判该次证据INVALID，不伪造PASS；旧plan未执行，因此这些只是历史取证设计条件。
- 正控制 `after_journal`、未fsync交换窗口 `after_exchange_before_parent_fsync` 和保留旧树后的 `after_retained` 是旧最小拟议矩阵，未形成实验结果。SIGKILL不会杀kernel/pagecache，不能替代该掉电证据。
- 退役该默认计划不是取消原始证据保留，也不授权Host poweroff、snapshot restore、VDI合并/删除或恢复生产。当前改走外部Kit/新独立事务的已批准方向；其真实端到端恢复仍按G2门禁办理。

## 源码退役后继与证据保留

旧 C5-A/B2B 文档中“controller仍需Git/尚无安装”的语句只描述当时基线。后继来源是 [2026-10-08应用发布收口](./postmod-ghcr-deploy-simplification-2026-10-08.md)、[第二阶段源码退役依赖审查](./postmod-ghcr-source-retirement-phase2-2026-10-08.md) 和 [GHCR/Runtime状态](../runbooks/GHCR发布与Runtime状态.md)。已记录的image-only前进及后续controller修复未自动证明新Runtime已安装、历史digest回退闭环或checkout可删除。

原始 [G2 evidence目录](https://github.com/sanqin888/sanqinMVP/tree/94bc7be6e6e7e40157af1fae42c79a488e7a85b8/docs/architecture/evidence) 的JSON、G2 H-01–H-08/B4B文档、C4-P2-A/P2-C/P2-D手册、全部历史工作日志和操作员离机资产保持各自身份/字节/限定范围。本次只删除已承接的27份旧篇，不删除代码、测试、收据或主机文件。
