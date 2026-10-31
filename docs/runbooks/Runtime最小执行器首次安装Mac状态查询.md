# FI-MAC-1A：首次安装 Mac 只读状态查询

## FI-MAC-1B1：操作者目标材料本地预检（本地待审）

首次安装正式发送任何 VM 交互帧之前，可先对独立 AWS 会话取得并人工审阅的目标材料进行严格本地结构检查。**该动作没有 SSH 连接，不会访问 AWS API，也不能证实来源真实性**。

在 Mac 账户目录固定保存 `$HOME/sanq-install-target.json`，权限须 0400 或 0600；这是单独的用户文件，不得放进 `~/.sanq-deploy` 的三文件固定目录。内容是 VM 现有 `sanq-minimal-pre-snapshot-target` v1 的原 canonical JSON 对象，必须按字段名排序、紧凑分隔、ASCII 转义、末尾单个换行。准确字段：`schemaVersion=1`、`kind`、`accountId`、`region`、`instanceArn`、`instanceName`、`sshTarget`、`sshHostKeySha256`、`linuxSystemDisk`、`operatorConfirmed=true`、`instance`。其中 `instance` 须为独立 AWS 会话中目标 Lightsail 实例的原始观测对象，包含 `arn/name/resourceType/location.regionName/location.availabilityZone/hardware.disks`；只接受一个已附着系统盘。不得填造、猜测账户号、实例 ARN 或系统盘；不收录 AWS 密钥和登录令牌。

```sh
/bin/sh ops/release/sanq-install.sh check-target \
  --source-sha <准确40位main提交SHA> \
  --retention-id <准确64位保留材料ID>
```

返回的 `TARGET_STRUCTURE_MATCHED_FIXED_PROFILE` 仅证明严格字段结构、Mac 目标/host key 一致及单盘模型相符，输出 `targetInputSha256` 和输入请求的两个身份便于人工复核。始终报告 AWS 来源未经认证、独立核实未完成、无安装或恢复许可。文件权限错误、软链接/硬链接、目录原件变化、重复字段、非 canonical JSON、错主机/密钥、错实例/盘、非原生布尔均拒绝；不修复文件、不自动拉取 AWS、不提交 VM 任务。

实际交互提交/快照双帧/离机耐久回执/任务退出后的持久证据校验仍待 FI-MAC-1B2。此时 **NOT_READY_TO_INSTALL**，不能因预检成功而在生产执行安装。

> **FI-MAC-1A 已由 PR #3072 经 CI #7842 SUCCESS 合并 dev `6e9deea1`；Mac 真机首次安装状态查询未实测，生产仍未安装。以下旧实施与验收说明保留。**

本切片仅建立 **已有首次安装任务的 systemd manager 状态观察入口**，不是安装操作者交互/提交器，也不是安装结果的权威完成审计。已完成的 Mac 普通更新客户端 `sanq-deploy.sh` 不变。

## 固定入口与作用范围

使用已交付的 macOS 3.14.10 固定解释器及 `-I -S -B -X pycache_prefix=/dev/null`；独立入口 `ops/release/sanq-install.sh` 加载同目录 `sanq_install.py`，通过固定模块文件复用 `sanq_deploy.py` 的 `_profile/_signals/_execute`，沿用受保护的 `~/.sanq-deploy` 三文件、匹配 Agent Ed25519 公钥、唯一固定主机及受限 SSH 选项。新增脚本不允许其他目标/用户/端口/密钥或任意远端命令。

仅有以下**只读**子命令：

```sh
/bin/sh ops/release/sanq-install.sh status \
  --source-sha <40位小写main提交SHA> \
  --retention-id <64位小写保留材料ID>
```

实际命令只会通过固定身份运行：

```text
/usr/bin/systemctl --system show sanq-runtime-install-<retention-id>.service --no-pager --property=<固定11字段>
```

对 `loaded` 状态，核 `Transient=yes`、`Type=oneshot`，以及与目标 `source-sha` 和 `retention-id` 同时绑定的 **installation-run/installation-cleanup** 两条固定 `ExecStart/ExecStopPost` 命令。只允许从 `loaded` 或 `not-found` 得到观察结果；未知字段、重复字段、格式/身份错误、非零 SSH 返回和连接中断全部阻断，不输出成功观察。禁日志中回显原始的 `ExecStart` 及任何主机、密钥材料。查询只发一次 SSH，不自动重试。

观察 JSON 会明确输出 `managerIdentityMatched`、`invocationId` 及相关 manager 状态；始终固定 `installationComplete=false`、`canExecute=false`、`readyToInstall=false`、`restoreProven=false`。**manager 的 success、exit 0、unit not-found 以及本地客户端退出码 0 都不证明安装已完成或不存在历史任务**。首次安装服务既有 `CollectMode=inactive`，unit 可能被回收；后续仍需要独立、完整的持久证据链审阅，不能凭 unit 消失重提安装。

## 未实现/未授权事项

- 尚无 `installation-submit` Mac 交互同伴；未实现固定目标首帧、手工 AWS 快照内容核验、离机材料确认证据、过程中的可恢复交互协议。
- 尚无首次安装任务退出后**持久完成证据**的整体只读查询与独立一致性验证；本切片只查询 systemd 现存 unit。
- 生产目标/旧版 Runtime/配对镜像/交付包/受保护 bootstrap 尚须独立核验。首次安装不得借普通更新 `status` 代替。
- 现有 VM `install_minimal_executor.py installation-submit` 是高权限现场写入入口，**没有对外开放**；不允许根据本切片调用或将其复制到生产环境。
- 不创建系统服务、sudoers、持久状态/第二权威，未修改九 helper 或 17+Manifest；无依赖/Prisma 变动。

## 验证与下一批

新增 `ops/release/tests/test_sanq_deploy_install_status.py` 离线夹具，覆盖固定 SSH 命令、不准提交/任意参数、双角色 manager 同源同ID绑定、缺失/重复/非规范结果、误报成功、SSH 失败与无输出。Mac Python 3.14.10 CI 离线兼容 lane 通过既有 `test_sanq_deploy_*.py` 命名规则包含新增测试；release 两套 Python lane 继续覆盖。MCP-workspace 不提供 lint/build/test 权限，当前代码尚未在 CI/真机测试。

后续 **FI-MAC-1B** 在已审阅源码上增量实现安装操作者受限交互及准确持久结果查询，需要逐项复核现有 VM 首帧/双帧/离机协议、原两锁/任务身份、等待及未知结果语义。真实生产首次安装仍需新的明确授权，且 D4 后置故障/恢复验收保持 `DEFERRED`。
