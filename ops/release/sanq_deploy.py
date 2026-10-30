"""Mac-only fixed-target SSH adapter for the installed SanQ release tools.

This client neither installs tools nor decides that a release succeeded.
Use /bin/sh ops/release/sanq-deploy.sh --help. No dependency packages required.
"""
import argparse
import base64
import contextlib
import hashlib
import ipaddress
import os
from pathlib import Path
import pwd
import re
import selectors
import signal
import stat
import struct
import subprocess
import sys
import time

ALIAS = "sanq-runtime"
PROFILE_FILES = {"target", "known_hosts", "identity"}
REMOTE_PREFIX = ("cd /opt/sanq/runtime && exec /usr/bin/sudo -n -- "
                 "/usr/bin/python3 -E -S -B -X pycache_prefix=/dev/null "
                 "/opt/sanq/runtime/ops/release/")
MAX_OUTPUT = 4 * 1024 * 1024
MAX_ERROR = 65536


class ClientError(Exception):
    pass


class ClientInterrupted(BaseException):
    def __init__(self, number):
        self.number = number


def _need(condition, reason):
    if not condition:
        raise ClientError(reason)


def _hex(value, length):
    if not re.fullmatch(r"[a-f0-9]{" + str(length) + "}", value):
        raise argparse.ArgumentTypeError("identity must be exact lowercase hexadecimal")
    return value


def _operation(argv):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("profile", help="Inspect the local fixed host and host-key fingerprint", allow_abbrev=False)
    prepare = commands.add_parser("plan", help="Prepare and retain one exact target review", allow_abbrev=False)
    prepare.add_argument("--target-sha", required=True, type=lambda value: _hex(value, 40))
    commands.add_parser("plan-rollback", help="Review and retain the recorded previous release", allow_abbrev=False)
    for name in ("show-plan", "show-sql", "apply", "status", "logs", "show-rollback",
                 "show-rollback-sql", "check-rollback", "rollback", "status-rollback"):
        sub = commands.add_parser(name, allow_abbrev=False)
        sub.add_argument("plan_id", type=lambda value: _hex(value, 64))
        if name == "apply":
            sub.add_argument("--confirm-release", required=True, action="store_true")
            sub.add_argument("--approve-sql", type=lambda value: _hex(value, 64))
        if name == "rollback":
            sub.add_argument("--confirm-rollback", required=True, action="store_true")
        if name in ("rollback", "check-rollback"):
            sub.add_argument("--approve-compatibility", required=True, type=lambda value: _hex(value, 64))
    flags = [argument.partition("=")[0] for argument in argv if argument.startswith("--")]
    if len(flags) != len(set(flags)):
        parser.error("duplicate options are not accepted")
    args = parser.parse_args(argv)
    name = args.command
    if name == "profile":
        return {"command": name, "remote": None, "timeout": 0, "planId": None}
    script, timeout = "collect_deployment_plan.py", 60
    if name == "plan":
        parts, timeout = ["prepare", "--target-sha", args.target_sha, "--save"], 900
    elif name == "plan-rollback":
        parts, timeout = ["prepare-rollback", "--save"], 900
    elif name in ("show-plan", "show-sql", "show-rollback", "show-rollback-sql"):
        parts = ["show" if name == "show-plan" else name, args.plan_id]
    else:
        script = "release_task.py"
        parts = [{"apply": "submit", "rollback": "submit-rollback"}.get(name, name), args.plan_id]
        timeout = 60 if name == "logs" else 900
        if name == "apply":
            parts.append("--confirm-release")
            if args.approve_sql is not None:
                parts.extend(("--approve-sql", args.approve_sql))
        elif name == "rollback":
            parts.extend(("--confirm-rollback", "--approve-compatibility", args.approve_compatibility))
        elif name == "check-rollback":
            parts.extend(("--approve-compatibility", args.approve_compatibility))
    # Only fixed tokens and already validated hex identities enter the remote shell.
    return {"command": name, "remote": REMOTE_PREFIX + script + " " + " ".join(parts),
            "timeout": timeout, "planId": getattr(args, "plan_id", None)}


def _stamp(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _directory(info, private=False):
    _need(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
          and not stat.S_IMODE(info.st_mode) & 0o7022
          and (not private or stat.S_IMODE(info.st_mode) == 0o700), "local profile directory is not private")


def _file(info, maximum):
    _need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1
          and stat.S_IMODE(info.st_mode) in (0o400, 0o600)
          and 0 < info.st_size <= maximum, "local profile file ownership, mode, links or size differs")


def _home():
    home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    _need(home.is_absolute() and not any(ord(char) < 32 or char in '%"$\\' for char in str(home)),
          "local account home cannot be represented as a fixed SSH path")
    return home


