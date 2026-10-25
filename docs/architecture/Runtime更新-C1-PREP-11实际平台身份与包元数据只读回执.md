# Runtime 更新 — C1-PREP-11 实际平台身份与包元数据只读回执

**2026-10-24批次（America/Toronto）｜PYTHON3.12.15 PROFILE IMPLEMENTED_LOCAL / SOURCE_OPS_VERIFIED / FINAL_CI_PENDING / INTERPRETER PROVENANCE OPEN / C1 OPEN。**

本批接续 PREP-10 合并后的下一步 P10-B，核对选定AWS正常执行主机与现v1的Python3.12.3假设。现已收到P11-01～07两份操作者粘贴回执：[001](evidence/c1-prep11-aws-platform-receipt-001-2026-10-24.md)、[002](evidence/c1-prep11-aws-platform-receipt-002-2026-10-24.md)。观察为Ubuntu22.04.5 Jammy/x86_64；指定Python3.12包及 `/usr/bin/python3.12` 缺失，PATH可见 `/usr/bin/python3.10`，三个版本化包为amd64、`3.10.12-1~22.04.18`、installed。用户现已明确选择Python3.12.15，完成 [相关变更审计](Runtime更新-C1-PREP-11-Python31215变更审计.md)；用户随后授权实施，现源码已固定3.12.15及版本专属路径，相关测试和精确版本CI步骤已更新但未运行，见§11。实际解释器来源/产物、安装与Jammy验证仍OPEN。

## 1. 已完成的前批与本批边界

