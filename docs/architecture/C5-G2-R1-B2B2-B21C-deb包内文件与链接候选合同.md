# R1 B2B2-B2 — B2-1C Debian 包内文件与链接候选字节合同

**日期：**2026-10-18（America/Toronto）
**基线：**B2-1B PR #2869 / GitHub CI #7369 success / dev merge e823bb165c1cf0460cf1279cda8d44f0b6884366。
**分支：**feat/c5-g2-r1-b2b2b2-b21c-deb-members-offline-20261018。
**状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NOT PUSHED / USER REVIEW PENDING。**

## 1. 本批目标与所有权

B2-1B 只核对调用方提供的 Ubuntu Release→Packages→.deb 整体候选字节哈希、大小和版本，不知道包内对应哪个 Python/loader 文件或者 symlink 文本。B2-1C 在既有 Runtime/Ops 模块边界内新增纯内存离线模块 ops/runtime/root_python_b21_deb_members.py：
1. 接受调用方提供的原始 .deb bytes 和候选 SHA-256；仅识别有界 Debian ar 三成员：debian-binary、control.tar.*、data.tar.xz/data.tar.gz；严格验证 debian-binary 格式标记 2.0。
2. 用标准库有界解压并通过 tarfile 只读遍历 data.tar，不向磁盘解包、不调用 shell/apt/dpkg/gpg/SSH/subprocess。
3. 对有限的明确选定 regular 文件相对路径计算 SHA-256，按请求的外部候选 digest 逐一核对；对指定 symlink 成员仅比较原始 link text，绝不跟随链接或者重开文件。
4. 仅输出候选 file SHA 与 link text，永远 decision=BLOCKED、readyToInstall=false、authorizedToMutateProduction=false；所有来源/文件权威/Guest root FD /实际动态消费的认证字段均 false。

不能把一个包内的 member bytes 与 caller digest 相等当作 Ubuntu 官方发行认证。解包器不与 B2B2-B1 opener、B3B1 observer 接线，不提供任何运行时安装/执行入口，也不自行下载外部包。

## 2. 有界审查预算

| 对象 | 首批合同 |
| --- | --- |
| 输入 .deb | 最多 32 MiB（复用 B2-1B 常量）；原始字节来源不认证 |
| ar | 三个规定成员、短名及固定头；长名和其它格式一律拒绝 |
| data.tar | 仅支持 xz/gzip，不支持 zstd 或其他压缩，不自动新增依赖 |
| 解压 | 最大 64 MiB，tar 最多 8192 条条目 |
| regular 文件 | 最多 64 条、单文件最多 32 MiB、指定文件累计最多 64 MiB |
| symlink | 最多 8 条，准确相对路径与最长 256 ASCII 字符 link text，只做原文比较 |
| 未知路径、重复路径、超预算、错误成员类型、hardlink、缺失/错误字节 | fail-closed |

可能存在真实 Ubuntu package 使用 data.tar.zst 或其它元数据、分别由不同包提供 usrmerge directory symlink 与 loader 的情况。这类真实差异不属于自动放宽允许范围，先 BLOCKED、保存准确候选差异，单独审阅合适的格式或多个 package 的来源归属。

## 3. 后续仍未满足的门禁

- Ubuntu 官方可信 archive signing key、发行时间、Release/Release.gpg 或 InRelease 签名、真实 Packages/.deb 取得、离机来源保全：均未独立取证。
- 需要多个经证实的官方包形成整个 Python/ELF/loader/symlink 依赖清单的完整 per-file 来源；此批仅一个包的候选 member bytes。
- 隔离 Guest root 可信斜杠 FD、mount namespace/mnt_id/inode、同会话 B1 held-FD → B3B1 observer 及独立 Guest/Host/Package witness 仍须具体脚本 SHA/精确命令/权限/保存路径和用户单独授权。
- B4B-3C 动态 CPython/ELF/dlopen 实际消费见证和 G2 C1 仍然 OPEN；不由候选包 hash 通过而解除。

合成测试 ops/runtime/tests/test_root_python_b21_deb_members.py 使用纯虚构 ar/tar、gzip/xz、不可执行 Python 测试字节；包括候选正例仍 BLOCKED、缺失与重复成员、ar 截断、错误文件 digest、链接文本错、危险路径、hardlink 伪装、zstd 不支持、篡改的 .deb 等。MCP-workspace 没有 test/build/lint 执行权限；当前只是源码测试已编写，GitHub CI **没有**对本批运行。

