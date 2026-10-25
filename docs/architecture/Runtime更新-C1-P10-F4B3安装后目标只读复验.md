# Runtime 更新 — C1 P10-F4-B3 安装后目标独立只读复验

**2026-10-25 F4-B4：DESIGN_COMPLETE_LOCAL / HISTORY_IMPLEMENTATION_NOT_STARTED / C1_OPEN。** F4-B3 [PR #2964](https://github.com/sanqin888/sanqinMVP/pull/2964)经[CI #7606](https://github.com/sanqin888/sanqinMVP/actions/runs/40233916932)成功合并9434ab69：Runtime973/Release45/准确3.12.15回归305，含23新增测试；仅修正重排Manifest测试夹具，生产实现未改。本批完成[多事务历史/崩溃协议设计](Runtime更新-C1-P10-F4B4多事务历史与崩溃协议设计.md)：提出固定v2只追加有界历史、永久消费、双布局共同门禁、未知写入/处置声明不放行；下一源码限定真实FD/锁下的只读历史解释器，无writer/finalizer/入口切换。本批7份文档，无新schema/源码/依赖/迁移、R2/root/VM/云/生产动作，无owner/依赖图/债务/scanner基线变化，未运行新测试/CI、未推送。

**2026-10-25｜MERGED_DEV / CI_VERIFIED_OFFLINE / READ_ONLY_POSTINSTALL_SCOPE / C1_OPEN。**

基于dev `2240f5e0e0ec19faaf69f28deb2480b9edc116e6`。F4-B2 [PR #2963](https://github.com/sanqin888/sanqinMVP/pull/2963)最终head `28a6478b10cf2ed6c29d8b3db0af97a7435fdf0a`经[CI #7603](https://github.com/sanqin888/sanqinMVP/actions/runs/40232899946)成功，docs-only范围作业成功、9作业跳过，无CI修复；该CI未运行Runtime测试。本批在feat/c1-p10f4b3-postinstall-review-20261025实现。最终head39e98077583610a78416ec303c4589022d09a3c2由PR #2964经CI #7606（run40233916932）成功合并dev9434ab6956c9f3d0b8276b9beb26ac8707381bce：4作业成功/6按范围跳过，Release45/Runtime973/准确CPython3.12.15回归305全部通过，包含23新增测试。CI #7605的唯一失败是重排Manifest测试实际生成原样bytes；39e98077改用compact JSON并显式核对语义相同/字节不同，未改生产实现或削弱断言。

## 1. 实际能力与归属

新增ops/runtime/normal_runtime_postinstall_review.py及23项离线聚焦测试。Runtime/Ops拥有此只读库；它不接Flow、事务消费/终结、维护、Docker、AWS或业务放行。

唯一入口review_fixed_installed_target(launch_bytes, request_bytes, *, expected_launch_sha256, expected_request_sha256, target_archive, preserved_observation, fetch=github_json)。无CLI、任意root/path/owner/FD或permission参数；网络沿用原GitHub只读GET验证依赖，不增加包。

保留**原canonical v1 launch/request及其独立双pin**。请求currentRuntimeSha和currentArchiveDigest仍为原Runtime，targetRuntimeSha/targetArchiveDigest仍为原批准目标。不能把current改成target再重新批准一份输入来绕过安装后语义。

## 2. 来源、路径和字节核对

1. 解析原双pin输入与原保留观察：准确schema/scope=READ_ONLY_BOOTSTRAP、权限false，当前Runtime/应用current/previous身份与原request一致。原runtimeManifestSha256必须是有效非零摘要；它记录旧Manifest基线，**不要求与安装后的目标Manifest相等**。
2. 复用F3固定/opt/sanq/runtime当前namespace祖先FD；在网络请求前，复用F2有限树读取并持有准确17成员、Manifest、三动态文件及目录/路径边。安全owner/mode、单设备/单链接、有限成员与大小检查仍适用；所有自有FD在成功/异常后关闭。
3. 原target_archive必须immutable且有界，沿用未放宽的newest发布验证，核对verified/sourceSha/Runtime Archive摘要及productionActivationAuthorized=false与原批准request。旧目标不再newest则拒绝，无历史fallback或自动改目标。
4. 从同一已验证原Archive取17成员及原Manifest raw bytes；保持既有layout验证。实际安装Manifest必须原字节完全一致，17文件逐个与Archive原bytes一致。语义相同但重新格式化的Manifest也拒绝；本机Manifest+文件联合伪造不能代替Archive发布来源。
5. 三动态文件实际bytes/sha256/uid/gid/mode必须与原独立pin的观察完全一致；state必须schemaVersion为准确int1、phase=active、应用current/previous未变；.env仅一条准确SANQ_IMAGE_SHA，marker仍准确值。复用既有校验，不输出.env原文。
6. 网络与比对结束后，有限树与固定祖先均完成FD/stat/entry/name复核，才返回报告。网络期间替换同字节文件、交换目录边或安全属性漂移都拒绝。

本入口验证的是“点时安装对象恰好为原批准target，且三动态对象仍匹配原pin”；没有旧Archive原bytes前置条件，也不额外拉取旧源码。保持原安装前F2语义：F2仍验证current真实发布/17成员，并要求旧观察Manifest匹配当前旧Manifest。

## 3. 共用检查的最小整理

normal_runtime_readonly_review.py仅抽出两个私有函数：

- _pinned_observation：原观察双pin/schema/身份/false声明校验。
- _preserved_state：三动态metadata、state、env、marker校验。

F2保留原current Manifest摘要核对，再调用同一动态检查；原公开API、报告字段、发布来源和错误拒绝语义不变。postinstall调用这些检查时，独立要求安装Manifest等于原目标Manifest，不把旧观察Manifest当新目标。原19项F2测试继续由CI执行，新测试另包含同一原request的安装前/安装后成功路径对照。

依赖方向为postinstall→既有只读F2/F3、输入/发布/Bundle；同为Runtime/Ops，无跨上下文债务、循环、owner或scanner基线变化。F3仍单向依赖F2，F2不反向导入postinstall。

## 4. 报告的明确上限

报告status=TARGET_AND_PINNED_PRESERVED_BYTES_MATCH，关联原request/launch摘要、原current身份、原批准target Archive、安装Manifest摘要、旧观察Manifest摘要及三动态metadata，不包含秘密原bytes。

targetInstalledBytesMatch、preservedBytesMatchPinnedObservation、applicationIdentityBytesMatch、fixedRuntimePathBound=true，仅表示本入口实际核对的点时字节/路径事实。

以下均false/BLOCKED：源码执行来源/当前root namespace真实性、冻结基线真实性、容器观察/实际存储挂载、持续维护、真实HANDOFF、原策略恢复、业务放行、R2处置、事务准入/终结、Flow、readyToInstall、authorizedToMutateProduction。它不是StepCompletion或可消费的终结许可。

特别是原C1观察仍是READ_ONLY_BOOTSTRAP历史输入。即使字节匹配，也不把它升级成冻结后现场采集，不证明Docker的应用镜像、实际DB volume/uploads bind/compose project、R2终态或发生过安装效果。未来可信组合器与finalizer必须另外取得并认证这些证据；不能从本报告的status推定可删除active。

## 5. 验证与剩余工作

新增23项测试，使用原F2发布fixture与独立临时固定路径namespace、真实FD树，全部网络为既有GET fixture。覆盖：

- 正确target/原Manifest/三动态字节与固定路径、原request未改、无秘密/效果权限、只读不改文件。
- 原F2安装前语义、旧Runtime未交接、文件损坏、语义相同重排Manifest、本机联合伪造。
- 错外部pin、mutable/损坏/错摘要Archive、非newest/发布失败/网络不可达。
- 保留pin/原bytes漂移、pending/previous/schema布尔、重复env/错marker、观察scope/身份/伪维护声明及坏旧Manifest pin。
- 文件link/FIFO/多余成员/危险权限、网络期间同字节替换/祖先替换、坏祖先、成功和失败FD关闭、无公开路径/owner覆盖。

已完成3份Python源码/测试AST静态解析、F2提取差异与失败路径审阅；MCP-workspace未运行项目测试。授权后的GitHub Actions最终head已实际通过Runtime973/Release45/准确CPython3.12.15回归305，含23项新增测试；无工作流或skip变更，不代表真实生产安装/冻结验收。

下一步先远端交付并核对最终head的F2/F3及新增测试。之后推进多事务历史布局/崩溃协议和可信组合；冻结基线的独立采集、实际维护/策略恢复/业务放行/R2终态与终结器仍未完成。本批未运行新解释器、未观察/变更实际AWS或生产Runtime，未创建root锁/ledger，不重用旧现场观察作fresh证据。九源/v1/固定17 Bundle、依赖与数据库不变，P10-F/C1仍OPEN。
