# Runtime 最小执行器工具交付与安装合同

## D1 惰性材料与只读核验（2026-10-27，本地待审）

**2026-10-27 当前进度：D1_MATERIALS_LOCAL / TESTS_NOT_RUN / HOST_INSTALL_NOT_IMPLEMENTED / NOT_INSTALLED。**新增独立交付工具ops/release/install_minimal_executor.py，仅pack/verify/plan。复用原17归档封存、准确main/CI/发布及固定Git对象，惰性材料含原归档、17+9+bootstrap共27份源码和三固定模板；重新核验来源后只输出材料/差异观察，所有安装/执行权限标志false。

交付合同已由[PR #3007](https://github.com/sanqin888/sanqinMVP/pull/3007) 最终head `5a703b4b4a309731f68a913ef42a271049eadd85` 经 [CI #7700](https://github.com/sanqin888/sanqinMVP/actions/runs/40562348239) SUCCESS（仅ci-change-scope成功，其余9作业按文档范围跳过；无Release/Runtime测试重跑），无CI修复，合并dev `43d270d0e6d290a95eaa2732918edcbec040c906`。文档合并不代表installer或生产验证完成。

D1由独立审阅的bootstrap运行，不import/exec材料包内Python。先核同准确S的最新main CI/成对seal及历史归档独立摘要/同publish，再另核Manifest原ciRunId的准确main/push成功；原CI与后续成功重跑ID分别报告。完整commit/tree/blob逐路径核27份普通文件及SHA1 Git对象/大小/SHA256，拒绝截断树、错对象和缺件；原17字节还须与已封存归档一致。源码获取后重新读来源，变化阻断。三drop-in采用固定文本，并以AST核已验guard常量语法，不求值或加载目标代码。

传输kit固定32个普通文件成员（原归档1、源码27、模板3、delivery.json 1），规范清单仅作清点，不能自证来源。拒绝多缺/重复/链接/路径绕行/PAX或sparse等非预期成员、坏JSON及篡改；压缩20MiB、展开总量48MiB，单源码2MiB/原归档12MiB/清单64KiB上限。verify重新从可信GitHub核全部字节，不采信包内hash。pack只由非root CLI向安全的操作者目录create-only写0600材料，拒绝生产/系统路径；同步或读回未知保留实物，不覆盖/重试。verify/plan只读材料/来源，无生产目录/状态/units变更。

plan只比较提供的旧/新已验Runtime归档，要求准确主线方向；首次仅两个部署源差异在已定范围，其余列NEEDS_PLATFORM_REVIEW。它不读取现役VM或宣称旧归档等于已安装字节，installedBaselineObserved=false、requiresHostRecheck=true，Manifest摘要明确是规范JSON摘要；readyToInstall/canExecute/authorizedToMutateProduction始终false。不能将计划作为后续安装票据。

未安装源码接口：pack --source-sha S --runtime-archive <原归档> --output <新材料文件>；verify --source-sha S --kit <材料文件>；plan --source-sha S --kit <材料文件> --current-source-sha <旧Runtime来源> --current-runtime-archive <旧原归档>。它们仅准备或审阅操作者材料，不提供host apply；实际生产S/归档尚未选定，不能据此在现役VM复制单个源码运行。

新增30项离线模型测试，覆盖确定性材料/17+9+bootstrap与三模板、实际checkout清单/guard语法一致、原CI与最新CI、封存晚期漂移、错/重包归档、严格Manifest整数/重复键、Git树/普通文件/完整blob/350个无关文件、模板变化、自洽篡改kit无效、多缺/重复/路径/链接与预算、差异范围/工具降级拒绝、0600/create-only/链接/不安全父目录/生产路径/同步未知，以及CLI只路由材料、拒绝root pack和install/apply/execute、错误脱敏。GitHub/CI为替身，临时文件实物；未访问实际网络/容器/DB/管理器。仅Python3.10 AST、静态名字/重复方法/空白/guard常量语法与差异读回核对，项目测试未运行，不把前批544或CI #7700作为本批测试结果。

独立交付工具归Runtime/Ops材料清点与只读核验，依赖已审阅build_bundle/versioned_release_contract/release_contract，不导入九辅助件，不由task导入或自更新。未修改既有执行主体、Bundle/schema/CI/publish/权限，无12上下文owner/SCC/债务/scanner基线变化，未重跑scanner。

D1本地源码尚未远端交付；D2主机安装、独立bootstrap root落地/临时门禁/恢复材料/逐文件交接、D3 Mac薄入口、D4统一真实隔离验收及生产材料仍OPEN。当前打包器来自操作者独立审阅的bootstrap，材料包不能认证正在运行的验证器自身；后续root阶段必须重新验真，不能提权运行用户staging。17+Manifest、250/300旧guard、九常规helper/三永久drop-in数量保持，无新依赖/业务schema/迁移或生产操作，三组研究继续暂停、不取消。

## 原交付合同审计记录

以下为原合同审计时点；D1当前进展以上文为准，主机安装阶段尚未实现。

日期：2026-10-27。审计基线：dev `d1768dbd5af4375467d6e998dd7e031665b6f306`。

**CONTRACT_MERGED_DEV / SOURCE_AUDITED / INSTALLER_NOT_IMPLEMENTED / NOT_INSTALLED。**

本合同完成第三批开始前的文件边界和过渡顺序核对，供后续 pack/verify/plan 与有限 installer 实现使用；本文描述的安装阶段、目录、临时门禁和材料格式均尚未实现或执行。本次没有读取生产主机现状，没有选定生产目标 main SHA、归档摘要或快照 ID。生产动作仍需按准确材料另行授权。

普通应用发布、工具安装分开进行。日常发布继续以计划与确认的 1–2 次操作为目标；以下一次性平台过渡不会被塞进每次应用更新。C1 来源/输入固定/受保护加载研究、自建 CPython 3.12.15 完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆防护继续暂停、不取消。

## 1. 已核实的代码事实

| 证据 | 核实结果 | 交付含义 |
| --- | --- | --- |
| [build_bundle.py](../../ops/runtime/build_bundle.py) 的 SOURCE_FILES、manifest_for_proof、verify_bundle_bytes | Bundle 固定 17 个源码成员加 runtime-release.json；manifest 内 sourceSha、两镜像与 CI/publish 绑定 | 不加第 18 成员，不把辅助件伪装成旧 Manifest 成员 |
| [publish-images.yml](../../.github/workflows/publish-images.yml) | 准确 main CI head 构建镜像及原 Runtime 归档，上传后封存归档 SHA256，再发布成对 seal | dev CI 通过不是可安装来源；原归档必须保持原字节 |
| [runtime_trust.py](../../ops/runtime/runtime_trust.py)、[versioned_release_contract.py](../../ops/runtime/versioned_release_contract.py) | 前者公共 verify 当前绑定最新发布，后者有历史 exact 版本校验 | 已审阅目标被更新的 latest 超越时不得换包；准确历史验证须复用已有规则 |
| [stage_bundle.py](../../ops/runtime/stage_bundle.py) | plan/stage 只做惰性 staging，不切换现役树、不安装外部 units | staging 成功不能宣称已安装或取得生产写入许可 |
| [plan_versioned_install.py](../../ops/runtime/plan_versioned_install.py) | 返回非执行提案，含 /opt/sanq/releases 的旧提议 | 不能把旧提案当现成 installer；本项目保持真实 /opt/sanq/runtime，禁止改为 symlink |
| [deploy_release.py](../../ops/release/deploy_release.py) 的 runtime_manifest、ensure_repo_location | 全验 root-owned 17+Manifest；Runtime 来源与当前应用 SHA 独立 | 安装工具不改当前应用 SHA/.env/state；至少 controller 与 release_contract 的受保护源变更必须走正式归档过渡 |
| [protected_config_snapshot.py](../../ops/backup/protected_config_snapshot.py) | 固定 RUNTIME_SOURCE_MEMBERS 为原 17；配置材料不是九辅助件和 systemd 外部文件的完整恢复包 | 一次性安装必须另外保存辅助件/三 drop-in/状态目录实物和“原先不存在”事实，不改其固定清单来假报全量恢复 |
| [deployment_plan_store.py](../../ops/release/deployment_plan_store.py)、[release_job.py](../../ops/release/release_job.py) | 运行时不 mkdir/chown；私有目录 root:0700、记录/锁 0600，锁 inode 不主动删除 | 目录由 installer 显式建立/核对；既有状态和锁不得重置 |
| [maintenance_guard.py](../../ops/release/maintenance_guard.py) 的 DROPINS、check_startup、_installed_gate | 三份准确永久门禁；启动检查遇任意维护目录残留拒绝；正式 gate 校验已加载属性及 live-restore/swarm | 安装过程不能假定尚未齐备的工具已经提供完整门禁；临时拒绝门禁须先独立生效 |

以上为准确源码静态核对。现场系统 Python、Docker/Compose/systemd 版本、现役 17 差异、override、真实挂载与服务状态仍须在隔离验收和生产预检时实测。

## 2. 固定交付集合

### 2.1 原 Runtime 归档：17+Manifest

保持原 build_bundle.SOURCE_FILES 全集和 runtime-release.json 字段合同。以一个已经 main CI、成对镜像发布及归档封存成功的准确 SHA **S** 为目标，保留原归档原字节、归档独立 SHA256、CI/publish run 和全部来源响应。

首次最小工具过渡按“工具变更”审阅：允许的受保护执行源变更先限于 ops/release/deploy_release.py 和 ops/release/release_contract.py。必须逐项比较真实旧 17 与目标准确 17，不能据此前源码批次推断只有这两项差异。其余成员若有不同，停止并列出准确对象及影响后另审；尤其 Compose/readiness、备份脚本/unit/sudoers变化不自动随工具更新放行。不能手改新旧 Manifest 或扩大 250/300 阈值。

### 2.2 九个常规运行辅助件

以下各文件均来自同一准确提交 S，安装在 /opt/sanq/runtime/ops/release/，不进入原 17 清单：

| 文件 | 所有职责 |
| --- | --- |
| deployment_plan.py | 纯计划、SQL/兼容确认和运行合同 |
| deployment_plan_store.py | 私有 typed 原件存取、计划锁 |
| collect_deployment_plan.py | 现场采集、准确来源/镜像/SQL及审阅 CLI |
| release_job.py | 只读预检 job、原任务锁 |
| maintenance_guard.py | 维护记录、门禁和保存 ID 的失败收尾 |
| migration_container.py | 单一迁移对象配置、退出与历史校验 |
| start_candidates.py | 保存候选 ID 启动及就绪 |
| finalize_candidates.py | 唯一发布状态交接、原策略恢复与最后清标记 |
| release_task.py | 异步提交、管理器上下文、阶段编排和联合观察 |

文件目标 root:root、0644，父目录 root-owned 且无组/其他写权限，不允许链接、额外硬链接或路径重定向。用 /usr/bin/python3 -B 调用，无需赋予脚本可执行位。固定路径、辅助件互相导入、API 签名与同版本字节须一起验真；签名检查只是额外门禁，不能替代完整文件哈希。

一次性 installer/Mac 薄入口属于独立交付工具，不算第十个常规辅助件，不进原 17，也不由普通发布任务调用或自更新。

### 2.3 三个永久 systemd drop-in

固定文件名均为 80-sanq-maintenance.conf，目标目录为 /etc/systemd/system/<unit>.d/，root:root、0644；父目录 root:root、0755。永久内容逐字采用同提交 maintenance_guard.DROPINS，不从不受信输入指定 unit、路径或命令。

| unit | 永久作用 |
| --- | --- |
| docker.service | ExecStartPre=/usr/bin/python3 -B /opt/sanq/runtime/ops/release/maintenance_guard.py check-startup |
| docker.socket | ConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json |
| sanq-backup.service | 同一 ConditionPathExists；ExecStartPre=+ 加固定 startup guard |

不新增常驻服务、timer、sudoers/NOPASSWD、远程 root launcher 或生产云凭据。应用任务仍为原 transient unit。未知额外 drop-in、完整 unit override 或同名文件冲突均阻断，不覆盖它们来迎合门禁。

### 2.4 私有状态与恢复材料

| 固定位置/对象 | 安装规则 |
| --- | --- |
| /opt/sanq/deploy-state 与 plans、jobs、maintenance 子目录 | root:root、0700；不存在才在已核验真实父目录中显式创建；已有权限/类型不符先拒绝，不自动修权限 |
| plans/.prepare.lock、jobs/.release.lock | 运行时按原合同建 0600；共享目录就绪后，从锁内业务基线复核至交接结束持原两锁，保留 inode，不 unlink/重置 |
| 原计划/job/维护残件 | 不覆盖、清空或迁移成“成功”；未完结记录阻断正常安装 |
| /opt/sanq/deploy-state/installations/<安装身份>/（拟定） | root:0700，固定安装材料/阶段记录 0600；只记录交付摘要、前置观察、恢复实物与安装阶段，不成为应用 current/previous 权威 |
| 原 .env、.sanq-release-state.json、C4 marker | 原字节/owner/gid/mode及可恢复实物保存；工具安装保持原内容 |
| sanq-app_pgdata、/srv/sanq/uploads、sounds、备份根 | 核对实际身份和原权限；不复制替换数据库卷、迁移数据或重新布置挂载 |

安装材料要保存完整旧 17+Manifest、原归档（若尚无法取得则阻断正式恢复就绪）、九辅助件和三个外部文件的旧字节/元数据或原本不存在的事实、私有状态原件、容器完整 ID/image ID/声明/digest/挂载/原 restart 策略、实际 unit 状态与加载配置。旧源码 checkout、旧证据、快照和日常备份保留。安装记录中的观察值与旧 state 实物不取得第二份发布选择权。

## 3. 来源方案：复用 GitHub 精确对象，不新增发布权威

本合同选择“原已封存 17 归档 + 同准确 S 的固定源码对象 + 固定模板”作为最小输入，不先增设另一个发布 workflow、状态 seal、CA 或签名服务。

1. 复用 release_contract.verify_exact_candidate(S, S) 核同 S 的 seal、谱系、发布及最新准确 main CI，再复用历史 Runtime 归档校验核独立压缩摘要、17+Manifest和同 publish run/两 digest。manifest 的原 ciRunId另核其原始 main/push、准确 head及成功结果；不要把后续成功 CI 的新 ID 直接写入或等同原归档 ciRunId。既有历史归档函数本身未核最新 CI，不能单独作为全部来源门禁。包内 manifest 自报的 hash 不构成来源证明。
2. 九辅助件和未来 installer/Mac 工具逐项读取 S 的完整 Git commit/tree/blob：路径、普通文件类型、blob 身份、字节数、完整原文及 SHA256都核对；不能用 compare/files 的截断列表、可变分支名、工作区文件或 kit 内自报摘要代替。
3. 三永久 drop-in 是已审阅固定文本，必须与已验真 S 的 DROPINS 一致；不通过 import/exec 未验证目标 Python 来生成或验证文本。后续实现对模板的静态表达/一致性采用聚焦测试，不引入通用代码求值。
4. transport kit 可缓存原归档、固定源码字节和清单。清单绑定 S、原归档独立摘要、每项路径/大小/hash、格式版本与模板摘要，属于传输清点材料，不能自证可信、设置 readyToInstall 或授权 root 写入。根信任核对失败或原件不可得则阻断，不离线猜测通过。
5. 第一次 root 验证由操作者独立审阅、从可信准确 Git 对象核过的有限 bootstrap 实现；期望 hash 不能来自同一未验证 kit。bootstrap 仅标准库、固定路径和操作，不 import/exec staging 中目标文件；核验完成后复制到 root 私有位置、同步读回，再进入明确授权的安装阶段。
6. 日后应用发布不重新投递九工具；其完整性随已安装工具核对。工具低频升级另走同一准确交付路径，不能让正在运行的任务替换自身依赖。

此处是普通 GitHub 精确来源与文件权限合同，不恢复暂停的 C1 加载研究。它不声称抵抗恶意 root、跨克隆回退或没有外部证明的可信时间问题。

## 4. 安装顺序与中断边界

这是未来 installer 的固定顺序，不是本批已具备的命令。真正写入前须有明确授权、隔离验收及可审阅材料。

| 阶段 | 达到后才能继续 | 中断/未知结果 |
| --- | --- | --- |
| REVIEW_INPUTS | 精确来源/全清单/主机身份/旧 17/原配置与资源、系统 Python/依赖、units/挂载/备份/恢复实物齐全；无未完结 job/维护 | 只读阻断，不能声称已冻结 |
| PROVISION_AND_LOCK | 仅对原先不存在的固定私有目录显式建目录；随后持原 job/计划锁，重核业务基线、无 pending job及维护为空；既有 owner/mode/类型不符拒绝 | 只产生私有目录/原锁文件，不宣称维护生效，不清理或重置既有记录 |
| RECORD_INSTALL_INTENT | 独立安装记录及 maintenance/active.json 安装意图先同步读回；该 marker 与普通应用维护记录分 kind，不冒充 v1–v6 | 保留原件；普通 guard 拒绝不识别的 kind，startup 仍因非空维护目录拒绝 |
| LOAD_DENY_GATES | 三固定 drop-in 先用下述独立拒绝形态安装，daemon-reload后核有效加载属性和来源；仍不重启 daemon | 全部未确认前不改容器策略、不停业务、不覆盖 Runtime；此时不能声称跨重启已冻结 |
| FREEZE_SAVED_WRITERS | 持原两锁，先耐久保存完整三 ID/image/策略；仅对保存对象设 restart=no 并 stop，复核角色全集/DB/挂载/备份 | 只尽力处理保存 ID，无法确认则 FENCE_UNCONFIRMED；不推断新 ID 或自动恢复策略 |
| RECOVERY_READY | 已停写/抑制重启的准确 Lightsail 手动快照 available及原工具恢复材料核对；不自动调用 AWS | 未核实不能覆盖受保护执行源；恢复资格依准确对象，不靠裸 hash |
| WRITE_TOOLS | 在拒绝门禁和两锁下安装已验真九工具、正式 17+原 Manifest及元数据；按明确逐文件顺序同步/读回 | 保留安装意图、实际新旧字节和拒绝门禁，不继续执行混装工具或自动退回 |
| LOAD_PERMANENT_GATES | 全部新字节核对后把同三文件换为永久准确文本，daemon-reload并核 _installed_gate、API/签名/权限 | 旧加载拒绝形态与新非空目录 guard 都阻断冷启动；加载未知不清 marker |
| VERIFY_OLD_APPLICATION | 原 .env/state/C4 marker逐字不变；仅在前序已知成功后启动保存的原应用 ID，核实际 image/挂载/DB/HTTP/readiness，恢复准确原策略 | 启动可能写业务数据；失败停保存 ID 并保留真实证据，不据快照自动恢复旧盘 |
| COMPLETE_INSTALL | 全清单/有效 units/原应用/元数据读回、耐久安装完成记录；最后清理准确本次安装 marker并同步读回 | 完成记录或清理未知不重写/重放。marker可能仍在或已消失，按实际状态审阅 |

临时拒绝形态只占用上述同三个固定文件路径：

- docker.service：固定 [Service] 与 ExecStartPre=/usr/bin/false。
- sanq-backup.service：固定 [Service] 与 ExecStartPre=+/usr/bin/false。
- docker.socket：保持固定 ConditionPathExists=!/opt/sanq/deploy-state/maintenance/active.json，且安装 marker已耐久存在。

这些内容只用于一次性安装，正式 _installed_gate 必须拒绝它们。独立 bootstrap 核验它们已有效加载后才能进入 FREEZE。不以 drop-in 文件存在代替加载生效；不 stop/restart Docker 来充当停完写入者，不把 socket拒绝等同现役容器已停。永久 guard上线后仍在非空维护目录中拒绝启动，因此转换时不需要删除 marker制造窗口。

首版不重启或重建 DB/无关隧道、不迁移业务、不更新应用镜像。若真实源差异超出工具范围或旧应用无法在新工具下证明一致，停止并另审平台维护。/opt/sanq/runtime保持真实目录，17 与外部文件逐项变更不被描述为一个原子事务。安装期间不得从另一终端手工发布或更换工具。

## 5. 后续实现切片与退出条件

| 切片 | 必须交付 | 退出条件 |
| --- | --- | --- |
| D1：惰性材料与只读核验/计划 | 在拟定 install_minimal_executor.py 内固定清单、精确对象/原归档输入校验、无执行权的材料清点和安装差异；不接 host apply | 合法完整输入通过模型，错 source/hash/类型/链接/多缺成员/原件变更拒绝；不 import未验目标、不调用 Docker/systemd/AWS或写生产；实际 CI 通过 |
| D2：受限安装与失败保持 | 固定 root 读写目标、两锁、安装意图/临时门禁/旧工具实物保存、逐项同步与最终读回、明确人工恢复材料 | 故障注入覆盖每个耐久边界；未知不续跑、不自动重开，不写 DB；实际 CI 通过 |
| D3：Mac薄入口与一页 runbook | 固定 SSH 主机验证、准确子命令/参数、计划/SQL/回退摘要转交、重连 status/logs | 普通无迁移发布两次操作内；无任意 shell/URL/路径拼接，无新常驻设施；实际 CI 通过 |
| D4：统一真实隔离验收与生产材料 | 旧→新安装、Compose美元往返、系统Python/Prisma/Docker/PID1、SSH/SIGKILL/socket/daemon/reboot、连续双发布与恢复 | 覆盖准确最终版本全部场景，恢复对象/证据可复核；通过后才提交准确生产安装与 main 晋级材料 |

D1–D4是第三批内部切片，不新增项目目标。当前第一/二批源码及 CI 已推进，不把真实隔离验收记成完成。完成 D1/D2 不等于已获生产 root 写入授权；不会为每个模型测试要求生产主动演练。

## 6. 本批结束位置

本批只完成源码审计与交付/安装合同，未修改 build_bundle、publish workflow、17 清单、guard、备份清单、权限或生产文件；没有运行项目测试、installer或系统操作。文档中的临时拒绝门禁、安装 marker/记录和 kit 均为后续实现合同。

下一步实现 D1 惰性材料与只读核验/计划。真实安装、Mac入口、隔离验收、生产过渡仍 OPEN；满足最小执行器最终条件并恢复正常代码更新后，再返回三组暂停研究。