**不变事项：**原 B2B1 nofollow、B2B2-B1 alias FD、B3A、B3B1、B2-0、B2-1A、B2-1B 代码均不修改；无依赖/锁文件、CI、应用模块 owner/import、SCC/scanner baseline、Runtime 17 文件、Prisma/API/数据、sudoers、备份、Docker/AWS、VM/生产行为变化。C2 有界 CLOSED / N-07 LIMITED-ACCEPTED；C1 OPEN，C5-G2 NO-GO，S2 PAUSED。

本地审阅结束即停止，不推远端、不执行真实取证，等待用户审阅并授权。

**后续交付状态（2026-10-18）：**以上 LOCAL/未推送为本批初始审阅时点。后经用户单独授权，PR #2870 / CI #7371 success，Merge commit `3c623b88a20962a820d6269ab330e6b6c48552f3` 已进入 dev；仅合成 CI GREEN，不改变真实来源和 Guest/root 取证权限。

## 4. 2026-10-20 — 真实 Ubuntu 格式适配源码准备

**SOURCE IMPLEMENTED / SOURCE CI VERIFIED。** [PR #2883](https://github.com/sanqin888/sanqinMVP/pull/2883) 源码 head `6e8afe043d262a45b8da5c5853d7efe9b59082ed` 的 [CI #7400](https://github.com/sanqin888/sanqinMVP/actions/runs/39442496016) success；Runtime 436 tests、paired-image release 45 tests 均 OK，Runtime 日志显示 `/usr/lib/python3.14/`，3.14+ 正向 zstd 路径未跳过。本文为合并前证据收口，最终文档 head 仍须通过 CI，合并事件以 PR 为准。 首版已完成本地静态审阅；用户于 2026-10-20 明确要求“提交远端”，本批按最终 head 的 GitHub Actions 门禁交付 dev。 前置文档 PR [#2882](https://github.com/sanqin888/sanqinMVP/pull/2882) 最终 head `e45065e910cf70e04006777960dd28031bf0d105` 经 [CI #7398](https://github.com/sanqin888/sanqinMVP/actions/runs/39440447717) success 后 squash merge `5223c08fc2dc9d3e4316f5af1bb6567e9e8b5f15`。该 doc-only CI 只选中 ci-change-scope，其余按范围 skipped，不是本次源码测试结果。来源实包的有界重算与人工文档 LIMITED 见 [S1 §9](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。

### 4.1 已观察差异与实现方式

本轮七个 deb 实际短 ar 名无尾斜杠，control/data 均为 zstd；Debian deb(5) 允许这些格式。旧 §1–2 是 2026-10-18 的实现历史，不回写成当时已支持。本次只在既有 Runtime/Ops 的纯内存候选审阅器中：
- 将短 ar 名的一个可选尾斜杠标准化后，再做原有名称、长度、重复、顺序、版本、大小和 padding 检查；BSD/GNU 长名扩展及标准化后重名仍拒绝。
- 增加 data.tar.zst 的显式分支，使用 **Python 3.14+ 可选标准库 compression.zstd** 的增量解码器，检查标准 magic、descriptor 保留位、dictionary ID、已声明 content size、声明窗口及 decoder window_log_max=26、max_length、eof 和 unused_data；限定单标准帧，无字典，无拼接/尾随/截断。
- 普通未知内容长度帧在声明窗口≤64 MiB 和实际输出≤64 MiB 内允许；已知内容长度超预算在解码前拒绝。checksum 损坏由标准库报错并归为 DebMemberBlocked。
- xz/gzip 行为与现有 API/SCHEMA/receipt 权限字段不变。control.tar.zst 在本模块仍仅为不执行的容器信封，**不声称解析或认证 control/维护脚本**。

第三方依赖、CLI、ctypes/native-library 搜索、进程或自动安装均未新增；缺 compression.zstd（包括 Python 3.12/3.13）时，zstd 请求明确 BLOCKED，仍可使用原 xz/gzip 能力。该标准库要求属于**离机审阅环境**，不升级当前 Ubuntu Guest 的 Python、不改变生产安装器解释器或 17 Bundle，也不把项目代码放入 Mac 外置辅助包。

### 4.2 预算、测试与接续

既有 .deb≤32 MiB、展开 tar≤64 MiB、≤8192 条目、regular≤64 个/单个32 MiB/合计64 MiB、symlink≤8 个及路径/元数据拒绝规则保留；zstd 新设窗口≤64 MiB。任何候选成功仍 BLOCKED；GPG、外部 pin、Guest FD 和实际动态消费认证字段不翻转。

新增聚焦合成测试覆盖有/无/混合尾斜杠、标准化后重名、长名拒绝、zstd 已知/未知长度 raw-frame、实际 compressed-block+checksum（3.14+ 环境）、标准库缺失明确拒绝且 xz 不受影响、截断/拼接/尾随、skippable/dictionary/超窗口、已知/未知输出超预算和错误成员 pin。测试无真实包、网络、磁盘解包或可执行 Guest 字节；旧 mock zstd 负例继续拒绝，不改成宽松 fallback。Python 3.14+ 的正向 compressed-block 测试直接使用真实标准库，不 mock/skip；较旧宿主只验证能力缺失的拒绝路径，不冒称 zstd 解码通过。

分类 **A 类内部能力扩展**：同 owner、同函数入口及 v1 receipt schema；B2-1D 只导入既有 SCHEMA，调用方无需修改；没有并行旧/新 owner、过渡 facade 或双读迁移，因此没有新增过渡兼容登记。源模块、聚焦测试、本合同、current-dependency-graph 和同批 worklog 同步；应用 owner/import/依赖图/SCC/scanner、CI、依赖清单/锁文件、Prisma/migration、Bundle、备份与生产行为不变。

**本地未执行 lint/build/test，也未在其他环境偷跑仓库测试。** CI #7400 已按 ci.yml 的 ubuntu-26.04 / ops-checks 实际完成 Runtime 全套离线测试，所选作业与聚合门禁成功；API/Web/E2E 等无关检查按范围 skipped，不声称这些业务测试执行。合并前继续核对 PR 最终 head 的全部必需 GitHub Actions。当前未在新实现中重跑私有七包，不把前批 dpkg-deb/外置读取结果冒称此代码验收。

本地静态审阅及源码批报告已完成，用户已授权本批 push/PR 与 CI 全绿后的 dev 合并；本条不预先声称最终文档 head 的 CI 或合并完成。需要真实原件回归、R1-B root/FD 或生产执行时，保留各自准确目标/版本/权限/命令门禁。

参考：[Python compression.zstd](https://docs.python.org/3.14/library/compression.zstd.html)、[RFC 8878](https://www.rfc-editor.org/rfc/rfc8878.html)、[Debian deb(5)](https://manpages.debian.org/unstable/dpkg-dev/deb.5.en.html)、[GitHub Ubuntu 26.04 镜像清单](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md)。

## 5. 2026-10-20 — 最终合并与真实封存七包回归（有界）

以上 §4 的合并前状态已后续完成：PR #2883 最终 head `15e6ff4bb3643303d522cdc5634d1a3dfb082c4e` / [CI #7401](https://github.com/sanqin888/sanqinMVP/actions/runs/39442850626) success，squash merge dev `ac5fcfef2ab43489a9b35be7048c93b1b2d31b6a`。最终 Runtime 436 tests、release 45 tests OK。

Mac 非 root Python 3.14.8 / zstd 1.5.7 对固定合并源码执行外置 replay：七包 ar/data.tar.zst 全部解码并匹配前批独立技术复核的完整 data.tar SHA，四包的三个既有 regular 及三条链接候选匹配；其余三包没有新增成员 pin 审阅。回执 SHA `a8b33d5defcc9408ccc275b15b24006c60fd08781339c8cabfa0a1ce3d0de8bf`。已取得 13,813-byte 原件，五文件 manifest、交付脚本、参考 pins、冻结 Git 源码快照均重算匹配；不在审阅环境代跑仓库测试，也不把该原件复核冒称第二次 Runtime 实际执行。

**结论只关闭本次限定格式回归差异。** receipt 的 BLOCKED/false 保留。后续 R1-B PR #2885 / final CI #7405 success 已合并 dev `8a99c99e`；操作员经准确批准完成 S5 CAPTURE-003，原件 27 项清单/三个 FD/三条链接及退出码 0/0/0 的三侧一致性复核 PASS_SCOPED，详见 [R1-B §6](C5-G2-R1-B-只读GuestFD采集器与执行审批.md)。这项后续证据不改变本 B2-1C 的来源/授权语义；完整传递依赖、正式正常更新执行器实际消费和 C1 仍 OPEN，见 [R1-C 工作包](C5-G2-R1-B-只读GuestFD采集器与执行审批.md#7-r1-c-s6-就绪审计与实施拆分)。R1/C1 OPEN、G2 NO-GO、S2 daily PAUSED，C2 有限 CLOSED。


