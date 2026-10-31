# FI-MAC-1A：首次安装 Mac 只读状态查询

> **2026-10-31｜本地工作区待审 / CI_NOT_RUN / MAC_NOT_TESTED / PRODUCTION_NOT_INSTALLED**

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