def _host(raw):
    try:
        value = raw.decode("ascii")
    except UnicodeError:
        raise ClientError("target must contain one ASCII host and a newline") from None
    host = value[:-1]
    _need(value == host + "\n" and host and len(host) <= 253 and host == host.lower(),
          "target must contain one lowercase host and a newline")
    if re.fullmatch(r"[0-9.]+", host):
        try:
            _need(str(ipaddress.IPv4Address(host)) == host, "target IPv4 address is not canonical")
        except ValueError:
            raise ClientError("target IPv4 address is invalid") from None
    else:
        _need(all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                  for label in host.split(".")), "target hostname is invalid")
    return host


def _host_key(raw):
    try:
        text = raw.decode("ascii")
        fields = text.rstrip("\n").split(" ")
        _need(len(fields) == 3 and fields[:2] == [ALIAS, "ssh-ed25519"]
              and text == " ".join(fields) + "\n", "known_hosts must contain the single fixed Ed25519 alias")
        blob = base64.b64decode(fields[2], validate=True)
        prefix = struct.pack("!I", 11) + b"ssh-ed25519" + struct.pack("!I", 32)
        _need(blob.startswith(prefix) and len(blob) == len(prefix) + 32
              and base64.b64encode(blob).decode("ascii") == fields[2], "invalid Ed25519 host-key encoding")
        return "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
    except (ValueError, UnicodeError):
        raise ClientError("invalid known_hosts encoding") from None


@contextlib.contextmanager
def _profile():
    home = _home()
    with contextlib.ExitStack() as stack:
        home_fd = os.open(home, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        stack.callback(os.close, home_fd)
        _directory(os.fstat(home_fd))
        home_identity = _stamp(os.fstat(home_fd))[:5]
        root = os.open(".sanq-deploy", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=home_fd)
        stack.callback(os.close, root)
        _directory(os.fstat(root), private=True)
        directory = _stamp(os.fstat(root))
        _need(set(os.listdir(root)) == PROFILE_FILES, "local profile must contain exactly target, known_hosts and identity")
        held, saved, raw = {}, {}, {}
        for name, maximum in (("target", 256), ("known_hosts", 1024), ("identity", 65536)):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root)
            stack.callback(os.close, fd)
            info = os.fstat(fd)
            _file(info, maximum)
            held[name], saved[name] = fd, _stamp(info)
            if name != "identity":  # SSH reads the key; this adapter never reads or prints private key bytes.
                content = os.read(fd, maximum + 1)
                _need(len(content) == info.st_size, "local profile short or oversized read")
                raw[name] = content
        def check():
            _directory(os.fstat(home_fd))
            _directory(os.fstat(root), private=True)
            _need(_stamp(os.fstat(home_fd))[:5] == home_identity
                  == _stamp(os.stat(home, follow_symlinks=False))[:5]
                  and _stamp(os.fstat(root)) == directory
                  == _stamp(os.stat(".sanq-deploy", dir_fd=home_fd, follow_symlinks=False))
                  and set(os.listdir(root)) == PROFILE_FILES, "local profile directory changed")
            for name, fd in held.items():
                _need(_stamp(os.fstat(fd)) == saved[name]
                      == _stamp(os.stat(name, dir_fd=root, follow_symlinks=False)), "local profile file changed")
        target = {"home": home, "directory": home / ".sanq-deploy",
                  "host": _host(raw["target"]), "fingerprint": _host_key(raw["known_hosts"]), "check": check}
        check()
        yield target
        check()


def _ssh_argv(target, operation):
    _need(operation["remote"] is not None, "local profile operation cannot enter SSH")
    directory = target["directory"]
    options = ("BatchMode=yes", "StrictHostKeyChecking=yes",
        'UserKnownHostsFile="' + str(directory / "known_hosts") + '"',
        "GlobalKnownHostsFile=/dev/null", "HostKeyAlias=" + ALIAS, "HostKeyAlgorithms=ssh-ed25519",
        "UpdateHostKeys=no", "AddKeysToAgent=no", "VerifyHostKeyDNS=no", "CheckHostIP=no", "IdentitiesOnly=yes",
        "ForwardAgent=no", "ForwardX11=no", "ClearAllForwardings=yes", "Tunnel=no",
        "ControlMaster=no", "ControlPath=none", "ControlPersist=no", "PermitLocalCommand=no",
        "ProxyCommand=none", "ProxyJump=none", "CanonicalizeHostname=no",
        "ConnectTimeout=10", "ConnectionAttempts=1", "ServerAliveInterval=15", "ServerAliveCountMax=3")
    args = ["/usr/bin/ssh", "-F", "/dev/null", "-n", "-T"]
    for option in options:
        args.extend(("-o", option))
    return [*args, "-i", str(directory / "identity"), "-p", "22", "-l", "ubuntu", "--",
            target["host"], operation["remote"]]


