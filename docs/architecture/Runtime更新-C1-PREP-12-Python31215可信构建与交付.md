# Runtime 更新 — C1-PREP-12 Python3.12.15可信构建与交付

**2026-10-25（America/Toronto）｜PREP-12工具已合并 / MANUAL_MAIN_ENTRY_ALIGNMENT_LOCAL / SOURCE_VERIFICATION_NOT_RUN / BUILD_NOT_RUN / C1_OPEN。**

PREP-12工具已由 [PR #2947](https://github.com/sanqin888/sanqinMVP/pull/2947) 合并 `dev@d2fe275da39b67a4bbd5564863fd925810c0f606`；最终head `76de96050be5a8a38348b6e132d326346e6c0311` 的 [CI #7566](https://github.com/sanqin888/sanqinMVP/actions/runs/40187387143) 十项全绿（Runtime866 / Release45 / 精确CPython3.12.15回归203），新增18个工具测试已通过。dev合并提交的 [CI #7567](https://github.com/sanqin888/sanqinMVP/actions/runs/40187661795) 亦成功。当前用户选择整体dev→main方案以注册手动入口，本次仅完成本地工作流显示/说明与文档对齐；尚未提交本次修订、晋级main或运行构建。

以下为首批实施背景（当时的本地状态）：用户已授权启动本包修改。PREP-11 PR #2946最终CI #7563十项检查全绿并合并 `dev@bdfb25af7de88ecafbb17b1fda71b305e5cfd17c`。本批已在 `feat/runtime-c1-prep12-trusted-python-build-20261025` 本地实现验签/构建材料工具与手动隔离构建工作流；尚未下载、验签、构建或安装解释器，也未运行新测试。目标仍是取得**适配Ubuntu22.04/Jammy x86_64、来源可核验的CPython3.12.15交付产物**，继续向实际平台验收推进。

## 已确定的输入

- PREP-11 [PR #2946](https://github.com/sanqin888/sanqinMVP/pull/2946) 的最终head必须全部必需CI成功并合并dev后，才启动本包；以PR实际Checks/merge事件确定最终基线，不使用本包创建时的临时head冒充合并提交。
- 执行配置固定 **CPython3.12.15 final / Linux x86_64 / `/opt/sanq/python/3.12.15/bin/python3.12`**，沿用 `-I -S -B`、准确身份/env/cwd/argv、安全检查和false/BLOCKED守卫，无需重新询问版本选择。
- 操作者回执显示目标sanq-web为Ubuntu22.04.5 Jammy，现有系统包为3.10.12；旧 `/usr/bin/python3.12` 不存在。新路径的实际状态未采集，不能假定已经安装。
- PREP-11源码提交 `802a0ae8e4c1e53b935bc5eacd950e9280853880` 的Runtime848、Release45以及精确3.12.15回归203项已通过；其CI #7562在ECR拉取PostgreSQL测试镜像时阻断，Browser E2E未进入测试。最终全绿与合并状态仍以PR事件为准，旧CI不是Jammy正式解释器来源证明。
- 源码与审计材料见 [PREP-11](Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md)、[变更审计](Runtime更新-C1-PREP-11-Python31215变更审计.md) 及 [源码清单](evidence/c1-prep11-python31215-source-review-2026-10-25.md)；正式材料须对应最终选定的准确源码提交。

## 任务范围

1. 读取最新AGENTS、R0 D1/§4.1及PREP-11最终记录，核对实际dev基线、CI和9个源码字节。先确认可用的**隔离Jammy/x86_64构建环境**与交付路径条件，列出确有必要的构建工具/关键依赖；不在生产VM上直接安装编译工具或开始构建。
2. 获取官方3.12.15准确源包，以可信发布者身份/签名及准确摘要验真，再运行源码。发布页XZ摘要候选为 `c2c4321961fab0fb999d66e0cecf521c2ab3994c7992873ea99e306c1094fd5a`；发布页记录、下载摘要和可信签名各自能证明什么应区分。若有已签名且兼容Jammy的准确二进制候选，可以审阅替代构建路线，不默认信任第三方包或CI工具缓存。
3. 在已确认的隔离环境构建并暂存版本专属prefix，记录源包、必要构建环境/选项、产物、stdlib与影响安全/稳定的关键本地依赖之间的来源关联；固定交付包、逐对象摘要及目录/权限要求。按R0最小必要范围取证，不默认恢复全量动态闭包或重复无关旧实验。
4. 使用经上述核验的实际3.12.15产物执行必要离线回归，报告准确解释器、OS与源码提交。区分模拟进程测试、实际产物回归和真实路径bootstrap验收，不把前两者当作后者。归档应能安装到既定prefix，并在原五键env下满足启动条件；不靠修改PATH、额外LD_LIBRARY_PATH或链接包装器来掩盖问题。
5. 交付源码/构建来源记录、解释器包及摘要、回归结果和**准确生产安装/验收操作计划**，供用户审阅。涉及生产VM写入、系统包/服务变化或root交付时，明确目标、实际对象、恢复方式和授权范围，再执行获批动作。完成准确安装后才可进入真实Jammy的受保护输入及assembly-only bootstrap验收；不调用Flow或启动业务效果。

## 完成标准与边界

- 取得可复核的Jammy/x86_64 CPython3.12.15交付包与来源关联，准确路径/关键依赖/权限条件和必要离线回归有实际结果；发现缺项时准确列出阻断，不补造验签/构建/测试证据。
- 系统 `/usr/bin/python3` 保持由Ubuntu管理；无业务代码、数据库迁移、17 Bundle或默认服务拓扑变化。
- 不覆盖旧Noble/S5或PREP-10证据；匹配对象可复用，变化对象重新绑定。PREP-11的源代码CI不等于解释器构建来源通过。
- 本阶段构建产物就绪不自动关闭C1；正式交付、实际权限与启动前保护及同候选必要验收仍按R0完成。AWS快照、维护冻结、正式安装/业务效果权限不从版本选择或本任务文档推导。

## 新对话启动内容

继续SanQ C1-PREP-12：基于PREP-11 PR #2946最终合并状态，推进Python3.12.15可信构建与交付。版本与路径已经确定为CPython3.12.15 final及 `/opt/sanq/python/3.12.15/bin/python3.12`。先读AGENTS、R0及本包，核对最终dev和源码身份，确认隔离Jammy/x86_64构建环境；目标是验真源包、形成可交付解释器产物并取得实际回归结果。生产VM的软件安装、root交付、bootstrap运行和任何真实更新效果，按准确操作对象及原授权规则分别处理。不要重复版本比较，也不要把旧Noble取证或CI缓存当新解释器来源证明。


## 2026-10-25 实施记录与操作顺序

本地代码已完成，实际产物尚未生成。当前执行环境未确认是Jammy，也没有Docker；SanQ MCP不提供任意远程shell，不能借仓库工具在生产VM编译。采用GitHub托管 `ubuntu-22.04` 的手动工作流作为可审阅隔离构建路线，不要求生产VM先安装编译器。

| 文件 | 职责与边界 |
| --- | --- |
| `ops/runtime/c1_python_build_materials.py` | 非生产构建材料工具：Jammy/x86_64非root托管环境、固定repo/dev和准确源码提交检查；SHA256与GnuPG发布者核对；固定bytes安全解包；stage清单、关键动态库字节/Ubuntu包归属、交付归档及全材料SHA256SUMS |
| `ops/runtime/tests/test_c1_python_build_materials.py` | 新增18个离线测试方法，覆盖环境/身份/提交拒绝、完整主密钥/签名状态、过期/撤销/弱摘要、多签名、hash前置拒绝、GPG失败不解包、不安全归档/链接/权限、动态库缺失/无归属、归档字节及false权限；已随PR #2947的Runtime回归通过，Jammy构建job尚未运行 |
| `.github/workflows/c1-python31215-build.yml` | 仅 `workflow_dispatch` 且仅dev；contents:read、checkout不持久化凭据。在一次性22.04 runner准备依赖、验真源包、构建/DESTDIR暂存、实际产物smoke与C1回归，成功后上传审阅材料；失败只上传日志 |

### 固定来源与信任前提

- 源包：`https://www.python.org/ftp/python/3.12.15/Python-3.12.15.tar.xz`，SHA256仍为本包已列出的准确值；签名候选为同URL加 `.asc`。
- Python官方[OpenPGP元数据](https://www.python.org/downloads/metadata/pgp/)将3.12源文件签名归Thomas Wouters，链接公钥为 `https://github.com/Yhg1s.gpg`。代码固定完整主指纹 **`7169605F62C751356D054A26A821E680E5FA6305`**，不把短key ID/GOODSIG姓名当身份。公钥允许正常自签名/有效期更新，但主指纹不得自动改变。
- 验真同时要求源包准确SHA256、GnuPG退出成功、唯一VALIDSIG归属准确主密钥（允许其签名子密钥）、现代SHA256/384/512，以及无过期/撤销/错误状态。没有hash/key/version/安装路径的CLI覆盖选项。原始源包、签名、公钥随成功材料保留，供离机复核。
- 声明的有限信任前提包括审阅后的仓库工作流、GitHub托管builder、系统Python/GnuPG/编译工具及Ubuntu APT信任。构建receipt和归档SHA只绑定实际观察与字节，不递归证明builder/内核，也不能自己授予生产信任。独立于本批的旧Noble采集器保持原用途，不将其扩展成Jammy/CPython源包认证工具。

### 受控构建与材料

1. 首次远端交付仍需按AGENTS经用户审阅授权；PR的常规CI将通过既有Runtime测试发现机制执行新增18个方法。没有修改selector或旧CI门禁，新workflow文件按原规则可能触发全量CI。
2. 用户采用整体dev→main晋级，使仅手动工作流进入默认分支main并注册入口；仅合并dev不能保证出现网页Run workflow按钮。本工作流仍不在PR、push、schedule或workflow_run自动下载/编译。晋级后在Run workflow选择dev；job及工具都要求refs/heads/dev，选择main不会执行build。运行标题显示分支和完整源码SHA；实际材料仍以准确run/attempt、checkout SHA及工作流版本核对。
3. runner先核对Jammy/x86_64、非root、托管环境及repo/dev；仅在一次性runner安装必要工具/开发库。源包先核hash和签名，再完整预检归档成员，最后从固定bytes解包；任何失败不生成成功receipt。
4. 固定 `--prefix=/opt/sanq/python/3.12.15 --with-ensurepip=no CC=/usr/bin/cc`，make并发2；`make altinstall DESTDIR=<runner临时目录>/stage` 不写runner或生产机的真实目标prefix，也不替换系统python3。暂存解释器用原五键env与 `-I -S -B` 做版本/flags/stdlib smoke，再用它运行现有8个C1测试文件；新增工具测试先在Jammy宿主Python上执行。
5. 记录configure/config.log、编译/altinstall日志、必要构建包完整版本、真实stdlib关键后端、解释器及选定扩展模块ldd结果。关键非虚拟动态库必须存在，取得准确文件SHA256及Ubuntu包归属/版本；未知来源对象阻断并专项审阅，不静默省略或启动全量消费追踪。
6. 暂存清单拒绝外逃/绝对符号链接、硬链接、特殊文件和组/其他可写对象；安全内部相对链接可保留。归档元数据归一为root不代表实际安装owner已认证。产物及原始来源材料、日志、成员清单和SHA256SUMS仅在全部步骤成功后上传，保留14天；失败日志保留7天，应在实际运行后及时取回准确产物并建立长期证据引用。

### 当前状态与剩余门禁

**实际源包下载/验签、Jammy构建、真实产物回归和交付包均NOT_RUN。** 新增18个工具测试已在PR #2947 CI通过，不能替代Jammy构建job。本次入口对齐仅做YAML、内嵌shell、仅手动触发/仅dev守卫和差异静态审阅；未运行本批项目测试、CI或构建。

真实安装仍不在本批代码中。取得成功材料后，须审阅准确CI run/attempt、源码SHA、源签名/主指纹、构建信任前提、关键依赖、归档摘要/成员/权限，再给出生产VM准确安装计划。重点包括目标目录是否存在、完整祖先owner/mode、与Jammy库版本的实际匹配、失败清理/恢复和系统Python保护。未获对应生产授权前，不解包到 `/opt`、不写root批准目录、不运行正式bootstrap或Flow。

本批归Runtime/Ops；无生产启动入口、安装器、业务/数据库迁移、17 Bundle或跨上下文依赖变化。构建工具→标准库以及测试→构建工具均为同owner关系，不扩张normal_runtime源码装配清单或现有9文件候选。PREP-12与C1继续OPEN，构建代码完成不等于可信交付已验收。


### 2026-10-25 整体晋级与手动运行流程（本地对齐）

用户已选择整体dev→main方案，撤回尚未提交的dev限定push自动构建修改。仅保留workflow_dispatch，新增运行标题标识分支及完整SHA；Ubuntu22.04、版本/路径/源包摘要/发布者指纹、contents:read、回归、DESTDIR和false权限保持原合同。无normal_runtime源码、构建工具算法、17 Bundle或数据库改动。

1. 本批修订先经审阅、授权远端交付及实际CI进入dev；按仓库规则，整体dev→main晋级另由用户控制，不在本批自动执行。
2. 晋级前复核准确两端SHA、差异与实际合并结果CI。当前只读审计为main `ef5caa32704dd59217b1151a5976e826c843c98f`、dev `d2fe275da39b67a4bbd5564863fd925810c0f606`，dev比共同基线多183提交、树差异386路径；main独有一条历史合并记录，树与共同基线一致。后续提交会改变这些数字，不将此审计当未来合并CI。
3. 整体晋级会带入支付/POS等改动及4份新增迁移；main push CI成功还会触发publish-images，发布API/Web镜像、成对证明和Runtime Bundle。现有17成员中deploy_release.py、release_contract.py相对main有变化；发布成功不代表已安装Runtime或生产迁移/部署就绪，生产DB实际应用状态未在本次核验。仓库审阅未见自动连接生产部署步骤。
4. main具备工作流后，进入GitHub Actions→C1 Python 3.12.15 isolated build→Run workflow→选择dev→运行。记录准确dev SHA、run ID/attempt，等待验签、构建、实际产物smoke及回归全部成功。
5. 成功下载 `c1-python31215-jammy-review-<SHA>`（14天）；失败读取 `c1-python31215-failure-<run_id>`（7天），先查失败步骤，不绕过校验。审阅原始来源/签名、摘要、关键库归属、归档清单与权限后，另行制定生产安装计划。当前仍未生成可信解释器交付包，不关闭PREP-12或C1。
