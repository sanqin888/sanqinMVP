# R1 / B2B2-B2 — B2-1B Ubuntu 来源字节链审阅（本地）

**日期：**2026-10-18（America/Toronto）  
**基线：**B2-1A PR #2868 / CI #7367 SUCCESS / dev merge 5711aa1267cd7f5cbc9b011747edf5b99cd9f9a9。  
**状态：**LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NOT PUSHED / USER REVIEW PENDING。分支 feat/c5-g2-r1-b2b2b2-b21b-ubuntu-byte-chain-20261018。

## 1. 仅限本批的边界

B2-0 只核对 Guest/Host/Package 调用方声明，B2-1A 只核对指定隔离 C2 VM 原始命令回执的 bytes/rc。本批增加外置 Runtime/Ops 纯内存模块 ops/runtime/root_python_b21_ubuntu_source_chain.py：将调用方分别提供的 Ubuntu Release 原件、候选 Release.gpg 原件、Packages 或 Packages.xz 索引原件与准确 .deb 原件核对 SHA-256、大小、包名/版本/amd64、组件、路径及 Noble suite。

**这是按原始字节的内部一致性审核，不是软件发行来源真实性认证。** 运行时不访问网络、Host、Guest、root、本机文件、apt/dpkg/gpg、外部镜像，不执行安装和 Python/ELF 模块。不会替换现有 B1/B3A/B3B1/B2-0/B2-1A 合同，也不会加入冻结 Runtime Bundle 或生产执行路径。

输出只在结构有效时报告 Release→Packages 和 Packages→.deb 的字节候选一致；始终 decision=BLOCKED、readyToInstall=false、authorizedToMutateProduction=false、releaseGpgSignatureVerified=false、trustedUbuntuKeyAndRepositoryAuthenticated=false、ubuntuReleaseValidityIndependentlyEstablished=false、packageMemberBytesAndSymlinksExtracted=false、guestFdToPackagePathAuthenticated=false、pythonElfDlopenClosureVerified=false。

## 2. 输入、语义与预算

| 候选输入 | 允许审阅 |
| --- | --- |
| Release body 原件和候选 SHA-256 | Codename=noble，Suite=noble/noble-updates/noble-security，Architectures 含 amd64，Components 含所选组件；唯一 SHA256 表对应精确索引路径、大小及 hash |
| Release.gpg bytes 和候选 SHA-256 | 仅非空/预算/hash；**未验证任何 GPG/OpenPGP 密码学签名** |
| Packages / Packages.xz bytes 和候选 SHA-256 | 精确 main/universe/restricted/multiverse 下 binary-amd64 index path；禁止越界路径；校验压缩字节与 Release 引用，限定 XZ 解压 |
| .deb 原始 bytes 和候选 SHA-256 | Packages 中精确 Package/Version/Architecture/Filename/Size/SHA256 与输入完全一致；不以 basename 或 latest 猜包 |
| 四项候选 digest | 均由外部独立供给并在本模块内重算；其来源可信性由后续单独认证 |

预算：Release 256 KiB；签名原件 32 KiB；Packages 压缩输入 8 MiB、解压输出 16 MiB；.deb 32 MiB；索引最多 32768 段。任何不符 BLOCKED，不能为了通过真实数据静默扩大预算。

本批**仅支持分离的 Release + Release.gpg 输入**；不解析 InRelease 内嵌签名、cleartext dash escaping 或验签。这不意味着 Ubuntu 官方材料不支持 InRelease；后续若需要，以另一有限源码/验签设计明确合同，不能把 InRelease 直接塞进 Release body。

**不会打开或解包 .deb 内的 ar/tar 文件成员。** 因此不能证明准确的 /usr/bin/python3.12、ELF loader、标准库/native 文件或 usrmerge 链的单文件 pin，更不能证明 B1 root-held FD 的字节来自其原始 Ubuntu 包。此处只证明“给定的不可信 Release、索引、deb 三份字节互相声称的 SHA 相等”。

## 3. 合成测试与真实证据门禁

新增 ops/runtime/tests/test_root_python_b21_ubuntu_source_chain.py，全部采用虚构的 Release/Packages/XZ、伪签名 bytes 和非真实 .deb 内容，不从外部下载。测试覆盖篡改 Release/签名/索引/deb、错架构/路径/版本、重复包、无 SHA256 回退到 MD5、错误发行 pocket、超出索引/压缩/路径限制等；正向候选仍永久 BLOCKED。MCP-workspace 无执行 tests/build 权限，当前 tests 尚未运行；PR/CI 仅在用户审阅后另行授权。

真实 Ubuntu 源资料要在**单独审批后**由独立来源取得、保管原件，核验受信任的 Ubuntu archive GPG key、InRelease 或 Release/Release.gpg 的原始签名、准确 Packages 索引与原始 .deb，确认套件/架构/发行时间及原始 stdout/stderr/rc 与离机见证。Guest sha256sum 或 dpkg -V 不能充作离机官方 pin，也不能凭字段自报 trusted=true。

后续单独切片才可以规划原始 .deb 包内成员字节和 symlink→B2-0 logical-path/file FD 对照，以及 Guest root anchor/持有 FD 的真实取证（必须用户审批精确权限和命令）。B4B-3C 动态 Python/ELF/dlopen 消费链仍未验证。

## 4. 不变项目与当前判定

无新 dependency/lockfile、CI workflow、Prisma/schema/migration、HTTP/API、业务 owner/SCC/scanner baseline、Runtime 17 成员、生产 Docker/AWS/backup/sudoers 或虚拟机执行变化。C2 仅隔离 VirtualBox 合成场景 CLOSED / N-07 LIMITED-ACCEPTED；C1 OPEN、C5-G2 NO-GO、S2 PAUSED，R2–R5 另属审批门禁。
