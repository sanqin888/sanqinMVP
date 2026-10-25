# C5-G2 / R1 B4B-3B-2A — Python / ELF 静态依赖线索提取

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**当前状态：**已合并 `dev`（PR #2855；merge `2db85d32`；原 PR 经过一次合成 ELF fixture 重叠修复）；仅 CI 合成分析完成，未进行真实 Guest/ELF 执行。下阶段本地独立候选路径 FD 开启见 [B4B-3B-2B1](C5-G2-B4B3B2B1-受控路径FD候选开启.md)。  
**工作分支：** `feat/c5-g2-b4b3b2a-static-dependency-evidence-20261017`，基线为 PR #2854 合并后的 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。  
**归属：** Runtime/Ops 边界内的离线审阅组件；不属于冻结的 Runtime 17 文件 Bundle。

## 1. 为什么先做 3B-2A

R0 D1 要求单平台真实 Python/ELF 依赖和可信来源。B4B-3A 只能核对**声明图**；已合并的 B4B-3B-1（PR #2854、CI #7336、merge `2bab5fe6`）只能读取**调用方提供的 FD**并核对 SHA-256。仍未证明 FD 所指真实路径、导入闭包或真实解释器的加载行为。

本批优先在**纯内存**增加 `ops/runtime/root_python_elf_static_hints.py`，为下一批真正可信采集/见证提供有界静态分析的最小构件。与 R0 冻结 D1 兼容，不放宽原始 B4B-3A 的 Python 3.12/x86_64 平台声明，不新增执行入口和权限，也不修改 B4B-3B-1 的 FD 接口。

## 2. 输入、输出及边界

| 接口 | 接受的材料 | 做得到 | 无法证明 |
| --- | --- | --- | --- |
| `inspect_python_import_hints` | 最多 256 KiB 的不可变 Python 源码 `bytes` | 使用 `ast.parse` 得到直接 `import`、`from ... import` 的模块名线索；记录相对、星号、from/attribute 歧义，以及明显动态导入或 eval/exec 的告警 | 不解析复杂条件/反射间接导入的所有组合；不能证明 AST 表达了真实解释器的所有加载；不会解析运行时 import hook 或 zip/site 包 |
| `inspect_elf64_needed_hints` | 最多 32 MiB 的不可变 ELF 文件 `bytes` | 只接受 x86-64 ELF64 little-endian，边界检查 program headers、PT_DYNAMIC、DT_STRTAB、DT_STRSZ、DT_NEEDED；提取 SONAME 与 PT_INTERP 静态线索；记录可疑 RPATH/RUNPATH、非预期解释器及未知动态标签数量 | 不执行 ELF，不调用 ld.so/readelf/ldd；不知道 ld.so 路径搜索与 symlink 别名、实际最终加载文件、符号版本、LD_PRELOAD/LD_LIBRARY_PATH、dlopen；不能证明自举材料或外部可信来源 |

**全部结果无条件：** `decision=BLOCKED`、`transitiveDependencyClosureVerified=false`、`dynamicImportAndDlopenClosureVerified=false`、`readyToInstall=false`、`authorizedToMutateProduction=false`。从字符串中看到了 `libcrypto.so.3` 不等于实际认证这个 native library 的字节。静态导入收集不自动把名字映射到 B4B-3A 的路径；从 `from package import name` 中无法独立判断 `name` 是属性还是子模块。

**关键安全约束：**不接触 Guest、root、VM、宿主机路径/FS、外部凭据、网络、生产 Runtime、应用镜像、备份、docker、Prisma/migration；不产生安装/执行命令。不允许通过函数的布尔返回值声称信任。

## 3. 本地合成测试与限制

新增 `ops/runtime/tests/test_root_python_elf_static_hints.py`：人工构造 Python 导入片段和内存中最小 ELF64 镜像，不使用真实 ELF/真实系统库或 root；验证正常静态线索依然无权限、动态/相对导入告警、损坏 ELF/越界 segment、错误机器架构、缺终止符、恶意 SONAME/动态搜索路径、冻结 17 文件 Bundle 无新增成员。

本地 MCP-workspace 不运行 lint/build/test；远端需要用户单独授权，随后 GitHub Actions 的既有 `api-checks` Python unittest discovery 才是正式验证。生产状态：`C5-G2 NO-GO`；`S2 DAILY CONFIG EXPANSION PAUSED`（不改变现役备份 timer）。

## 4. 未完成的 B4B-3B-2B、B4B-3C

- **3B-2B 仍需独立设计/审阅：**固定 Guest 内真实文件安全开启与 symlink/realpath 链、独立 OS/发行包证据、实际解释器依赖递归/ELF 加载路径发现（包括动态加载），多入口依赖闭合、文件身份/别名收口、离机公证与持续污染窗口。
- **3B-3C 实测门禁不变：**按照 R0 C2，真实新 privileged Guest/root 命令之前必须演练快照恢复并独立保留原始证据；之前特例跳过恢复仍不能当作生产豁免。脚本 SHA、Guest 身份、维护窗口和源/依赖来源均须单独审批。

本批不修改 R0 D1–D5 决策、不增加认证平台、不扩工具集/依赖/权限，也不补造任何真实 Ubuntu Guest 数据。
