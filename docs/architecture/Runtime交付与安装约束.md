# Runtime 交付与安装约束

> **2026-10-26 适用范围与当前优先级：**当前工作以[最小更新执行器与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)为准，先打通应用发布与平台工具维护分离的最小流程。C1 来源/受保护加载、自建 CPython 3.12.15 及完整依赖证明、R2 离机身份/CAS/PKI/可信时间/跨克隆工作 **暂停、不取消**，正常代码更新恢复后复审继续；本页相关高保证安装接线按原路线保留，暂不作为最小执行器整套前置。现役 17+Manifest、来源/权限/数据保护 guard 继续有效，未来须经过受审阅的一次性过渡，不能手改文件/Manifest 绕过；本批不改 installer 或生产权限。

> **2026-10-22 取证规则更新（本地待审）：**Runtime 交付、安装、恢复、生产验收不再要求第三方见证人员、外部署名/PDF/邮件或见证底稿；以 [R0 §4.1](Runtime更新-R0冻结设计.md) 的 SanQ 内部授权、发布完整性、维护状态、快照/数据恢复及必要技术复核为准。历史记录保留，现有程序安全 guard 不自动解除。

本次已批准补充以 [AWS 快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 为准：正常更新来源/平台保持验证；更新前冻结并生成准确 AWS 手动快照，失败保持维护并走新实例恢复；不重复强制旧 preinstall Kit/故障主机自举。

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。

本文承接已整合的 GHCR A/C0–C5-B2B3、U1/U2A–U2D-2B2-C 中仍有效的规则。整理基线为 `origin/dev@94bc7be6`（2026-10-17），只调整文档归属，不改变代码、模块职责、发布权限或既有验收门禁。

当前进度和生产安装的具体门禁仍以 [G2 合同](./c5-g2-trusted-runtime-contract-2026-10-13.md)、[旧 Recovery Kit 替代关系](./c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md) 和 [S1 边界](./c5-u2d-s1-protected-config-snapshot-2026-10-11.md) 为所有者文档。旧设计、实验与替代关系见 [历史决策与证据索引](./Runtime历史决策与证据索引.md)。本文没有重新验证生产主机；已安装版本与源码能力分开查阅 [GHCR 发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)。

## publication

### 1. 成对镜像、原始 Archive 与发布顺序

- API/Web 使用成功的 `main` push CI 所验证的完整 40 位 SHA；Uber worker 使用同一 API 镜像。`workflow_run` 工作流自身的 `GITHUB_SHA` 不能替代触发 CI 的 `head_sha`。检查 SHA 镜像的实际 registry digest、`linux/amd64` 平台及可获得的 revision label，不以可变标签或仅 Git 最新提交选择版本。
- [publish-images](../../.github/workflows/publish-images.yml) 先等待两个镜像发布、复核 digest 并上传 `sanq-release-proof`；再从同一已验证 checkout SHA 构建、回读校验 Runtime Archive，上传 `sanq-runtime-<SHA>`，发布独立 `sanq/runtime-archive-sha256`，最后发布 `sanq/paired-images-published`。任一必要构建、证明、上传或 seal 失败都阻止最终成功 seal；已存在镜像不等于发布链完整。
- 配对 seal 由 `github-actions[bot]` 在精确 source SHA 上产生，target URL 绑定本仓库成功的 `publish-images` run；描述携带 `a:<64hex> w:<64hex>` 两个 digest。缺少 digest 的早期 seal 不可自动当成可部署候选。Runtime seal 独立记录**原始压缩字节**的 `sha256:<64 lowercase hex>`，须与 Manifest、同一 publish run 和配对镜像一致。
- 同一 context 最新状态优先；旧 success 不覆盖较新的 failed/pending。GitHub status 是仓库写权限和可信 workflow 边界下的来源证明，不是独立数字签名，也不保证 GHCR 标签永不变化。实际使用时仍须复核 digest，不重新压缩 Archive 后伪装为原发布物。
- [release_contract.discover_release](../../ops/release/release_contract.py) 的普通发现路径最多扫描 20 个 main 历史提交，选择最新满足既有条件的发布；未找到、API 失败、伪造 actor/URL 或不完整证明均拒绝，不回退到 `latest/main` 标签。发现本身不拉镜像、不改环境、不重启服务。
- Runtime 和 release-proof Actions artifact 保留 **90 天**。持有哈希、commit status 或对象名不等于持有可恢复的原始 Archive；原字节、证明与密钥的离机保留及取回必须独立验证。

### 2. 精确 Bundle 与来源校验

[build_bundle.SOURCE_FILES](../../ops/runtime/build_bundle.py) 当前固定为下列 **17 项**；打包额外生成 `runtime-release.json`，它不计入 17 项。本文不授权扩充白名单。

- `docker-compose.yml`
- `ops/backup/backup-db.sh`
- `ops/backup/sanq-backup-protected-nginx`
- `ops/backup/sanq-backup.service`
- `ops/backup/sanq-backup.sudoers`
- `ops/release/deploy_release.py`
- `ops/release/release_contract.py`
- `ops/runtime/build_bundle.py`
- `ops/runtime/audit_compose_cutover.py`
- `ops/runtime/audit_release_provenance.py`
- `ops/runtime/inspect_layout.py`
- `ops/runtime/stage_bundle.py`
- `ops/runtime/runtime_trust.py`
- `ops/runtime/versioned_release_contract.py`
- `ops/runtime/plan_versioned_install.py`
- `ops/runtime/runtime-layout.v1.json`
- `ops/verify-runtime-readiness.sh`

- 同一 source SHA 的 Manifest 绑定 main 分支、CI/publish run ID、API/Web refs/digests、每项 SHA256/size，要求 `productionActivationAuthorized=false`。builder 核对 checkout HEAD 等于 proof source SHA，采用显式成员、确定性打包、大小与类型限制；目前单项上限 2 MiB、Archive 上限 12 MiB。不得通用不受控解压或接纳 symlink/hardlink/special/额外成员。
- Archive 不携带 `.env`、应用 release-state、C4 marker、Uploads、备份、数据库、TLS/rclone 凭据、Git metadata、Node 依赖或主机私有配置。敏感状态按下文动态状态合同处理，不加入发布物。
- 内嵌 Manifest 的自述哈希只证明自洽，不能独立认证重打包的文件。必须另验原始压缩字节、发布 run、seal actor/context、精确 main SHA 与两个镜像 digest；不修改 Manifest、放宽校验或伪造 status 来消除来源缺口。

## provenance

### 3. 最新发布与历史版本校验分开

| 用途 | 已有实现 | 仍须满足的边界 |
| --- | --- | --- |
| 普通最新发布 | [runtime_trust.verify_runtime_publication](../../ops/runtime/runtime_trust.py) | 既有 newest published paired-release 策略；不能擅自改用任意旧 SHA |
| 早期 B2B1 精确历史发布证明 | [versioned_release_contract.verify_historical_release](../../ops/runtime/versioned_release_contract.py) | exact SHA 的 main ancestry、同一 run 的最新配对/Archive seals、实际原始 Archive 与镜像 digest；返回只读证明，不恢复已过期字节 |
| 原 G2 历史 Archive 辅助证明（云恢复非强制前置） | [historical_runtime_publication](../../ops/runtime/historical_runtime_publication.py) 与 [G2 §2](./c5-g2-trusted-runtime-contract-2026-10-13.md) | exact approved SHA、原字节、匹配的成功 main push CI/publish 身份和最新 seals；不得以较弱旧检查或改选最新版本来让失败项 PASS |

早期 pure `version_transition_contract` 检查 deploy 的 settled current/严格后继关系，rollback 仅绑定已记录 previous 及其历史证明；拒绝相同版本、缺失 digest、未知状态和历史分叉。`plan_install` 仅检查这些调用方输入和拟议 journal，阻止未处置的 pending/failed，不写 journal、不授予 install/deploy/rollback 权限。**这些是惰性模型的行为，不能套用成现役应用控制器或 G2 恢复入口的权限。**

## staging

### 4. 暂存和准备不激活

- [stage_bundle](../../ops/runtime/stage_bundle.py) 对有界、regular/no-follow 原字节做外部来源校验，核对完整 Bundle/layout/Manifest；普通 plan 无主机写入。明确授权的 inert stage 只在预先存在、调用者拥有、无 symlink、无 group/world 写权限的私有父目录创建全新 SHA 目录，拒绝覆写；保留 exact authenticated Archive（0600），回读成员与 Manifest。
- C5-B2A 已替代 C2 staging 的本地 main checkout 字节比较；不据此推断所有 deploy、rollback、MCP 或系统服务均已脱离 checkout。原 staging/prepare 的 newest 策略、历史 verifier 和安装授权互不替代。
- [prepare_runtime_update](../../ops/runtime/prepare_runtime_update.py) 在任何输出前独立验证发布，创建 0700 私有新树和完整原始 Archive；不在 active Runtime 内准备，不改变现役状态，失败残留需隔离留证。用户可写 staging 不能原地升权后执行，root 侧须对复制的原字节重新独立核验。
- 暂存/准备不执行 Docker、sudo、服务、数据库迁移或切换；`readyToInstall` 及生产授权保持 false。它们没有“暂存成功即生产可运行”的含义。

## layout

### 5. 固定布局、配置身份与外部消费者

| 对象 | 保留的身份/路径与权限 |
| --- | --- |
| 活跃 Runtime | `/opt/sanq/runtime`，真实 root-owned 目录，不用 symlink；可信祖先无 group/world 写权限 |
| Compose / DB | project `sanq-app`，原 `sanq-app_pgdata`；不新建、重置、重映射或静默替换 |
| API/worker Uploads | 共同 bind `/srv/sanq/uploads:/app/uploads`，保留所有业务数据 |
| 本地备份 | `/srv/sanq/backups`，预先受控配置的 ubuntu 私有 0700；不由新主脚本临时 mkdir 空源 |
| 公共 sounds | `/home/ubuntu/sanq-assets/sounds`，不随 Runtime 整理移动 |
| 动态 `.env` | ubuntu:ubuntu 0600，恰一完整 `SANQ_IMAGE_SHA`，不打印内容 |
| 应用状态 | root:root 0600 的 `.sanq-release-state.json`；current/previous 不等于 Runtime 旧/新 source SHA |
| C4 marker | root-owned `.sanq-backup-layout-activated`，原受限 mode、内容 `SANQ_BACKUP_LAYOUT_C4_V1`；恢复/安装不自行重新签发激活权限 |
| 独立安装副本 | `/home/ubuntu/backup-db.sh`、systemd unit/timer、受保护 Nginx helper/sudoers；Bundle 更新不等于这些副本同步安装 |

Runtime source SHA 可以不同于应用 current image SHA。更新 Manifest/源文件不能偷改 `SANQ_IMAGE_SHA` 或 current/previous 以伪装发布；普通 image-only 前进仍受已安装 Runtime 的来源、祖先关系、成员无变化和现役控制器条件约束（既有 verify_runtime_release 的祖先比较界限为 250 个提交，不因本次整合放宽）。新 Runtime 服务旧应用的向后兼容，以及外部备份脚本/helper/service 兼容性必须单独证明；若依赖新环境键、镜像、DB 或外部安装件，应停止 Runtime-only 路径并另审成组发布方案。

### 6. 备份边界与既有切换约束

- 备份 owner 保持 `User=ubuntu` oneshot（`UMask=0077`），`ExecStart=/home/ubuntu/backup-db.sh`，日志以 journal 为准；原 timer、remotes、留存、Messaging/DB/Uploads/Nginx 职责不顺带改变。
- 现役项目配置归档仍只含 `.env` 和 Compose；S1 的五文件 snapshot 是独立库契约，不是已上线 daily 扩充。**S2 暂缓指后续扩充/接线工作，不表示已观测到生产 backup.timer 被停用。** 权限仍是 root state 0600，不能为 ubuntu 放宽。
- protected Nginx helper 只接受固定日期文件名与固定 TLS/输出/远端范围，不扩 sudoers，不接纳任意环境路径；保护 rclone 临时配置。原 C3-B 设计从 root 私有临时区创建/上传，再原子放入本地共享备份目录；ubuntu 可删除其拥有目录中的本地条目，因此离机加密副本和真实恢复证据不可省略。
- 匹配部署 backup 主脚本/helper/unit/sudoers，核对真实 owner/ACL/祖先、激活 marker 和实际安装副本；禁止混用新旧目录。保留旧实现和 rollback 资产；timer 停用不等于已运行 service/helper 退出。
- Uploads 镜像不是永久全历史，出现后在同步前删除的文件可能没有被捕获；整项备份不是跨资源原子快照。旧布局切换涉及 staged 全量与停写后增量、数量/类型/大小/元数据/校验和对账、API/worker 共同挂载、DB volume 不变以及切后恢复验证；不能从空新源 sync 到权威 uploads-current。
- C4 路径切换的实际范围及有限恢复证据继续见 [P2-C](../runbooks/runtime-backup-cutover-c4-prep.zh-CN.md)、[P2-D](../runbooks/runtime-backup-cutover-c4p2d-acceptance.zh-CN.md) 和 [备份手册](../runbooks/backup-recovery.zh-CN.md)。源码模板或曾完成的旧恢复演练不证明新布局/新版本当前可恢复。

## handoff

### 7. Runtime 安装的既有隔离与事务约束

- 独立一次性 root-private operator 的开发授权不等于生产执行授权；不得恢复永久 Root Launcher、任意 MCP shell/sudo、开放任意路径/URL/命令输入，或把 installer 作为 Bundle 第 18 项。现役应用 deploy/rollback 与 Runtime 安装属于不同职责和审批；正常更新不自动改镜像、应用状态、DB/Uploads；准确容器/服务停启与 restart policy 属已批准维护设计，实际操作仍另行授权。
- 正常更新操作员源码、实际解释器、传递 Python/native/ELF 依赖与执行字节按当前 G2/B4B 要求独立认证；仅服务于旧故障机自举的 Bootstrap/依赖重建不再是云恢复门禁。源码回读、一个声明式闭包、相同内容或 caller `authorized=true` 都不能替代独立见证或防止验证后重新打开/被改写。
- `.env`、state、marker 来自维护屏障冻结后的现役状态，按已批准的 logical-path 策略独立复制并保留 bytes/UID/GID/mode；允许 active-path inode 更换，不用 hardlink/symlink、不共享旧新 inode。验证 current/env/running image 一致、状态 settled，并保留 previous；不用历史旧配置覆盖更新后的密钥或状态。
- 候选、完整独立 preimage、原始 Archive、journal、lock、operator 源码与证据位于 active Runtime 外，版本/txid 不可覆盖。旧 `/opt/sanq/releases/<sha>` 等只是历史拟议命名，不是现在已部署的通用版本目录或可任意创建路径。
- 已有实验采用可信目录 FD、no-follow 相对遍历、regular/single-link/owner/mode/size/device/entry 重验。重复 pathname stat、源内自述 hash、跨设备或可替换祖先不能作为真实信任锚；read-only FD helper 仍不等于完整写路径防竞态或 ABA/new-consumer 排除。
- 正常交接须先完成全部可信候选、preimage、三份动态副本及证据的文件/目录 fsync，再持久化 PENDING；使用单次受支持的 `renameat2(RENAME_EXCHANGE)`，正确处理两个 parent FD、同步两父目录、复验完整文件集，并以不可覆盖的旧版保留槽保存历史。两个普通 rename、单文件原子 replace、syscall 原子可见都不能直接证明整个事务的断电持久性。
- 应用 release-state 与实验 journal 不能混用。旧实验阶段 `PENDING_EXCHANGE`、`EXCHANGED_UNCONFIRMED`、`PREVIOUS_RETAINED`、`VERIFIED_RETAINED` 只说明当时模型；观察必须核对磁盘文件、inode/slots 与证据，不能只信 phase。当前恢复遵循下节，不能用旧阶段自动续跑/回滚。

### 8. 持续维护、AWS 快照与故障处置

- 详细状态/矩阵见 [AWS 快照方案](Runtime更新-AWS快照与维护冻结方案.md)。先保留管理通道，记录准确容器原 restart policy、units/task 原 enabled-active 与挂载身份并离机保存；设实际 policy=no、正常停止业务/DB 至一致点，禁止 systemd/cron/Compose/deploy/MCP/SSH 等重新启动或写入。不得修改受 Manifest 校验的 Compose 文件；重建容器可能恢复 always，必须禁入/观察。
- flock/一次 stop/空扫描不足；持续屏障覆盖 service/helper/后代、cwd/FD/mmap/别名、namespace、新消费者与真实启动入口。停用状态进入快照且跨 Docker/VM 重启及恢复首启有效，不能以未绑定 Static IP 或公网 firewall 当全部副作用隔离。
- 受限代码调用 Lightsail CreateInstanceSnapshot 创建本次唯一手动快照，等待 GetInstanceSnapshot 的准确对象 available，核对来源账户/Region/实例 ARN、txid/时间/覆盖盘和一致性，离机恢复清单完整后才开始 Runtime 活跃写。超时未知先查准确对象，错误/碰撞/无覆盖拒绝安装，不选 latest。
- 正常安装保持上一节 FD/候选/动态状态/原子持久化约束；快照之后到最后放行业务持续停写。受控健康启动仍须入口/后台副作用屏障；成功独立复验后恢复记录中的原 policy/任务状态，最后开放业务，不一律 enable/start。
- 安装中断/写入未知或验证失败：ABORT 旧事务、保持维护并留证。人工确认准确快照→独立新 AWS 实例；先 fence 原机，验证新实例首启 no/任务禁用、Runtime/应用/DB/Uploads/权限/机器身份/外部资源，完成外部支付订单权威对账后受控恢复/切流。整盘恢复包含业务数据，不能谎称只恢复 Runtime；不续旧 journal、不在受损机自举 clean reinstall。
- 日常备份/凭据 escrow 保留；原 mandatory crypt/Drive preinstall Kit、双 Archive 解密取回不再重复作为本次更新前置。目标新 Runtime 发布/Archive 来源不省略。
- 若快照后发生意外写入、外部 UNKNOWN 或重新营业后故障，不能直接回退整盘丢弃新订单，转独立 DR/向前修复/事件保留回放与对账。无条件 finally 恢复业务或删旧快照/事故对象均禁止；普通正常重启不是强制恢复触发条件。

## evidence-limits

### 9. 实验边界与文档交付

| 已有组件/证据 | 不能据此声明 |
| --- | --- |
| U1、B2B1 transition、install planner、U2D-1 caller claims | 外部证明、主机已检查、锁已取得或生产权限 |
| 非 root `/tmp/sanq-u2b-offline-*` harness | 可 sudo 成为生产 updater；原 guard 永久保留 |
| `/tmp/sanq-u2d2a-lab-*` kernel、FD inventory、exception/SIGKILL tests | 已保护生产写路径、非合作进程隔离、内核崩溃/断电持久性；guard 不能为文档整合而放宽 |
| 2026-10-10 生产文件 17/17 与 scratch syscall PASS | 已独立再认证原 Archive、当前维护窗口安全或真实 active Runtime 已切换 |
| 2B2-B 独立 VM root/ubuntu 九项测试及三树 summary | 全部 63 项 reboot 后重验、外部 Archive 真实来源或生产完整验收 |
| 已退役的 2B2-C 断电方案 | 已执行或已验证掉电；旧 Mac/VM/证据获准销毁 |

所有原始 JSON、Mac/VirtualBox 资产和历史工作日志继续保留。本次没有运行实验、CI、本地 lint/build/test、主机命令或数据库操作。变更停在 MCP 本地审阅；远端交付、CI、合并和生产执行继续分别遵守 AGENTS 与当前所有者合同。
