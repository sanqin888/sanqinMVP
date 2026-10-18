# C5-G2 B02-B4B-3A — Python 依赖闭包清单契约（第一批）

> **R0 现行口径（2026-10-17 Toronto）：**用户已批准 D1–D5 推荐方案；[Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 统一当前决策、门禁与执行顺序。**R0 DESIGN FROZEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。设计批准不等于真实安装、恢复验收或生产命令授权；S2 暂缓不表示现役备份 timer 已停。

D1 已冻结有限独立认证平台基线；本文 Python 3.12.3 等仍只是合成模型声明，不是目标平台实际认证。R1（B4B-3B/3C）必须对真实版本采集完整依赖、独立来源和实际消费见证，未知项拒绝，不扩成主机自证内核。

**日期：**2026-10-17（America/Toronto）
**状态：**MERGED / SYNTHETIC CI GREEN：PR #2848，merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`，final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`，CI #7315 / run `39077195858`；**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。
**归属：**Runtime / Release 安全边界；不进入冻结的 17 文件 Runtime Bundle。

## 1. 边界与实施范围

- B4B-1 的 trusted_root_bootstrap_blueprint.py **保持原状**：只建模顶层 .py 直接导入、声明的解释器和 Bootstrap 文件身份。不得直接放宽旧原型。
- B4B-2 的 g2b4b2_disposable_guest_byte_consumer.py **保持原状**：此前的 8/8 人工提供的 Guest root 合成实验，仅证明固定字节消费、受控拒绝、确定性捕获后路径替换。
- 第一批新增 ops/runtime/root_python_dependency_manifest.py。只校验**内存中的清单声明**，不读取真实宿主机文件、不发现 Python import/dlopen、不验证真实字节、不安装、不提升权限、不加载/执行候选代码。即使所有声明一致，也永久返回 decision=BLOCKED、readyToInstall=false、authorizedToMutateProduction=false。
- 本组件属于用户已授权的新独立 B4B-3 边界，不修改 B4B-1/B4B-2、公用接口、业务上下文或 17 文件 Bundle。实现归类为独立内部增量，无数据迁移。

## 2. v1 manifest 合同

Schema 固定为 **sanq.c5.g2.b4b3a.dependency-manifest.v1**。Envelope 只能包含 schema、platform、nodes；platform 固定申明 Linux / x86_64 / Python 3.12.3 / 参数 -I、-S、-B（这些是未认证的**调用方声明**，不是 Guest 实际检查）。

每个节点只能包含 id、kind、path、sha256、requires。清单允许 2–512 个唯一节点、最多 4096 条声明依赖边、规范 JSON 总长度不大于 524288 字节。每个文件型节点必须包含规范绝对路径和小写 64 位 SHA-256，并在调用方提出的 proposed_external_file_pins 中有且仅有一条匹配的独立**声明**；manifest 的规范化 SHA-256 也必须匹配单独传入的 expected_manifest_sha256。任何未知类型、路径漂移、重复节点、遗漏/多余哈希、依赖边引用缺失、不可达节点均拒绝。

| 节点 kind | ID 示例 | 文件路径模型 |
| --- | --- | --- |
| python-executable | interpreter | /usr/bin/python3.12 |
| elf-loader | loader | /lib64/ld-linux-x86-64.so.2 |
| stdlib-module | py:hashlib、py:json.decoder | /usr/lib/python3.12 下的 .py 文件 |
| stdlib-package | pkg:json | /usr/lib/python3.12 下的包 __init__.py |
| stdlib-extension | ext:_hashlib | /usr/lib/python3.12/lib-dynload 下符合 cpython-312-x86_64-linux-gnu 或 abi3 的 .so |
| native-library | lib:libcrypto.so.3 | /lib/x86_64-linux-gnu 或 /usr/lib/x86_64-linux-gnu 下的 lib*.so[版本] |
| builtin | builtin:sys | 无独立文件/哈希；未来由可信解释器证明覆盖 |
| frozen | frozen:os | 无独立文件/哈希；未来由可信解释器证明覆盖 |
| kernel-virtual | virtual:linux-vdso.so.1 | 无磁盘文件/哈希；需独立内核/环境证据 |

必须包含解释器与 ELF loader，且解释器显式引用 loader；用有界、去重的图遍历检查所有节点从这两个根可达。实际导入/ELF 图可能有环，**不简单地把所有环定义为危险**。同一物理声明路径不得出现在两个节点中，同一个 Python 限定模块名也不得同时声称多个加载来源；native 库路径必须是指定库目录的直接子项，不允许额外中间目录。

**范围外：**第三方 site-packages、zip import、任意 dlopen、未经建模的扩展 ABI 和非指定 Guest/Python 版本。一旦遇到未覆盖类别，不得把完整运行时认证标记为通过。即便 manifest 结构闭合，仍返回 pythonRuntimeDependencyClosureVerified=false、fileBytesIndependentlyVerified=false、manifestProvenanceIndependentlyAuthenticated=false、dynamicImportsAndDlopenObserved=false、independentGuestWitnessVerified=false。

## 3. Guest 已观察到的哈希（尚不构成完整可信 manifest）

以下源于用户在 SanQ-H05-Restore-Check-20261015 Guest 提供的原始终端内容。只代表当时的哈希读数；**不是第三方认证、没有全部传递依赖，也没有外部可信 pin 的保管证明**。

| 文件 | SHA-256 |
| --- | --- |
| /usr/bin/python3.12 | e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f |
| /lib64/ld-linux-x86-64.so.2 | c20a2dc8917c755f02b94049356320fe1f62ac7d9f8994731f807d9df39302da |
| /lib/x86_64-linux-gnu/libc.so.6 | 3a15d66867d83762c7f2f1e37359cb8f6c5743edb369c65285cb0b1c4f7498bf |
| /lib/x86_64-linux-gnu/libm.so.6 | fce00b6f25f459cf4ae0b7fae4257909a1a8a86f9149e7c029a5d617baf1ccd0 |
| /lib/x86_64-linux-gnu/libz.so.1 | 86200da370f20476a2507e9097a789b5ef97269b4ca8d5e164ad82dab9d99892 |
| /lib/x86_64-linux-gnu/libexpat.so.1 | 286682ecbc5e59a638963b1a4e6351e65eb32fcf4bdcb9cb7569b6a61fe06a8d |
| /usr/lib/python3.12/lib-dynload/_hashlib.cpython-312-x86_64-linux-gnu.so | 8dc6cda6dd9495b95a2bfb5b26e8cf06b72f36dc0213d958b9277a958287f0fe |
| /lib/x86_64-linux-gnu/libcrypto.so.3（realpath 位于 /usr/lib/...） | 6866ed711dab8927e1bf82bf1cd30e828bdfc34f3cc1e83b1c9eb01ce6c37d9a |

Linux vDSO 不是常规的可哈希磁盘文件；libcrypto 和其路径别名需要在真实见证中分开查 realpath/inode。Guest 已报告 argparse.py、hashlib.py、json/__init__.py、re/__init__.py、dataclasses.py 导入来源，**并未提供所有文件哈希与完整递归依赖边**；os 报告为 frozen，sys 为 built-in。这里不编造缺失 pin，也**不生成声称正式闭合的真实 manifest**。

## 4. 测试与后续门禁

新增 ops/runtime/tests/test_root_python_dependency_manifest.py，以虚构 digest 构建纯合成图，覆盖声明正确但拒绝生产授权、包/子模块/扩展/loader/native/builtin/frozen、缺失额外 SHA、未知模块/路径/ABI、缺边/重复/不可达和有界环遍历。没有真实 Guest/root 操作。

该批已获远端交付批准并由 GitHub Actions 的 api-checks 按既有 Runtime unittest discover 步骤通过；没有执行本地 lint/build/test，也没有 Guest/root 真实采集或执行。当前 R0 文档批已获远端交付授权；交付/CI/合并以该批 PR 最终记录为准。

**B4B-3B（后续单独审阅）：**独立可信源/文件哈希采集、真实 Python 传递 import 和 ELF DT_NEEDED/dlopen 发现、真实路径/inode 映射、内核 vDSO、系统包来源与动态环境影响；未知时 fail closed。若需要增加第三方 wheel、zip 导入或其他 ABI 的支持，必须另外审阅新边界。

**B4B-3C（后续单独授权）：**在隔离 VirtualBox Guest 验证，经审阅的精确 root 命令、源码哈希、独立见证与 off-Guest 原始证据保全。此前明确跳过的快照实际恢复仍不满足正式 Gate 0；不可自动豁免。C5-G2 NO-GO、S2 BACKUP PAUSED 始终保持。