def _environment(home):
    result = {"PATH": "/usr/bin:/bin", "HOME": str(home), "LANG": "C", "LC_ALL": "C",
              "TERM": "dumb", "SSH_ASKPASS_REQUIRE": "never"}
    agent = os.environ.get("SSH_AUTH_SOCK")
    if agent is not None:
        _need(os.path.isabs(agent) and len(agent) <= 4096, "invalid local SSH agent path")
        info = os.stat(agent, follow_symlinks=False)
        _need(stat.S_ISSOCK(info.st_mode) and info.st_uid == os.getuid(), "local SSH agent is not the account socket")
        result["SSH_AUTH_SOCK"] = agent
    return result


def _text(raw):
    text = raw.decode("utf-8")
    _need(not any((ord(char) < 32 and char not in "\t\r\n") or 127 <= ord(char) <= 159 for char in text),
          "SSH output contains terminal controls")
    return text


def _stop_local(process):
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            try:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                pass


def _execute(target, operation):
    target["check"]()
    args = _ssh_argv(target, operation)
    deadline = time.monotonic() + operation["timeout"]
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=_environment(target["home"]), cwd=target["home"], close_fds=True, start_new_session=True)
    buffers = {"out": bytearray(), "err": bytearray()}
    try:
        with selectors.DefaultSelector() as selector:
            for name, stream in (("out", process.stdout), ("err", process.stderr)):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, name)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                _need(remaining > 0, "SSH response deadline expired")
                for key, _ in selector.select(min(remaining, 0.2)):
                    try:
                        chunk = os.read(key.fileobj.fileno(), 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    buffers[key.data].extend(chunk)
                    _need(len(buffers[key.data]) <= (MAX_OUTPUT if key.data == "out" else MAX_ERROR),
                          "SSH output budget exceeded")
            while process.poll() is None:
                _need(time.monotonic() < deadline, "SSH exit deadline expired")
                try:
                    process.wait(timeout=min(0.2, max(0.001, deadline - time.monotonic())))
                except subprocess.TimeoutExpired:
                    pass
        _need(process.returncode is not None and process.returncode >= 0, "local SSH process ended by signal")
        _need(time.monotonic() < deadline, "SSH completion deadline expired")
        target["check"]()
        _need(time.monotonic() < deadline, "SSH final profile deadline expired")
        return process.returncode, _text(bytes(buffers["out"])), _text(bytes(buffers["err"]))
    finally:
        _stop_local(process)
        for stream in (process.stdout, process.stderr):
            stream.close()


@contextlib.contextmanager
def _signals():
    def interrupted(number, frame):
        raise ClientInterrupted(number)
    old = {number: signal.getsignal(number) for number in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP)}
    try:
        for number in old:
            signal.signal(number, interrupted)
        yield
    finally:
        for number, handler in old.items():
            signal.signal(number, handler)


def _unknown_guidance(operation):
    if operation["planId"] is None:
        return "计划响应需核查；未取得 plan-id 时先在VM只读核查留存计划，不自动重试。"
    query = "status-rollback" if "rollback" in operation["command"] else "status"
    return "保留原 plan-id " + operation["planId"] + "，查询" + query + "/logs，不自动重提或恢复。"


def main(argv=None):
    operation = _operation(sys.argv[1:] if argv is None else argv)
    attempted = False
    try:
        _need(sys.platform == "darwin" and sys.version_info >= (3, 9) and os.geteuid() != 0,
              "client requires an unprivileged Mac account and CPython 3.9 or newer")
        with _signals(), _profile() as target:
            if operation["remote"] is None:
                code, output, error = 0, "Host: " + target["host"] + "\nHost key: " + target["fingerprint"] + "\n", ""
            else:
                attempted = True
                code, output, error = _execute(target, operation)
        # Emit only after the final local profile ownership/readback checks.
        sys.stdout.write(output)
        sys.stderr.write(error)
        if code != 0:
            print("远端结果需核查；" + _unknown_guidance(operation), file=sys.stderr)
        return code
    except ClientInterrupted as error:
        print(("本地连接已中断，远端结果未知；" + _unknown_guidance(operation)) if attempted
              else "本地检查已中断，尚未发起SSH。", file=sys.stderr)
        return 128 + error.number
    except (ClientError, OSError, ValueError, UnicodeError, subprocess.SubprocessError) as error:
        reason = str(error) if isinstance(error, ClientError) else "无法读取固定本地配置或完成SSH传输"
        print("请求被阻断：" + reason, file=sys.stderr)
        if attempted:
            print("远端结果可能未知；" + _unknown_guidance(operation), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
