# R2-A2-3 — GitHub Actions 隔离 VM 能力探针（本地实现，未运行远端）

> 2026-10-23（America/Toronto）。**LOCAL SOURCE READY / CI NOT_RUN / KVM UNKNOWN / GUEST NOT_RUN / P0-01 NOT_RUN**。基线：`origin/dev@0f4579301f429bf0da378e925c164108f9a731d4`，对应 PR #2919、CI #7487 SUCCESS。本批只在 MCP-workspace 实现**探针**，没有推送或触发新 GitHub Actions 工作流；没有测试生产 Docker、systemd Guard、AWS、Lightsail、Clover、DB 或维护准入。

## 1. 目标与实施边界

为了判断 GitHub 托管 Runner 能否承担 P0-01 隔离 PoC，先回答三个独立问题：

1. **RUNNER/KVM：**`ubuntu-24.04` GitHub-hosted Runner 实际磁盘、可用内存、架构、`/dev/kvm` 的字符设备和读写打开权限。
2. **QEMU：**Runner 能否在无生产数据、无外部网络的边界内安装 Ubuntu 仓库签名的软件包 `qemu-system-x86`、`qemu-utils`、`cloud-image-utils`、`ovmf`，并运行独立 QEMU 进程。
3. **GUEST：**以官方 Ubuntu 24.04 Cloud Image 创建**仅在本次 Job 生命期存在**的 QCOW2 overlay，Guest 内 PID 1 为 systemd，通过串口报告第一次启动及真实内核 Boot ID，由 Runner 通过 QEMU monitor 发起一次系统硬复位，复启后必须观察**不同 Boot ID** 的第二次 systemd marker，避免将同一次开机的重复 service 启动伪报为重启成功。

**本次不做：**不部署 Docker Engine 到 Guest、不运行四个合成生产容器、不创建持久 Boot Guard、不进行 ARMING、修改重启策略或故障注入；绝不以“Guest 两次启动”替代 **P0-01/S03**。Guest 使用 `-nic none`，不复用真实环境变量或生产凭据。

## 2. 文件、触发与结果合同

| 路径 | 作用 |
| --- | --- |
| `.github/workflows/runtime-vm-capability.yml` | 独立 PR→dev 路径限定实验，限同仓 PR，`ubuntu-24.04`、`contents:read`，不使用 Secrets；不改主 CI；22 分钟上限；7 天 report 与 Guest 串口 artifact |
| `ops/runtime/probes/github_runner_vm_capability.py` | 标准库 Python：Runner/KVM/QEMU、官方 HTTPS Ubuntu Cloud Image SHA256SUMS 校验、离线 Guest + monitor 硬复位与结构化证据 |
| `ops/runtime/tests/test_github_runner_vm_capability.py` | 无 VM/网络/sudo 的 unittest：checksum 唯一性、两次串口 marker、KVM 缺失、`P0-01=NOT_RUN` 不变量 |
| 本文、R2-A2-3 主计划、R0、worklog | 记录实际开发阶段、失败边界及后续 CI 门禁 |

**触发：**同仓 PR 目标 `dev` 且修改新 workflow/脚本/测试；不要求在默认 `main` 添加 `workflow_dispatch`，不在 push dev 自动重跑。探针和既有 `ci-change-scope`/`ops-checks` 执行逻辑独立；但**首次新增 `.github/workflows/**` 文件会按现有 `tools/ci/change_scope.py` 的保守路径规则触发常规 CI 全部 lanes**，这是已知的安全审查成本，不能绕过/削弱 selector 来规避。即使常规 CI 全绿也不能冒充 Guest PASS。

**安全边界：**KVM 不存在/不可打开、内存不足 4 GiB 或剩余磁盘不足 5 GiB，记录 `capability=BLOCKED` 且不安装软件或启动 Guest；此时工作流正常结束以保留负证据，**workflow SUCCESS 不等于 KVM/Guest PASS**。KVM 可用才在一次性 Runner 安装 QEMU/OVMF，在有界超时内下载 Canonical 官方 Ubuntu 24.04 Cloud Image（HTTPS + 同站 SHA256SUMS、下载量上限 1.1 GiB）并运行 Guest。**同站 SHA256SUMS 仅检查传输/文件一致性，不是独立 GPG 来源签名**；真正 PoC 需要单独 pin 发行来源与签名。

**报告格式：**`schema=sanq.runtime.github-runner-capability.v1`，`runner.{arch,kernel,pid1,kvm,mem_available_kib,free_disk_bytes}`，`phases.RUNNER/KVM/QEMU/GUEST_SYSTEMD/GUEST_RESET`，`capability=BLOCKED` 或 `GUEST_RESET_PASS_SCOPE_ONLY`。任何结果均为 **`p0_01=NOT_RUN`、`same_version_as_production=NOT_VERIFIED`**；若 Guest 未运行，不产生伪造的 Guest 证据，artifact 可以只有 report。

## 3. 失败和隔离限制

- KVM 不可用：`KVM_UNAVAILABLE`，不启动 QEMU/Guest；不会用性能不可控的软件模拟然后宣称“同版本通过”。
- apt/Cloud Image 下载失败、OVMF 缺失、Guest 超时：以对应 `BLOCKED` 原因保留；脚本自身意外异常才视为工作流代码故障。
- 只观察一次 Guest boot 或没有第二次 systemd marker：不满足 Guest Reset。
- 实验仅在 GitHub 提供的一次性 Ubuntu Runner 上安装临时 QEMU 包；Ubuntu Guest `-nic none`，没有凭据、支付环境或生产资源，QEMU monitor 和 disk 全部存在于 Runner 临时目录。Artifact 只含 report 和合成 Guest 串口日志；无私有网络/身份资料。
- 运行后仍不能推导与生产 AWS Lightsail、Docker daemon、containerd、systemd unit 版本或启动行为一致；**不会关闭 G06/S03/S09**。
- 状态为 `BLOCKED` 且工作流返回成功，代表可用性探测完成、结果是“不支持/未证实”；**真实判定只看 JSON 中 `capability` 字段**，不能用 Actions 绿色标记推断支持完整嵌套 VM。

## 4. 验证、文档及后续交接

现有 `.github/workflows/ci.yml` 中 `ops_runtime` 对 `ops/runtime/tests/test_*.py` 的 unittest 仍是源代码门禁；新 workflow 是独立的 Runner 环境实验，不影响主 CI。MCP-workspace 不开放 lint/build/test/Actions 执行，本地仅能审阅源码、测试和差异，**不宣称 KVM/QEMU/Guest 通过**。

该切片仅 Runtime/Ops owner 增量新增，未修改 `NormalUpdateFlow`、A2-1 状态机、受保护 Runtime 17 Bundle、业务/外部合同、主 CI 选择器、依赖/锁、Prisma 或生产权限；依赖图/SCC 不变。

**下一步门禁：**本地改动报告→用户审阅并单独授权新 PR→dev→取得真实 Runner 能力报告。如果 `capability=GUEST_RESET_PASS_SCOPE_ONLY` 才可继续设计另批获批的 Docker+systemd PoC；否则切至用户已准备的 VirtualBox 独立环境。**生产和 P0-01 一律 NO-GO**。
