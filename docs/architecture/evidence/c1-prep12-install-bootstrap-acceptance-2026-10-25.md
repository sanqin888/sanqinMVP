# C1-PREP-12 Python交付、安装与只读bootstrap验收记录

**2026-10-25（America/Toronto）｜PYTHON_INSTALLED_VERIFIED_SCOPED / READ_ONLY_BOOTSTRAP_PASS_SCOPED / C1_OPEN。**

本记录归Runtime/Ops。GitHub运行与下载产物由助手通过连接器读取并做静态字节复核；AWS现场部分来自操作者本对话逐次粘贴的stdout/退出码，包括最初截断后补齐的bootstrap JSON。这些不是签名采集回执，也不是助手直接执行/独立见证的生产shell日志。报告中的false/BLOCKED为原合同的有意结果，不能改写为执行权限。

## 1. 准确构建及来源

- [PR #2947](https://github.com/sanqin888/sanqinMVP/pull/2947)交付构建工具；[PR #2948](https://github.com/sanqin888/sanqinMVP/pull/2948)保留仅手动入口、显示准确分支/SHA。用户已自行整体晋级main；本次手动构建仍选择dev。
- [构建run 40192632845](https://github.com/sanqin888/sanqinMVP/actions/runs/40192632845)，workflow_dispatch，attempt 1，dev源码 `711197d2f31d1d6198d37f662e072e647f541efb`；全部构建步骤success，Jammy宿主工具测试18项、实际编译解释器C1回归203项通过。
- 托管Ubuntu22.04/x86_64，CPython3.12.15 final；prefix `/opt/sanq/python/3.12.15`，configure参数 `--with-ensurepip=no CC=/usr/bin/cc`。make altinstall使用DESTDIR暂存；生产VM未编译或安装构建工具。
- 官方源包SHA256：`c2c4321961fab0fb999d66e0cecf521c2ab3994c7992873ea99e306c1094fd5a`。GnuPG机器状态VALIDSIG主指纹 `7169605F62C751356D054A26A821E680E5FA6305`，SHA512签名摘要算法；验签步骤success。原始源包/签名/公钥在材料内。有限TCB仍为已审阅工作流、GitHub托管builder、系统Python/GnuPG/编译器及Ubuntu APT信任，不声明递归认证整个内核/工具链。
- [artifact 12598742317](https://github.com/sanqin888/sanqinMVP/actions/runs/40192632845/artifacts/12598742317)：122705847字节，ZIP SHA256 `bd43cb8591589c9f3a44bfed04f73c622257df7edb456af3ad98d45a1fd22175`；GitHub到助手下载及Mac→AWS原件摘要均匹配。
- 内部解释器tar.gz SHA256：`b8238d97ea09cfb608f5d96cee29f033f91f6bb1ab32365f0049a79bbc698555`。build-review.json SHA256：`e9a3540f5c9e100325ff9b74643c71b0267f70f3af7d9e385fd9dce67c757222`。
- 助手复核SHA256SUMS的25份材料及解释器归档8368成员的字节、owner/mode与清单一致；展开文件总字节363847981，无符号链接/特殊对象/组或其他用户可写成员。

## 2. AWS安装与字节验收（操作者回执）

目标sanq-web此前已确认Ubuntu22.04.5/Jammy/x86_64。/opt及/opt/sanq原为root:root/755，新Python目录原不存在。磁盘检查58G、剩余36G；9个运行库包均installed。关键7个真实动态库对象摘要匹配构建记录：libc、libcrypto、libm、libsqlite3、libssl、libz及ld-linux；该范围不是全动态依赖闭包声明。

操作者将已固定摘要的解释器tar复制到root私有暂存目录，root复核准确原件SHA256后解包，在拒绝覆盖的版本路径交付。仅新增独立prefix，不替换系统python3或现役Runtime：

```text
python.tar.gz: OK
P12-INSTALL: PASS
'/opt/sanq/python' uid=0 gid=0 mode=755
'/opt/sanq/python/3.12.15' uid=0 gid=0 mode=755
'/opt/sanq/python/3.12.15/bin/python3.12' uid=0 gid=0 mode=755
P12-SMOKE: PASS
P12-INSTALL-AND-SMOKE: PASS
P12-INSTALL_RC=0
P12-INSTALLED-INVENTORY: PASS 8368 members
P12-INVENTORY_RC=0
```

实际smoke使用ubuntu身份、原五键env与-I -S -B，确认3.12.15 final、准确executable/prefix及全部既定flags；stdlib报告OpenSSL3.0.2、SQLite3.37.2、zlib1.2.11、expat_2.8.5。系统libexpat包版本不是该内建/打包后端版本的替代解释。

## 3. 九源码与真实输入绑定

九文件按上述准确GitHub源码提交下载；助手重算Git blob/SHA256/大小与连接器提供的9个Git blob一致。现场先用户目录逐文件核对，再受控create-only交付：

```text
C1-SOURCE-STAGE: PASS 9 files
C1-SOURCE-STAGE_RC=0
C1-ROOT-SOURCE: PASS 9 files
path=/root/sanq-runtime-operator/normal-update-v1
directory=root:root/0700 files=root:root/0400
C1-ROOT-SOURCE_RC=0
```

bootstrap SHA256 `490b5678e4902c2a0d693ea88b6cb8d364751c171fcf3843af0d0f294c6a06e9`；launch模块SHA256 `9b0a4b3b4ab2d0749bc8c3388f6a8cbaba9c3df9938af6443db018fee9d48f3b`。另外7源字节沿PREP-10不变，不能重用旧3.12.3的bootstrap/launch pins。

| 身份 | 准确值 |
| --- | --- |
| 当前已安装Runtime | a84b72007e6b4e82c981101e56c897355757c0ff |
| 当前原Archive digest | sha256:8bd4d6c3d6ad1a942841c8cd7c81d47067c70f553bc4f445120ed60fe3323c84 |
| 目标Runtime候选 | 913258eb17e93a4900f90443959abfa07c7db96d |
| 目标原Archive digest | sha256:f1111edc9162f383a83c3b355a40ea17fc7ff2b21355e9d07b54a293561e34a3 |
| 当前应用 | ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8 |
| previous应用 | a84b72007e6b4e82c981101e56c897355757c0ff |

旧归档摘要取自该源码GitHub发布状态及[发布run 37801753900](https://github.com/sanqin888/sanqinMVP/actions/runs/37801753900)，不要求持有旧原包。目标[发布run 40192703655](https://github.com/sanqin888/sanqinMVP/actions/runs/40192703655) success，CI run 40192492391；目标artifact12598244931的ZIP摘要为 `78853a1d912189afea541a8435fb35955b626ab6d256c94fd3858a235836694f`，它与内部原tar摘要是不同对象。助手及AWS均复核目标17成员；现场当前17成员匹配已安装manifest，两者仅deploy_release.py、release_contract.py不同。目标Runtime仍未安装。

现场发布状态active，API/web/worker与DB均running/healthy；API/worker配置同一当前SHA-tagged API镜像及同一image ID，uploads bind=/srv/sanq/uploads；DB卷sanq-app_pgdata；web sounds为/home/ubuntu/sanq-assets/sounds只读bind。四容器原restart=always保持不变。本次没有宣称持有持续维护屏障；配置tag/image ID的观察不替代新一次独立的注册表来源核验。

三个保留文件仅采集摘要及元数据，无.env内容：

| 文件 | bytes | uid/gid/mode | SHA256 |
| --- | ---: | --- | --- |
| .env | 3905 | 1000/1000/0600 | 4c30e6aa2d1f342b7c8d4a42bf3de4f0a3391aae1dd0244db762022c20f90c21 |
| .sanq-release-state.json | 265 | 0/0/0600 | ac6e38b9778210259510e9a3a81420823456fd93f24dda4c419697fbce0e25cf |
| .sanq-backup-layout-activated | 25 | 0/0/0644 | 809b4b7359512a3aa4a524b3cad19b5cdddab8aaa1f6fc0088723cc8beb9e37f |

事务 `c1-assembly-20261025-001`：
- 输入包3593字节，SHA256 `e1756b551386a8759f3cb167d8861cad718be6f198f6703bdeddea3ac5486bfc`。
- launch.json SHA256 `1bcfe5482876c79239c9137750cd4b744c82c8604e46b293418c7b0bcae6b395`。
- request.json SHA256 `54ee69fd11f188a0ff17b636c77c4213a2cf9bea83a3fa8b361a4de2db954cc6`。
- pins.json SHA256 `850a3b5745312540eec7b58b6552518c80522ba943049af5ef8e92de684b542f`。
- preserved观察记录SHA256 `017a20fccf68bbf9327b23e27ddbd421ec97d03c580522e2da966606a88d9faa`；自述scope=READ_ONLY_BOOTSTRAP、evidenceKind=operator-pasted-observations、continuousMaintenanceVerified=false，不把它升级成持续维护证明。

root交付前重新比对九源、三个保留文件及完整稳定容器观察，全部相同；批准目录仅包含上述3个输入文件：

```text
C1-INPUT-RECHECK: PASS
C1-APPROVAL-DELIVERY: PASS 3 files
transactionId=c1-assembly-20261025-001
path=/root/sanq-runtime-operator/normal-update-approvals/c1-assembly-20261025-001
C1-APPROVAL_RC=0
```

## 4. 只读bootstrap完整结果

实际调用为root身份，cwd=/root/sanq-runtime-operator/normal-update-v1，env清空后仅HOME=/root、LANG=C、LC_ALL=C、PATH=/usr/bin:/bin、TZ=UTC；准确解释器-I -S -B，固定bootstrap绝对路径及--transaction-id参数。原完整JSON由操作者补齐如下：

```json
{"authorizedToMutateProduction":false,"decision":"BLOCKED","flowInvoked":false,"launchAuthorized":false,"launchMaterialsSha256":"1bcfe5482876c79239c9137750cd4b744c82c8604e46b293418c7b0bcae6b395","mode":"ASSEMBLY_ONLY","readyToInstall":false,"requestSha256":"54ee69fd11f188a0ff17b636c77c4213a2cf9bea83a3fa8b361a4de2db954cc6","schema":"sanq.runtime.normal-update-bootstrap-result.v1","sourceCommit":"711197d2f31d1d6198d37f662e072e647f541efb","sourceProvenanceAuthenticated":false,"status":"CANDIDATE_ASSEMBLED","transactionId":"c1-assembly-20261025-001"}
```

```text
C1-BOOTSTRAP_RC=0
```

sourceCommit、事务、launch/request双摘要均匹配。CANDIDATE_ASSEMBLED/ASSEMBLY_ONLY/flowInvoked=false/全部权限false/decision=BLOCKED/RC0符合本只读入口合同；sourceProvenanceAuthenticated=false不能改写为自动来源授权。单次正例及其有限过程重查不证明跨进程准入、持续维护或安装效果。

## 5. 剩余事项与下一步

- PREP-12解释器可信构建、交付、真实prefix安装/smoke/全量inventory及本九源同平台正例已取得上述范围的证据；不再重复版本选择、解释器安装或该事务正例。
- 先将本批现场记录及材料身份提交文档收口，再做C1验收缺口审计，明确同准确候选的负例哪些已有、哪些必须在可丢弃Jammy环境补齐。当前没有生产负例实测，不得通过修改生产源码/输入/权限来造负例。
- P10-C/D现场交付与P10-E正例已通过，但P10-E完整正反例验收及P10-F真实效果候选仍未完成。R2/R3/R4能力的受控组合、完整候选冻结、持续维护/AWS恢复点/安装复验与正式C1裁定保持原门禁；本记录不为它们编造新编号或授权。
- 原始材料及来源日志应长期归档并保持摘要引用；GitHub构建artifact保留至2026-11-08（UTC到期时刻以GitHub为准）。本仓库记录不是123MB完整原件的替代品。
- 本次新增写入范围为独立Python prefix、外置九源码及批准目录；未安装目标Runtime、未调用Flow、未修改业务容器restart、未停服、未创建AWS快照、未迁移数据库或放行业务更新。上述有限回执不替代独立现场见证。
- 当前文档批次仅本地编写/静态审阅，未运行新的项目测试、未推送或创建PR；既有构建/CI结果保持准确原始范围。