- [PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944) 已 squash 合并 `dev@17188367684a155b7217881d695c8c615589e940`；最终 head `35e2150f3d13db0746b31f67a91df2d9b29050a2` 的 [CI #7558](https://github.com/sanqin888/sanqinMVP/actions/runs/40151007839) SUCCESS。本批是基于该 dev 的 `docs/runtime-c1-prep11-platform-receipt-20261024` 本地文档工作。
- PREP-10 的原 JSON 路径曾按现有未知路径规则触发全量 lane；CI #7556 的 Browser E2E 在 ECR 拉取 PostgreSQL 镜像时被 `Data limit exceeded` 阻断，未进入测试。仓库记录随后改为供人工审阅的 Markdown 视图，包内原JSON及摘要保留，CI/selector未改；修复后 #7557 和最终 #7558 均按原文档规则通过，Runtime等重lane正常跳过。
- 外置九文件源码继续固定为 `b7b7f27682700447d37bcdabd456f22087a54892` / [PREP-10清单](evidence/c1-prep10-source-inventory-2026-10-24.md)，不因本次文档 commit 改变操作器源码身份。当前本地源码已按§11切换3.12.15；旧b7b7/本包历史身份不变，未运行bootstrap或Flow。
- 已读根 AGENTS、R0 D1/§4.1、PREP-09/10、相关CI规则及现有MCP实现；本批无运行代码、依赖/锁、CI、数据库/迁移、owner/导入、17 Bundle或权限变化。普通账号只读查询不涉及root交付或启动业务；后续root安装/运行按原准确对象门禁。

## 2. 当前连接能取得的事实

现有 `SanQ VM MCP.system_status()` 只执行时间、uptime、free、df和两个服务状态查询；仓库 `read_file` 只允许读取配置的仓库目录。当前没有读取 `/etc/os-release`、dpkg元数据或 `/usr/bin/python3.12` 对象的接口，也没有通用远程shell。核对了 `ops/sanq-mcp/server.py::system_status` 与工具描述，未修改MCP服务或绕过路径限制。

因此这批现场回执由操作者在**该AWS VM的现有终端**取得。使用普通账号即可，无需sudo；确认当前终端连接的是选定的正常执行主机。保留命令、完整stdout/stderr和各自RC；若目标不符或系统报告缺项，回传实际结果，不安装/修复软件、不切换解释器或别名。

## 3. 第一批准确命令（已收到操作者回执，保留追溯）

以下是已交付并收到回执的查询；无需重复执行。各条独立执行，RC标记紧随对应命令。没有读取密钥、环境文件、业务数据或DB，没有运行目标Python，没有网络、服务策略或安装变更。

```bash
/usr/bin/uname -snrm
printf 'P11-01_RC=%s\n' "$?"

/usr/bin/cat /etc/os-release
printf 'P11-02_RC=%s\n' "$?"

/usr/bin/dpkg-query -W -f='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n' python3.12-minimal libpython3.12-minimal libpython3.12-stdlib
printf 'P11-03_RC=%s\n' "$?"

/usr/bin/dpkg-query -S /usr/bin/python3.12
printf 'P11-04_RC=%s\n' "$?"

/usr/bin/stat -c 'path=%n type=%F uid=%u gid=%g mode=%a bytes=%s links=%h device=%d inode=%i' /usr /usr/bin /usr/bin/python3.12
printf 'P11-05_RC=%s\n' "$?"
```

GNU `stat` 这里没有使用 `-L`：遇到符号链接时保留该目录项的类型，不把跟随后的文件静默当作原路径。上述命令是普通读取及打印RC，不包含 chmod/chown、sudo、APT安装、Python执行、源码交付或业务操作。

## 4. 回执如何使用

| 回执 | 本轮能确认 | 仍不能确认 |
| --- | --- | --- |
| P11-01 | 操作者所见的节点名、Linux内核与机器架构；与选定目标进行人工对应 | 云实例身份的独立认证、解释器来源或运行权限 |
| P11-02 | 操作者所见的发行ID、版本、codename | OS全部文件来源、当前Ubuntu包签名/成员字节一致性 |
| P11-03 | 三个Python相关包的实际完整Version/Architecture/Status；缺项与非零RC如实登记 | 不能只凭3.12.3前缀或本地包数据库认证已安装字节 |
| P11-04 | `/usr/bin/python3.12` 在本地包数据库中的归属，或无归属/错误 | 该文件真实字节和签名deb成员相同、未来消费对象不变 |
| P11-05 | `/usr`、`/usr/bin`、解释器目录项的类型、UID/GID、mode、大小、链接数与设备/inode观察 | 持续路径保护、FD消费绑定、完整祖先或平台可信性 |

本轮不先执行待认证的Python来取得它自己的版本/模块自报。收到准确metadata后，按真实发行/架构/revision筛选已有Ubuntu来源证据，必要时仅补关键差异；再明确要读取校验的实际文件与可信包成员。内建/冻结模块与磁盘成员分开登记，不按假设文件名声称已经消费，不默认启动全量ELF/动态闭包追踪。

遇到发行/架构不符、包revision缺失、文件归属不明、别名或对象类型异常时，先如实审阅差异，不从旧实验外推、不把调整安装/路径当本轮读取的一部分。

## 5. 状态与下一动作

| 项目 | 本地当前状态 |
| --- | --- |
| 七条查询及RC标记 | 已收到操作者P11-01～07回执，RC依次0/0/1/1/1/1/0；助手未远程执行 |
| 操作者粘贴回执 | **RECEIVED_FORMATTED_TEXT**；原始stdout/stderr文件与现场时间未提供，未伪造为原件 |
| Ubuntu/架构/包revision/路径 | **OPERATOR_REPORTED Jammy22.04.5/x86_64**；系统版本化包已识别为amd64 `3.10.12-1~22.04.18`，PATH列出 `/usr/bin/python3.10`；未认证该路径归属、链接/字节和关键来源 |
| Python目标与实现 | **PROFILE_IMPLEMENTED_LOCAL**：3.12.15 final及 `/opt/sanq/python/3.12.15/bin/python3.12`；实际产物来源、安装与验证OPEN，见§11 |
| root源码/批准输入交付、bootstrap只读实测 | 未执行，保持PREP-10原门禁 |
| C1 | **OPEN / PROFILE_LOCAL / CI_NOT_RUN / PROVENANCE_AND_INSTALL_OPEN**；旧源码CI/九文件记录不升级为新候选或现场可启动 |

已同步R0、C1总包、PREP-10工作包、依赖图和工作日志。纯文档本地批没有新增测试，未运行仓库test/scanner，未远程执行目标命令；静态核对命令路径/参数、文档链接/差异/空白和工作区状态。尚未提交远端；按首次本地交付规则停在审阅阶段。

**下一动作是本地审阅后按授权完成远端CI，并落实准确解释器产物来源/交付与Jammy必要验证；当前候选保持阻断。** 这批现场查询与后续root交付/运行、维护/AWS/安装分别记录，不用版本选择、文档CI或无关服务健康替代。

## 6. 回执001的实际结论与合同影响

| 对象 | 回执事实 | 本轮结论 |
| --- | --- | --- |
| 主机/内核/架构 | `sanq-web / Linux / 6.8.0-1061-aws / x86_64`，P11-01 RC0 | 与现v1的Linux/x86_64声明对应；不单凭节点名认证云实例 |
| 发行 | `Ubuntu22.04.5 / jammy`，P11-02 RC0 | 不能直接以Noble平台的Python/包成员证据认证本机；仅复用实际仍匹配的准确对象 |
| 指定三个3.12包 | 全部no packages found，P11-03 RC1 | 没有取得这些包的revision；不能把之前的3.12.3选择当已安装事实 |
| 解释器包归属 | `/usr/bin/python3.12` no path found，P11-04 RC1 | 该路径没有本地包数据库归属记录 |
| 路径 | `/usr`、`/usr/bin`均root:root/0755；解释器路径No such file，P11-05 RC1 | **现v1目标解释器路径不存在，当前候选无法按声明启动**；两条目录metadata不证明完整来源或持续路径保护 |

三个RC1是明确的缺项结果，不作为需要“重跑到0”的采集失败。单凭回执001不能断言整机、其他安装路径/venv或容器都没有3.12，也不能识别系统Python的具体版本；系统版本化包随后由回执002识别，见§8。

源码核对：`normal_runtime_launch.py`固定`INTERPRETER=/usr/bin/python3.12`及`pythonVersion=3.12.3`，启动argv来自它；`normal_runtime_process_check.py`核对该声明的解释器/版本/flags；`normal_runtime_bootstrap.py::_require_process`也固定同一路径、3.12.3 final与相同flags。改PATH/alias或借用另一个Python不能自动满足当前合同。若后续调整解释器版本/路径，需要说明对v1序列化、pins、进程核对、bootstrap及同候选测试/验收的影响和替代方案，按用户规则获明确授权后再改；本轮不改代码、不补装、不建链接或替换系统Python。

## 7. 第二批最小只读查询（已收到回执002，保留追溯）

以下查询已由用户回传结果，无需重复执行。读取可用路径及系统Python相关包的实际记录，无需sudo，不执行解释器；不安装软件，也不据输出自动切换候选版本。

```bash
type -a -P python3 python3.10 python3.12
printf 'P11-06_RC=%s\n' "$?"

/usr/bin/dpkg-query -W -f='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n' python3 python3-minimal python3.10-minimal libpython3.10-minimal libpython3.10-stdlib
printf 'P11-07_RC=%s\n' "$?"
```

`type -a -P`只列PATH中可执行文件路径，不调用这些文件；这仍不是完整磁盘搜索或版本认证。以下§8～9保留收到回执后的影响与备选方案；当前用户选择以§10的3.12.15为准。现v1代码和全部guard尚未修改，版本选择不等于主机安装/运行授权。

## 8. 回执002与现有代码的准确影响

| 对象 | 观察或源码事实 | 影响 |
| --- | --- | --- |
| PATH查询 | 列出 `/usr/bin/python3`、`/bin/python3`、`/usr/bin/python3.10`、`/bin/python3.10`，无python3.12，P11-06 RC1 | 至少一个请求名称未找到；不能解读为所有名称失败，也不证明四套独立安装或整机没有其他3.12 |
| 版本化包 | python3.10-minimal、libpython3.10-minimal、libpython3.10-stdlib均amd64、`3.10.12-1~22.04.18`、installed；P11-07 RC0 | 已有明确Jammy系统解释器包候选；包数据库不能代替文件归属/可信包成员比对 |
| 通用包 | python3、python3-minimal为 `3.10.6-1~22.04.1` | 这是通用包版本，不能据此称解释器为3.10.6 |
| launch及批准输入 | launch固定路径、3.12.3及派生argv；inputs按现行canonical字节核对 | 选择3.10需同步变更准确平台配置；launch及批准材料摘要、双pins必须按新字节生成，旧pins不能沿用 |
| process_check与bootstrap | 两处直接读取 `sys.flags.safe_path`，bootstrap另固定3.12.3 final、路径及批准平台 | CPython文档注明safe_path从3.11才加入；当前代码不能原样运行于3.10。必须明确适配已批准的3.10配置，不能用通用hasattr/跳过缺项来接受任意版本 |
| 九文件源码与同候选证据 | PREP-10固定b7b7的九源及已测源码头；当前进程测试使用明确模拟观察 | 若改代码，需重定源码blob/SHA256/候选归档、更新相关fixture及失败测试，并做选定平台必要验证；其他版本CI和旧包不能证明新3.10候选通过 |

Python3.10仍提供 `-I -S -B`。若选系统解释器，适配应保留隔离、忽略Python环境、禁site/用户site、禁pyc、禁止优化、准确argv/orig_argv、五键env/cwd及root身份核对；对3.10缺少safe_path属性的情况，使用经明确评审的3.10专用观察与必要的sys.path拒绝检查，不能删除安全目标或把缺项默认为真。具体实现先由用户批准版本/合同变化，再按本地审阅和CI流程交付。

来源支持范围也要单独说明：Ubuntu [USN-8744-1](https://ubuntu.com/security/notices/USN-8744-1) 列出Jammy Python3.10修复revision `3.10.12-1~22.04.18`，与回执的版本字符串对应；这不是本机签名/成员字节或全部当前漏洞已修复的证明。CPython上游3.10已于2026-10-01结束支持，而Ubuntu22.04标准安全维护到2027年5月，不能混为同一支持承诺。选3.10应明确依赖Ubuntu维护构建及其窗口，不以裸上游3.10.12作为长期无期限基线。

官方依据：[sys.flags变更记录](https://docs.python.org/3.11/library/sys.html#sys.flags)、[Python3.10启动参数](https://docs.python.org/3.10/using/cmdline.html)、[CPython版本生命周期](https://devguide.python.org/versions/)、[Ubuntu发布周期](https://ubuntu.com/about/release-cycle)。资料核查仅支持上述API/维护范围判断，不替代现场验真。

## 9. 选择前的平台备选方案（历史，当前以§10为准）

| 方案 | 准确范围与代价 | 建议 |
| --- | --- | --- |
| A：沿用现有Ubuntu解释器 | 候选改为Jammy/x86_64、`/usr/bin/python3.10`、CPython3.10.12、Ubuntu revision `3.10.12-1~22.04.18`；适配启动/进程核对、更新pins/源码包/测试，再验证对应来源和同平台候选。无需安装解释器或替换系统python3；后续Ubuntu revision变化须按准确对象重新核对 | 当时针对当前Jammy主机、以最小主机改动推进C1的建议；标准安全维护窗口至2027年5月，之后的维护/平台方案需另行确定 |
| B：准备独立较新解释器 | 用户另选仍受维护的准确版本、绝对路径和可信发行/构建来源，再审安装与关键依赖、启动前保护、源码候选及同平台验证；不替换系统python3 | 适合需要更长维护周期的基线；新增交付/来源验证工作，当前不存在可直接认证的目标对象 |
| C：保持现3.12.3合同 | 当前v1及全部已有源码保持原样，另行确定是否存在满足合同的安装/准确目标；现路径不存在，不能推进现场bootstrap | 保持当前阻断状态，不把此前版本选择当安装授权 |

以上是用户选择前的备选方案；用户随后明确采用3.12.15，对应B的准确版本选择，A不再是当前推荐执行目标。版本授权、远端交付授权、主机安装/运行和正式效果授权按各自范围处理；本批未提交远端，C1保持OPEN。

## 10. 用户选择与审计阶段记录（2026-10-24）

用户明确采用Python3.12.15，并要求进行相关变更审计。[审计报告](Runtime更新-C1-PREP-11-Python31215变更审计.md) 已按 `dev@32963a0c` 读取9源码、8个对应测试、AGENTS和CI：必改launch/bootstrap两源码，process_check从document派生目标值可保留算法；6个测试文件存在版本或路径相关预期，其中source_loader的源码替换负例须确保实际命中。现有v1结构、owner/依赖边、17 Bundle及全部false/BLOCKED守卫保留，需重新固定新候选源码/输入/摘要/归档。

官网3.12.15是仅源码发布；具体兼容Jammy的可信构建/产物与绝对路径仍待落实。建议并行版本目录 `/opt/sanq/python/3.12.15/bin/python3.12` 是待审方案，不是已安装或已冻结事实。现源码仍固定3.12.3；本轮只完成文档审计，没有改Python/测试/CI、下载构建或安装/执行解释器，也未推送。下一步直接落实具体交付配置及源码适配，不重复询问已明确的版本选择，不以审计完成关闭C1。

## 11. 按审计实施（2026-10-25，本地待审）

用户已授权开始代码修改。最新dev `32963a0c` 上的 `feat/runtime-c1-python31215-20261025` 保留原9份回执/审计文档及并行R2日志，现已修改两源码和6个测试文件，新增2个输入绑定负例及精确3.12.15 CI步骤；实现细节见 [审计§9](Runtime更新-C1-PREP-11-Python31215变更审计.md)。代码中的解释器路径已固定为 `/opt/sanq/python/3.12.15/bin/python3.12`，实际产物尚未构建/安装或认证。

[新九源审阅快照](evidence/c1-prep11-python31215-source-review-2026-10-25.md) 明确未提交和 `sourceCommit=null`，不作为批准输入。旧PREP-10归档不改；最终源码head/CI后再固定对应来源身份和launch/request/pins。项目测试未在MCP-workspace或缓存中运行，无Flow/主机/安装/维护/AWS/生产操作，未推送，C1仍OPEN。

**远端交付与CI续记（2026-10-25）：**用户已授权代码与此前文档一并远端交付及最终CI全绿后合并dev。[PR #2946](https://github.com/sanqin888/sanqinMVP/pull/2946) 首个源码head为 `802a0ae8e4c1e53b935bc5eacd950e9280853880`，19个文件包含原回执/审计全部新增文件。实际 [CI #7562](https://github.com/sanqin888/sanqinMVP/actions/runs/40166026342) 的ops-checks成功：Runtime848、Release45、精确CPython3.12.15回归203项通过；Browser E2E在Initialize containers拉取ECR Public PostgreSQL时连续返回Data limit exceeded，未进入测试，未记为E2E通过。最小修复只将CI服务镜像改为Docker Official Image上游 `docker.io/library/postgres:15-alpine`，保留同一标签、健康检查及全部测试门禁，不动业务/生产镜像或selector。修复head仍须实际CI全绿后合并，最终head/Checks/merge以PR事件为准；无需再次取得同分支CI修复授权。下一任务为 [PREP-12可信构建与交付](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)，本批只交接任务，尚未启动构建/安装，C1仍OPEN。
