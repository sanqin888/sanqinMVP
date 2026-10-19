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
