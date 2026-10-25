# C1-PREP-11 AWS 平台回执 001（操作者粘贴）

整理日：2026-10-24（America/Toronto）；现场采集时间未提供。来源：本会话用户回传的P11-01～05终端文本。证据等级为 **OPERATOR_PASTED / FORMATTED_TEXT**，不是原始stdout/stderr文件、`/etc/os-release`原字节、远程独立采集或来源签名验证。

保留用户文本中的开头一行、Markdown加粗与链接包装。只提取明确字段和RC用于平台差异审阅，不按这段重排后的文本计算系统文件/包成员摘要。对应命令、解释及后续查询见 [P11工作包](../Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md)。

```text
printf 'P11-05_RC=%s\n' "$?"
Linux sanq-web 6.8.0-1061-aws x86_64
P11-01_RC=0
PRETTY_NAME="Ubuntu 22.04.5 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.5 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="[https://www.ubuntu.com/](https://www.ubuntu.com/)"
SUPPORT_URL="[https://help.ubuntu.com/](https://help.ubuntu.com/)"
BUG_REPORT_URL="[https://bugs.launchpad.net/ubuntu/](https://bugs.launchpad.net/ubuntu/)"
PRIVACY_POLICY_URL="[https://www.ubuntu.com/legal/terms-and-policies/privacy-policy](https://www.ubuntu.com/legal/terms-and-policies/privacy-policy)"
UBUNTU_CODENAME=jammy
P11-02_RC=0
**dpkg-query:** no packages found matching python3.12-minimal
**dpkg-query:** no packages found matching libpython3.12-minimal
**dpkg-query:** no packages found matching libpython3.12-stdlib
P11-03_RC=1
**dpkg-query:** no path found matching pattern /usr/bin/python3.12
P11-04_RC=1
path=/usr type=directory uid=0 gid=0 mode=755 bytes=4096 links=14 device=66305 inode=1582
path=/usr/bin type=directory uid=0 gid=0 mode=755 bytes=36864 links=2 device=66305 inode=1583
/usr/bin/stat: cannot statx '/usr/bin/python3.12': No such file or directory
P11-05_RC=1
```

判定：操作者回执显示 `sanq-web / Linux / 6.8.0-1061-aws / x86_64 / Ubuntu22.04.5 Jammy`；三个指定3.12包未查到（RC1），目标路径没有包归属（RC1），且 `/usr/bin/python3.12` 不存在（stat RC1）。当前v1在该路径的启动前提不满足，**EXPECTED_INTERPRETER_PATH_ABSENT / C1_PLATFORM_BLOCKED / C1_OPEN**。

这不排除其他路径、虚拟环境或容器中存在Python3.12；实际系统Python版本/路径仍待补充。未安装/替换解释器、修改候选/guard或执行目标Python/维护/AWS/安装操作。
