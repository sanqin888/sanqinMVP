# Runtime 更新 — C1 P10-F4-B12 检查至消费持有期与锁合同

**2026-10-26 F4-B12：MERGED_DEV / CI_VERIFIED_DOCS / CONTRACT_AUDIT_COMPLETE / REAL_ADMISSION_NOT_IMPLEMENTED / C1_OPEN。** [PR #2976](https://github.com/sanqin888/sanqinMVP/pull/2976) 最终head08bcca56c18564b6af85f806869a9cff387f5d96经 [CI #7629](https://github.com/sanqin888/sanqinMVP/actions/runs/40340308379) 成功，docs-only 1成功/9按范围跳过，无修复；合并dev61bb0e484f0748646ac5740bb2d69d31c85b07e4。五份文档明确[检查至消费持有期与锁合同](Runtime更新-C1-P10-F4B12检查至消费持有期与锁合同.md)：F2/F3返回前关闭FD、消费独立取锁；一次锁/动作前重检及HANDOFF交接，旧.handoff.lock与normal-update.lock不同，发布检查8个新增项目依赖及sys.path副作用仍阻止直接扩loader。完整保留R2 #2975，归档B11实际CI；无源码/依赖/迁移、owner/依赖图/债务/scanner基线或生产变化，未运行新Runtime测试。

基线为最新 `dev@e01c921c339a49de7a9855e233c11c21d32c17c8`，包含 C1 F4-B11 与 R2 PR #2975 的阶段/B1 审计。本批分支 `docs/c1-p10f4b12-held-review-admission-contract-20261026`。本批仅审阅源码与合同、同步进度；没有新执行入口或测试，没有运行项目测试、创建 root 对象或执行效果。已提交并经上述准确head的docs-only CI合并。

F4-B11 [PR #2974](https://github.com/sanqin888/sanqinMVP/pull/2974) 最终 head `4485d9fdcec7663faca4f8fd30824378933d233f` 经 [CI #7625](https://github.com/sanqin888/sanqinMVP/actions/runs/40329893226) 成功，合并 `003daa21dc0795ec092cac20502e0d9c2918f7aa`。ops job `121596298756` 实际通过 Release 45、Runtime 1058、精确 CPython 3.12.15 的 C1 390 项。首次 CI #7624 的三个错误来自普通用户不能覆盖测试材料的 0400 文件；同分支仅调整材料准备时改写后恢复 0400，生产实现不变。此证据只覆盖既有装配与离线回归，不能覆盖本合同尚未实现的组合。

## 1. 静态裁定：现有组件不能直接串联为正式准入

| 源码事实 | 当前保证 | 检查到消费的缺口 |
| --- | --- | --- |
| `normal_runtime_writer_scope.assemble_protected_writer` | 原批准三文件、外部双 pin、进程声明、源码/祖先 FD 与固定八模块保持至 consumer 退出 | 不验证当前安装/目标发布，不持安装域消费锁，不调用 writer |
| `normal_runtime_readonly_review.review_readonly_update` | 原 target bytes 与 newest 发布、当前 17 成员/Manifest/三保留文件的有限检查 | `_installed` 在函数返回前退出；返回 dict 没有持续 FD 或锁 |
| `normal_runtime_readonly_anchor.review_fixed_runtime` | 固定 /opt/sanq/runtime 祖先包住 F2 检查 | `_fixed_runtime` 同样在返回前关闭；当前 namespace 不自证 Host |
| `normal_runtime_history_writer.consume_v2_local_attempt` | 在 `history._layout_scope → local._locked_base` 内取得非阻塞全局锁，空双布局才 create-only CLAIM | 校验与消费无法在该公共函数之外共享一次锁；传旧 report 不证明安装仍一致 |
| `normal_runtime_local_admission._locked_base` | 固定既有 `/root/sanq-runtime-operator/normal-update.lock`、真实 root、祖先/锁身份检查 | flock 只约束协作方，不阻止非协作 root、业务 writer 或另一个锁域 |
| `offline_root_private_installer` | 旧隔离实验在其自有 root 下使用 `.handoff.lock` | 与 normal-update.lock 不是同一对象，不能据此宣称正式安装器被共同锁覆盖 |

不采用“先检查返回 → 再调用 consume_v2_local_attempt”，也不采用“先取得 _locked_base → 再调用会另开锁 FD 的 consume_v2_local_attempt”。前者留下交接空档；后者在 Linux 的独立 open-file description 上会与自己已持有的 flock 冲突。不得以 retry、释放重取、缓存布尔值或 caller 提交 lock FD 解决。

此为静态接口/lifetime 审阅，未执行新的 flock/进程实验，也没有认定生产已经存在并发事故。

## 2. 目标持有期与阶段顺序

未来受信组合必须先固定外层执行代码/stdlib/平台和独立批准 pins。原 immutable request、launch、target Archive 与 preserved observation 全程保持原身份；来源、当前安装、目标发布及消费 handle 不得跨私有 core 混组。target bytes 由原 request 摘要与既有独立发布核验绑定；本合同不新增材料路径、输入 schema 或真实性来源。

建议的同一安装域顺序如下，**均为待实施合同**：

1. 进入批准输入/来源/私有模块的受保护作用域；仅装配，不消费。
2. 从同组 local 模块进入一次原全局锁。锁忙、缺失或身份变化时拒绝，不先联网或准备新树。
3. 在锁内进入固定 Runtime 祖先与完整安装成员检查作用域，完成原 target newest 发布和当前安装来源检查。保持实际成员 FD 与路径边，提供同进程只读重检；报告本身仍非权限对象。
4. 在上述作用域与同一把锁仍存活时，重新检查安装/祖先、输入/来源与空历史；再由持有锁的私有实现写首次 CLAIM。仅“内核对象仍开着”不等于最新证据，写前必须复核；退出检查太晚，无法撤回已经写出的事件。
5. CLAIM 后持同一锁及 attempt 至所有实际阶段/abort 完毕。任一失败/未知均保留事件和事故，不删除 CLAIM、不重入、不自动恢复业务。

第 4 步当前**未实现**。后续应把历史布局和首次消费所需的私有逻辑划在明确持有者内，公共消费 API 保持原独立语义；不得新增任意 lock/owner/root/callback 注入或跳过真实性的 verified=True 参数。只读解释器的完整目录快照与 writer 的稳定目录身份检查继续分开，不能为允许追加而削弱原只读检查。

### 2.1 释放不能以错误的层级定义

保留文件 FD 不冻结文件内容，flock 不覆盖不合作的 writer；真实对象的动作前复核和 R2 持续禁入仍必需。源码/输入退出异常不撤回 consumer 已执行效果。

安装前完整 stat/路径快照只覆盖安装前审阅与消费交接，**不能原封不动跨越有意替换 Runtime 的 HANDOFF**。冻结会有意改变动态状态，HANDOFF 会有意改变固定路径与目录项；必须在真实 R2/冻结基线成立后显式结束安装前角色，由安装/安装后组件按原批准目标接管对象身份。不能简单忽略旧 scope 退出失败，也不能对新树偷偷重设“旧”快照。后续受控交接须定义阶段、原/新树 FD、失败归属及退出顺序；本批没有此能力。

原 READ_ONLY_BOOTSTRAP observation 不升级为冻结后动态基线。安装后复验仍按 B3 限域，真实容器/DB/uploads/原策略/业务和 R2 终态另行证明。

## 3. 发布检查加入同组的准确依赖与阻塞

以 B10 的八项目模块为基础，静态递归导入审阅发现：若增加 F2/F3，项目闭包还需以下八个模块，共十六个**项目 Python 模块**。这不是 17 文件 Runtime Bundle；独立 bootstrap 和外层装配/loader 代码另行固定。

| 模块 | 仓库唯一来源 | 直接项目依赖 |
| --- | --- | --- |
| release_contract | ops/release/release_contract.py | 无 |
| build_bundle | ops/runtime/build_bundle.py | release_contract |
| runtime_trust | ops/runtime/runtime_trust.py | release_contract、build_bundle |
| runtime_update_contract | ops/runtime/runtime_update_contract.py | 无 |
| stage_bundle | ops/runtime/stage_bundle.py | build_bundle、runtime_trust、release_contract |
| versioned_release_contract | ops/runtime/versioned_release_contract.py | release_contract、runtime_trust |
| normal_runtime_readonly_review | ops/runtime/normal_runtime_readonly_review.py | build_bundle、inputs、launch、release_contract、runtime_trust、runtime_update_contract、stage_bundle、versioned_release_contract |
| normal_runtime_readonly_anchor | ops/runtime/normal_runtime_readonly_anchor.py | readonly_review、source_anchor、release_contract |

导入名到文件必须唯一，不能按 sys.path 顺序搜索。此表仅给出读取到的项目依赖，**不是新 loader 已获执行的来源白名单**；标准库及其实际加载仍需定向核对。

已发现的具体阻塞：

- `build_bundle`、`runtime_trust`、`versioned_release_contract` 顶层依据 `Path(__file__).resolve().parents[2]` 执行 `sys.path.insert`。当前 loader 的 __file__ 是摘要标签，不是真实 checkout 路径。即使得到可解析的路径，也会改写进程搜索路径，违背有限装配的无构造副作用要求。
- `stage_bundle` 顶层设置 `sys.dont_write_bytecode = True`。原 -B 进程虽已禁止写字节码，装配仍应证明共享状态没有被候选初始化改写。
- 新导入涉及 argparse、gzip、io、subprocess、tarfile、tempfile、pathlib、pwd、datetime 与 urllib.error/request 等。现 writer 受信 stdlib 表不包含它们；不能宽放到任意 import，或把“只调用 verifier”当作所有导入代码无能力的证明。
- 上述 release/build/stage/trust 文件多为受保护 17 Bundle 成员。本批不编辑它们、篡改 AST/源码绕过顶层语句、伪造 __file__，也不借普通 canonical 模块缓存替代 pin。将其受限只读逻辑抽到新非 Bundle 来源还是做受审的原子提取，需要下一阶段提供准确变更与所有使用方/发布影响审阅；不能靠添加八个文件名直接解锁。

因此 B11 的八模块 loader 和旧九源 CLI 继续准确拒绝多余/未知来源；没有改变选择集合、公开参数或旧候选身份。

## 4. 下一源码切片：B13 仅保持只读安装检查作用域

为先消除已确认的 FD 生命周期缺口，下一源码限定在既有 Runtime/Ops 非 Bundle 的 `normal_runtime_readonly_review.py`、`normal_runtime_readonly_anchor.py` 与其测试：

- 从现有 F2 逻辑提取真正的 context，把原 _installed 的文件/目录 FD 保持到 consumer 返回。复用原输入双 pin、target 原 bytes/newest、当前发布/原成员与保留观察检查，不复制第二套校验实现。
- F3 固定祖先 context 包住该成员 context；供未来调用方在同一时刻重新核查成员、目录/祖先的原身份，缺失/替换/修改拒绝。新增接口只表达只读生命周期，不接受身份/权限覆盖。
- 现有 review_readonly_update 与 review_fixed_runtime 继续在作用域正常退出后才返回原非授权点时报告，所有使用方和原有测试语义保持；不是增加过渡别名或双重实现。
- context 不宣称持有全局锁或 R2，不调用 writer/准备/Flow，不承诺阻止恶意 root，不跨 HANDOFF。原 inputs/type/request 与 report 全部 false/BLOCKED 规则保持。
- 不扩大 loader、不改 protected Bundle、现有输入/17 成员、版本选择或 frozen observation；真实组合与锁内 CLAIM 在之后独立接线。

后续精确源码候选的有限加载策略必须先解决第 3 节阻塞。B13 可作为独立只读能力验证生命周期，**不能被标为真实准入完成**，也不要求伪造一个已认证发布检查器来运行 Flow。

## 5. 聚焦验证与复用范围

B13 实现时复用现有 F2/F3 的双 pin、newest 拒绝、来源/Manifest/成员/观察、owner/mode/link/FIFO/大小、网络中途替换与借入 FD 保留矩阵；无需为同一规则重新搭一套全量测试。

新增覆盖必须区分：

1. consumer 内安装成员和祖先 FD 实际仍存活，正常退出才关闭，原 borrowed FD 不归库关闭。
2. consumer 期间同 bytes 替换成员、目录/固定祖先替换、模式或成员集合漂移；显式重检及正常退出均拒绝，不返回缓存成功。
3. 输入/目标或来源核验失败不 yield，部分打开的 FD 清净；consumer 原异常、KeyboardInterrupt/SystemExit 与清理失败的优先级明确，关闭全部自有 FD。
4. API/报告维持非授权边界；不调用 writer/Flow、准备、Docker、云或修复路径。

将来锁内消费另加并发/独立进程竞争、同一 FD 锁持有、检查至 CLAIM 的漂移、fsync 未知与异常后 claim 保留测试；不得把 B13 的只读测试当成这些项目已完成。GitHub Actions 才是权威执行环境；本批未新增/运行项目测试或 CI，文档变更预期走 docs-only 选择与汇总门禁。

## 6. R2 交接与完成状态

最新 [R2-B1 审计](Runtime更新-R2-B1可信身份与双层撤销实施前置审计-20261026.md) 和 [R2 阶段路线](Runtime更新-R2阶段审计与B1实施路线-20261026.md) 明确正式 Anchor、完整 CRL、可信时间/版本、撤销生效点 F 和真实 Guard/CAS 尚缺，保持 P1_DENY、R2-C4_OPEN。C1 不改其 schema/Wire、epoch、证书/发行者或权限，也不推定 R2 已完成。

本批五份文档：本合同、B11 结果归档、P10-F 总审计、依赖图和单条 worklog；旧 B11 记录就地更新，不重复登记。Runtime/Ops owner、既有依赖图/循环/债务/scanner 基线没有变化，未运行架构扫描；无源码、依赖、数据库迁移、候选交付、解释器/root/VM/AWS/生产修改。原 Python 3.12.15、九源只读 CLI、v1 输入与 17 Bundle 保持。

**最高状态：B12 已合并，docs-only CI 已验证；实际准入/全 Flow/可信终结未完成，C1 仍 OPEN。** 后续 [B13保持安装只读检查作用域](Runtime更新-C1-P10-F4B13保持安装只读检查作用域.md)已在本地实现，新增22项测试尚未运行；本合同第4节的设计提议仍保留为B12审阅时的阶段记录。
