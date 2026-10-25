# Runtime 更新 — C1-PREP-11 Python 3.12.15 变更审计

**2026-10-25实施续记（America/Toronto）｜IMPLEMENTED_LOCAL / PROFILE_FROZEN / SOURCE_OPS_VERIFIED / FINAL_CI_PENDING / INTERPRETER_PROVENANCE_OPEN / C1_OPEN。**

用户已授权按审计进行代码修改；两源码、6个测试文件和精确版本CI步骤已本地完成，见§9。以下§1～8保留2026-10-24的审计结论及当时状态，最新实现/验证状态以§9为准。

## 1. 审计对象与证据

- 远端基线：`dev@32963a0c7ed093600aa91847d98204ede0795337`。已复核根AGENTS（blob `03045c7de6dd8cf3db535688d08f66995d3afe45`）、CI（`f93f02f3224dcec1b30411c14b6452e524646e90`）和change_scope（`7026d4ab8784077b0604db02662b85d9af4e25d5`）；本批继续使用原PREP-11本地文档分支，原基线17188367与dev之间的R2 PR #2945文档/日志变更须在交付时保留。
- 当前C1的9个运行源码和8个对应测试文件均按上述dev读取；launch/process_check/bootstrap/核心及五个支持模块的内容与PREP-10固定源码身份相符。旧源码身份仍为 `b7b7f27682700447d37bcdabd456f22087a54892`，本报告不会产生新的运行候选身份。
- 已读R0、C1当前包、PREP-10、[PREP-11现场回执与方案](Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md)、相关测试和CI。附件2026-08-28全站模块化审计只用于历史背景，不覆盖现行Runtime合同。
- [回执001](evidence/c1-prep11-aws-platform-receipt-001-2026-10-24.md) 与 [002](evidence/c1-prep11-aws-platform-receipt-002-2026-10-24.md) 报告Jammy22.04.5/x86_64、PATH中的python3.10及版本化包 `3.10.12-1~22.04.18`；`/usr/bin/python3.12`不存在。尚未查询或证明其他位置存在3.12.15，不能把缺少旧路径理解成全盘不存在其他安装。

## 2. 结论与合同范围

代码影响小，解释器交付和准确平台验证是主要未决项。**必改运行源码为2个文件**；进程核对器已经从LaunchMaterials读取目标版本和路径，无需为3.12补丁版本变更改其比较算法。**6个测试文件包含版本或路径相关预期**，其中输入测试主要随最终路径决定是否调整；另2个文件没有这些硬编码，仍纳入回归。

实施按AGENTS第18节的 **A类内部原子迁移** 规划：当前bootstrap尚未实际交付/运行，无已确认的独立生产消费方；源码、测试和新批准输入可一起更新。保留现有v1字段结构、sourceRoot和双pins机制，改变的是准确候选的目标值与字节身份。旧批准材料保留历史身份，新候选必须独立生成；不新增旧/新运行时自动回退、版本范围匹配、CLI路径覆盖或通用配置层。如后续发现已有独立部署或持久化消费方，应重新审计其迁移边界，不能继续假设原子切换。

版本选择不改变Runtime/Ops owner、模块依赖方向、源码装配顺序、17 Bundle或业务模块。保留 `-I -S -B`、全部身份/env/cwd/argv/flags严格核对及false/BLOCKED守卫；不增加维护、AWS、安装或正式运行权威。无需Prisma/schema/数据库迁移。

## 3. 准确运行源码改动面

以下行号对应审计基线，链接指向准确Git提交。

