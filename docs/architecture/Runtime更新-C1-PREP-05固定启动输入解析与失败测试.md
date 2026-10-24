# Runtime 更新 — C1-PREP-05 固定启动输入解析与失败测试

**2026-10-24（America/Toronto）｜REMOTE DELIVERY AUTHORIZED / 28 TEST METHODS AUTHORED / CI PENDING / INPUT HASH MATCH ONLY / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN。**

前批 [PR #2936](https://github.com/sanqin888/sanqinMVP/pull/2936) 最终 head `78f67dad2b9221f0f383321b0b8eea7b37663345` 的 [CI #7527](https://github.com/sanqin888/sanqinMVP/actions/runs/40140803220) SUCCESS（Runtime 715 / Release 45，含 PREP-04 的25项），squash 合并 dev `3c4823bf95672b8930990892cd253aad705754b2`。用户授权合并后继续；本批以该最新 dev 为基线，在独立缓存完成下一项输入边界。用户现已授权本批远端 PR→dev、最终 head CI 全绿后合并并开始下一步；发布复核 dev 仍为 `3c4823bf95672b8930990892cd253aad705754b2`，四份既有文档、launch/update、AGENTS 与 CI 的 Git blob 均未漂移，本批通过独立缓存/GitHub 插件交付。共享工作区的另一批 mTLS 文档/日志保持原样。

依据 AGENTS、实际 ci.yml、[R0 D1/§4.1](Runtime更新-R0冻结设计.md)、[C1 最小基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[候选装配](Runtime更新-C1候选入口装配与关键来源绑定方案.md)、[PREP-03](Runtime更新-C1-PREP-03受保护源码快照与失败测试.md) 与 [PREP-04](Runtime更新-C1-PREP-04源码目录锚点与失败测试.md)。未更改长期架构决策或执行权限。

## 1. 当前缺口与本批交付

现有 `normal_runtime_launch.py` / `normal_runtime_update.py` 可以生成规范文档并处理内存中的 LaunchMaterials / UpdateRequest；此前没有将外置 launch/request 原始字节严格解码回这两个 v1 类型的实现。PREP-03/04 负责源字节与路径观察，不能顺带证明启动输入正确。

本批新增 `ops/runtime/normal_runtime_inputs.py`，在任何 JSON 解码前先核对两个独立固定摘要，然后解析并重建现有类型，按其既有 document()/canonical() 对全部原字节精确回环比对。返回只读数据，不创建第二套执行协议、审批布尔模型或可运行流程。

## 2. API 与实际拒绝条件

`parse_pinned_update_inputs(launch_bytes, request_bytes, *, expected_launch_sha256, expected_request_sha256)` 返回 frozen `PinnedUpdateInputs(request, launch_bytes, request_bytes)`。request 为既有 UpdateRequest，内含既有 LaunchMaterials/SourcePin，不新增 v1 字段。

| 边界 | 实际处理 |
| --- | --- |
| 两份输入与 pin | 仅接受非空、固定上限的原生 bytes；摘要为非零64位小写 SHA256，并与原字节匹配；两份均通过才开始 JSON 解码，拒绝 mutable buffer/字符串或从输入内自取 expected pin |
| 编码与 JSON | 仅接受既有 canonical() 生成的精确 ASCII JSON 对象；拒绝 BOM/其他编码、重复键（含嵌套同值重复）、浮点/非有限数、过长整数、非对象/多文档和解码异常 |
| 规范与字段 | 重建既有类型后，将其全部规范文档与输入 bytes 精确比对；额外/缺失字段、空白/排序/转义差异、bool 与整数冒充不被静默规范化或默认填充 |
| launch | 复用现有 source pin/大小/数量/core/bootstrap/subprocess argv 校验；平台、解释器、sourceRoot、argv/env/cwd、uid/gid、entryPoint 及所有 false 声明必须与现 v1 文档完全一致 |
| request | 复用当前/目标 SHA、旧/目标 Archive digest 不同、应用/状态 pin、同 transaction 的约束；其 launchMaterialsSha256 必须精确绑定本次解析的 launch；固定 Runtime/存储目标与 upgrade 语义不变 |

launch 上限 1,100,000 bytes，覆盖现 v1 的64项源 pin及16×32×1024字符 argv（包括 JSON 转义最坏开销）；request 上限4096 bytes，覆盖现 v1 的全部固定字段。单个 JSON 整数 token 限20字符；实际有效字段继续受原类型更紧的范围约束。预算只限制输入解析，不是更新日志、子进程或真实执行资源保障。

该入口有意只接收已有 canonical() 的原 bytes；美化/重排虽可能代表相同 JSON 值，也不与已固定原件混同。未来操作员界面应在先验核验后明确生成并固定规范原件，本组件不从 argv/env、文件、网络或旧回执回退获取材料。

Python JSON 的重复键/数值 hook 与解析前大小限制机制按 [官方 json 文档](https://docs.python.org/3.12/library/json.html) 使用；这只说明 API 机制，不证明正式解释器或运行平台已验收。

## 3. 信任与执行边界

**摘要匹配只证明字节与 supplied pin 对应；pin 的独立可信来源仍由外部受控入口建立。** 同一个调用方换成另一组自洽字节和摘要仍可得到解析结果，这不认证发布来源、当前安装、目标 Archive、Host/namespace、解释器或关键依赖，也不授予任何效果权限。测试专门保留该事实，不输出新的 PASS/authorized 布尔声明。

本模块及其导入的 launch/update 在调用前已由解释器加载，解析动作不能自证这段启动前信任。PREP-03/04 后续与真正消费固定 bytes 的 bootstrap 如何连接仍 OPEN；本批没有 loader、源码编译/执行、CLI、真实平台探测、提权、目录安装、子进程或 NormalUpdateFlow 调用。

`currentArchiveDigest` 继续是现 v1 必填且与目标不同的摘要身份；本批不需要取得旧 Archive 原字节，也不验证该摘要的历史发布真实性。缺项/格式错误仍拒绝，不拿 Manifest、重打包或目标摘要填值。目标原 Archive、publish proof 和当前安装/状态的真实性由后续实际 admission/effect adapter 独立核验。

旧 v1 的 Python 3.12.3 / `/usr/bin/python3.12` 只是必须保持精确的提议字段；能成功解析不表示当前进程使用该解释器。R2 Jammy Python3.10.12 不自动成为本包平台，实际平台和来源仍待正式候选固定。

## 4. 28项测试与验证状态

`ops/runtime/tests/test_normal_runtime_inputs.py` 新增28个 unittest 方法，全部使用内存 JSON/合成 pin，fixture 源码只作为哈希材料，从不执行；不读真实 /root、Archive 或生产状态。

覆盖：精确回环至原类型/不可变返回且不调用 Flow；两 pin 在 JSON 前核验、错/零/异型 pin、mutable/非bytes、空/超预算、原字节变化；顶层/嵌套重复键、异常 JSON/根类型/编码/BOM/空白排序转义、浮点/非有限数/长整数/深嵌套；全部 launch/request 字段缺失及未知字段、平台/解释器/env/路径/身份/false 声明漂移、bool/int 混同、源 pin/清单/bootstrap/subprocess 错误；launch摘要和事务交叉绑定、同版/同 Archive/状态与存储目标守卫；旧摘要必填而无旧字节依赖；最大 argv 转义预算、自洽新 pin 不授信、输出不保留可变 dict、无 I/O/loader/CLI/Flow/第18成员。

本地只进行 AST/导入与调用边、基线摘要、差异/空白和补丁可应用性静态核对，没有执行模块或仓库 lint/build/test/扫描。**28项已编写/审阅，尚未运行**；前批 CI #7527 不覆盖本批新代码。后续远端交付须以实际 ci.yml 的 Runtime/Release 和最终 head 全部必需 Checks 为准。

## 5. 所有权、状态与下一步

本批为 Runtime/Ops 内部原子新增能力，当前只由测试消费；新增单向边 `normal_runtime_inputs → normal_runtime_launch / normal_runtime_update`，既有 update→launch 保留，无反向引用或新环。未改变跨上下文边/债务、12-context owner、部署单元/兼容、依赖/锁、CI、Prisma/migration、17 Bundle、原字段/guard 或 scanner baseline；未运行扫描器，不宣称重新计算生产依赖图。

同步 R0、C1总包、依赖图及原批次日志中的 PREP-04 最终CI/合并结果。本批已获远端交付授权，通过独立功能分支 PR→dev，待本批实际 Runtime/Release 及最终 head 全部必需 Checks，全绿后才合并。正式入口还需固定实际平台/解释器和关键来源、外部 pins/关键输入保护、从已核对字节实际加载同一核心、真实能力装配与必要验证；这些随 R2/R3/R4 准备推进，C1 最终跟随正式执行候选完成。**C1 OPEN / NO PRODUCTION AUTHORITY。**
