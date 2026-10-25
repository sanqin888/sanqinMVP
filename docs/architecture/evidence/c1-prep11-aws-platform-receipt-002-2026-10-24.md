# C1-PREP-11 AWS 平台回执 002（操作者粘贴）

归属批次：2026-10-24（America/Toronto）C1-PREP-11；现场采集时间未提供。来源：本会话用户回传的P11-06～07终端文本。证据等级为 **OPERATOR_PASTED / FORMATTED_TEXT**，不是原始stdout/stderr文件、解释器执行结果、远程独立采集或包签名/成员字节验证。

保留用户文本的加粗提示符、反斜杠转义和制表符。下方包版本中的 `\~` 按用户粘贴的Markdown包装保留；解释性文字将其读作Ubuntu版本分隔符 `~`，不声称该整理文本是原始终端字节。对应命令、合同影响及平台方案见 [P11工作包](../Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md)。

```text
**ubuntu@sanq-web**:**\~**$ type -a -P python3 python3.10 python3.12
printf 'P11-06_RC=%s\n' "$?"

/usr/bin/dpkg-query -W -f='${binary:Package}\t${Version}\t${Architecture}\t${Status}\n' python3 python3-minimal python3.10-minimal libpython3.10-minimal libpython3.10-stdlib
printf 'P11-07_RC=%s\n' "$?"
/usr/bin/python3
/bin/python3
/usr/bin/python3.10
/bin/python3.10
P11-06_RC=1
libpython3.10-minimal:amd64	3.10.12-1\~22.04.18	amd64	install ok installed
libpython3.10-stdlib:amd64	3.10.12-1\~22.04.18	amd64	install ok installed
python3	3.10.6-1\~22.04.1	amd64	install ok installed
python3-minimal	3.10.6-1\~22.04.1	amd64	install ok installed
python3.10-minimal	3.10.12-1\~22.04.18	amd64	install ok installed
P11-07_RC=0
```

判定：PATH查询列出 `python3` 与 `python3.10` 的 `/usr/bin`、`/bin` 路径，没有列出 `python3.12`。P11-06 RC1表示请求的名称未全部找到，不表示已经列出的路径不存在；这些路径也不能计作四套独立安装，尚未核对链接关系。

三个版本化3.10包均报告 **amd64 / 3.10.12-1~22.04.18 / install ok installed**。通用 `python3`、`python3-minimal` 包的 `3.10.6-1~22.04.1` 不是对解释器微版本3.10.6的证明。结合回执001，当前现成平台候选可明确为Jammy的 `/usr/bin/python3.10`、CPython3.10.12、Ubuntu revision `3.10.12-1~22.04.18`；这仍是包数据库及路径观察，尚未执行解释器或认证该路径的文件归属、真实字节、关键依赖及启动前保护。

**SECOND_RECEIPT_RECEIVED / SYSTEM_PYTHON_PACKAGE_IDENTIFIED / PLATFORM_DECISION_PENDING / C1_OPEN**。现v1的3.12.3及固定路径尚未更改，没有主机安装、链接替换、目标Python执行或远端提交。