| 文件 | 当前事实 | 计划改动 |
| --- | --- | --- |
| [normal_runtime_launch.py](https://github.com/sanqin888/sanqinMVP/blob/32963a0c7ed093600aa91847d98204ede0795337/ops/runtime/normal_runtime_launch.py) | L18固定解释器；L107声明3.12.3 | 版本改为严格3.12.15；INTERPRETER按已审阅交付路径固定，派生argv随之更新；schema/字段与权限值不变 |
| [normal_runtime_bootstrap.py](https://github.com/sanqin888/sanqinMVP/blob/32963a0c7ed093600aa91847d98204ede0795337/ops/runtime/normal_runtime_bootstrap.py) | L1说明、L110版本/路径、L112 origArgv、L248批准平台均绑定旧目标 | 同步3.12.15 final/serial0与同一绝对路径，更新说明；保留准确env/flags/owner和输入先于支持源码装配的顺序 |
| normal_runtime_process_check.py | L74～88从document派生平台、版本、argv、env/cwd和身份，版本不硬编码 | 比较算法和safe_path检查可保留；测试同步新版本/路径，继续拒绝3.12.3及其他版本 |
| normal_runtime_inputs.py、normal_runtime_update.py | 完整canonical回环；request包含launch摘要 | 无必要的算法变更，但旧输入不能直接用于新候选；输入与request摘要随launch自动变化 |
| source_snapshot、source_anchor、source_loader、candidate_scope | 校验完整清单、双pins、FD/路径和固定源码字节 | 无必要的运行算法变更；全部纳入回归，不放宽文件/模块/FD保护 |

bootstrap在可信支持源码装配前必须独立完成核对，不能为了消除两处版本常量而提前导入项目模块。`_argv()`对 `/usr/bin`、`/bin` 的限制针对subprocess声明；独立解释器路径的变化不要求放宽该子进程白名单，当前bootstrap仍只接受空subprocess清单。

3.12.15仍支持现有safe_path及 `-I -S -B`，因此无需实施此前3.10方案中的专门API适配。源码的ASCII canonical/有界JSON整数解析和固定bytes消费继续保留；本审计没有证明运行兼容性已经通过。

## 4. 测试影响与需要防止的假通过

| 测试文件（ops/runtime/tests/） | 审计发现与同步范围 |
| --- | --- |
| test_normal_runtime_update.py | L179启动argv、L186平台快照改为新目标；保留核心行为、冻结与失败守卫断言 |
| test_normal_runtime_process_check.py | L35/37/42期望值和L205～206 sys观察fixture同步；增加旧3.12.3拒绝，保留相邻补丁/错误版本、身份、env/cwd、flags和无副作用负例 |
| test_normal_runtime_candidate_scope.py | L96/98模拟进程版本/路径同步；保留source读取前拒绝、FD与namespace生命周期覆盖 |
| test_normal_runtime_bootstrap.py | L108/109/121两层进程fixture同步；测试严格3.12.15、旧版本/路径及混合批准输入拒绝 |
| test_normal_runtime_source_loader.py | L402把源码中3.12.3替换成错误版本来制造语义漂移；必须把待替换token同步为3.12.15，并确认替换命中、确实改变bytes，避免负例成为空操作 |
| test_normal_runtime_inputs.py | L195有旧解释器路径的非法argv样本；若改变路径，应同步解释器token并维持“缺flags/派生argv错误”的原失败原因 |
| test_normal_runtime_source_anchor.py、test_normal_runtime_source_snapshot.py | 未发现版本/解释器硬编码；仍须回归原FD、清单、owner、路径保护和退出复检 |

补充验证应覆盖：新目标匹配；3.12.3/其他补丁/其他分支及非final拒绝；错误路径/别名、env/cwd/身份/flags拒绝；旧pins配新源码、新pins配旧源码及launch/request混合拒绝；源码漂移负例实际命中；既有FD严格检查、无隐式Flow和全部false状态继续有效。不要为了测试方便，把错误观察自动修正成新目标。

## 5. 摘要与候选材料的传递影响

变化顺序为：两个源码的bytes/size/SHA256 → 九文件清单及sourceCommit → launch.json的版本/argv/源码清单与摘要 → request.json内launchMaterialsSha256及自身摘要 → pins.json与批准目录材料 → 新源码归档/审阅清单。命名空间也由新launch摘要派生，不能复用旧候选namespace身份。

PREP-10的b7b7源码包、归档摘要和CI仍是旧候选历史证据；不改写成3.12.15材料，不覆盖其证据文件。9文件中未修改的源bytes可以沿用原摘要，但完整新清单/归档及准确源码提交必须重新固定。旧R1-A/S5的Noble解释器/stdlib/库成员不能认证Jammy上的新构建，只有准确来源和对象仍匹配的部分可以复用；无需重新开展无关实验或默认增加全量动态闭包取证。

## 6. 解释器交付方案与未决条件

当前选择确定为Linux/x86_64、**CPython3.12.15 final**；安装来源、准确产物和绝对路径尚未冻结。建议并行安装到版本专属、root控制的目录，例如 **`/opt/sanq/python/3.12.15/bin/python3.12`**。这是待审的候选路径，不是已批准/已安装事实；也不把系统 `/usr/bin/python3` 替换成新版本。

| 路线 | 审计判断 |
| --- | --- |
| 官方源包 → 受控Jammy/x86_64构建 → 独立版本目录交付 | 当前可具体规划的首选路线；需验真源包和发布者、明确构建环境/选项/关键依赖，并固定输出产物及其来源关联。上游源包SHA256不能直接认证编译后的二进制 |
| 已有签名发布、兼容Jammy的准确3.12.15二进制包 | 若能取得并核实，可替代自行构建；目前没有发现或认证可直接使用的具体包，不能写成apt安装已可行 |
| 继续强求 `/usr/bin/python3.12` 或复制Noble包 | 不作为默认路线；当前路径不存在，不能靠链接/包装器伪装匹配，也不能把24.04的包直接当22.04可用对象 |

Python官网列出3.12.15为2026-09-30安全发布，当前3.12已是仅安全修复、上游仅源码发布的阶段。官方XZ源包发布页报告SHA256为 `c2c4321961fab0fb999d66e0cecf521c2ab3994c7992873ea99e306c1094fd5a`，并提供签名材料；这里只记录可审阅的来源候选，尚未下载、验签、构建或安装，不能把该摘要当本机产物pin。

构建默认prefix是 `/usr/local`；官方建议altinstall避免覆盖通用python3。最终路径须与选定prefix及实际产物一致，不能只改代码字符串。若使用建议的版本目录，应核对其完整祖先、所有权/写权限、文件类型与准确解释器、stdlib、关键本地库的来源和保护；原五键env与 `-I -S -B` 保持，避免为动态库加载追加未经审阅的环境变量。更换Python不会延长Ubuntu22.04标准安全维护至2027年5月的期限。

本轮没有授权或执行源包下载/构建、依赖安装、生产写入、系统升级、别名/链接操作、目标Python启动或root源码交付。版本选择已经确定，后续不需要重新询问是否采用3.12.15；需要把具体路径/交付对象落实到可审阅的实施方案。

## 7. 验证与交付顺序

1. 固定兼容Jammy的解释器来源/构建与交付路径，按本报告在本地功能分支原子更新两源码、相关测试和当前文档；不能将“用户选版本”写成“本机已验证”。
2. 重定新候选九源清单、批准材料与归档，静态复核旧版本正向预期已经消除、历史负例/旧证据仍准确、所有守卫保持；审阅报告后再按用户远端授权交付PR→dev。
3. 原CI selector对ops/runtime路径联动Runtime与Release，保留两套原门禁及最终head全绿要求。现workflow在ubuntu-26.04上直接使用python3，没有固定3.12.15；模拟进程fixture不证明目标解释器。需补确切3.12.15的离线回归证据，执行位置为具备权限的受控CI或隔离开发环境；若通过CI补齐，应审阅最小的版本测试步骤，不能替换/削弱既有门禁。本审计没有修改workflow。
4. 准确解释器及关键来源经核对后，在选定Jammy主机完成受保护交付和必要的同候选只读bootstrap验证；验收仍限assembly-only/BLOCKED，不自动调用Flow或触发维护、快照、安装、业务启动。
5. C1最终仍随完整正式执行候选及原R0门禁收口，本次补丁版本选择和文档CI都不能单独关闭C1。

本轮达到的最高状态为 **版本已选定、静态变更审计完成**。未编写/执行新的项目测试，未运行仓库test/scanner、实际bootstrap或解释器；只做来源/代码/测试/CI读取、文档及补丁静态检查。当前为本地文档，未提交远端。

## 8. 官方资料

- [Python3.12.15发布页、源包摘要与签名材料](https://www.python.org/downloads/release/python-31215/)
- [Python3.12 Unix安装与altinstall](https://docs.python.org/3.12/using/unix.html)
- [Python3.12安装prefix](https://docs.python.org/3.12/using/configure.html#cmdoption-prefix)
- [Python3.12启动参数](https://docs.python.org/3.12/using/cmdline.html)
- [Ubuntu维护周期](https://ubuntu.com/about/release-cycle)

## 9. 授权实施结果（2026-10-25，本地待审）

- 分支 `feat/runtime-c1-python31215-20261025` 基于最新dev `32963a0c`，完整保留原PREP-11九份文档与并行R2 PR #2945记录；审计和回执不因换分支丢失。
- 两运行源码已固定 **CPython3.12.15 final / `/opt/sanq/python/3.12.15/bin/python3.12`**；该路径由用户“按照审计开始代码修改”的授权落实为候选配置，实际安装/来源信任仍未完成。process_check算法和另外7个运行源码保持原字节，全部guard、flags/env/cwd/身份、v1结构和空subprocess清单不变。
- 6个测试文件同步目标：进程/bootstrap扩充旧3.12.3、相邻补丁、非final及旧/别名路径拒绝；source_loader漂移用例确认新token唯一命中且bytes实际变化；新增2个输入用例分别拒绝重新固定摘要的旧平台材料、旧request绑定混入新launch。request的实际字段为 `launchMaterialsSha256`，pins中的输入摘要字段是 `launchSha256`，两者未混用。
- CI在原Runtime/Release步骤后追加setup-python@v6（精确3.12.15、x64、update-environment=false）和通过其python-path输出执行的8个C1测试文件回归；先检查实际CPython版本/发布级别。原runner Python的完整Runtime/Release检查保留，无额外权限、pip依赖、跳过或continue-on-error。官方actions/python-versions清单可见3.12.15的Ubuntu22.04/26.04 x64构建，但没有下载安装或把CI构建当AWS来源证明；当前CI仍在26.04，不能替代真实Jammy验收。
- 修改ci.yml按既有selector可能触发全量lane，本批不改selector缩减或绕过门禁。
- 已生成 [九源清单与审阅归档记录](evidence/c1-prep11-python31215-source-review-2026-10-25.md)，2个运行源码变化、7个原字节。当前工作树未提交，故sourceCommit明确为空；最终准确源码head及其CI完成后再固定正式候选身份与批准材料，旧PREP-10/R1-A/S5证据保持原对象限定。
- 无owner/导入边/兼容路径/scanner baseline/17 Bundle、业务模块或数据库迁移变化。未运行项目测试或目标入口；只静态审阅语法/导入、配置一致性、差异/空白、摘要/归档和工作区状态。未安装解释器、执行Flow或进行维护/AWS/生产动作，尚未提交远端；C1继续OPEN。

**远端交付与CI续记（2026-10-25）：**用户已授权代码与此前文档一并远端交付及最终CI全绿后合并dev。[PR #2946](https://github.com/sanqin888/sanqinMVP/pull/2946) 首个源码head为 `802a0ae8e4c1e53b935bc5eacd950e9280853880`，19个文件包含原回执/审计全部新增文件。实际 [CI #7562](https://github.com/sanqin888/sanqinMVP/actions/runs/40166026342) 的ops-checks成功：Runtime848、Release45、精确CPython3.12.15回归203项通过；Browser E2E在Initialize containers拉取ECR Public PostgreSQL时连续返回Data limit exceeded，未进入测试，未记为E2E通过。最小修复只将CI服务镜像改为Docker Official Image上游 `docker.io/library/postgres:15-alpine`，保留同一标签、健康检查及全部测试门禁，不动业务/生产镜像或selector。修复head仍须实际CI全绿后合并，最终head/Checks/merge以PR事件为准；无需再次取得同分支CI修复授权。下一任务为 [PREP-12可信构建与交付](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)，本批只交接任务，尚未启动构建/安装，C1仍OPEN。
