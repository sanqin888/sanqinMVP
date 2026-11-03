"""Mac-only explicitly interactive sudo channel for exact installed Runtime operations.

Unlike sanq_deploy.py this entry demands a real local terminal and a single
SSH PTY. SSH receives stdin directly; Python never asks for, reads, stores,
forwards, or logs an operator sudo password. Not a success/installation oracle.
"""
import codecs
import importlib.util
import os
from pathlib import Path
import selectors
import subprocess
import sys
import termios
import time

# An isolated -I/-S launcher does not put its checkout directory on sys.path.
_PATH = Path(__file__).resolve().with_name("sanq_deploy.py")
_SPEC = importlib.util.spec_from_file_location("_sanq_manual_transport", _PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError("fixed SanQ SSH transport is unavailable")
transport = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(transport)

ORIGINAL_PREFIX = transport.REMOTE_PREFIX
MANUAL_PREFIX = (
    "cd /opt/sanq/runtime && exec /usr/bin/sudo -k "
    "-p 'SanQ sudo password for ubuntu: ' -- "
    "/usr/bin/python3 -E -S -B -X pycache_prefix=/dev/null "
    "/opt/sanq/runtime/ops/release/"
)
_ALLOWED = frozenset((
    "plan", "plan-rollback", "show-plan", "show-sql", "apply", "status",
    "logs", "show-rollback", "show-rollback-sql", "check-rollback",
    "rollback", "status-rollback",
))
MAX_OUTPUT = transport.MAX_OUTPUT
MAX_ERROR = transport.MAX_ERROR


def _need(condition, reason):
    transport._need(condition, reason)


def _operation(argv):
    """Reuse the *same* command/identity/approval parser as the non-PTY client."""
    ordinary = transport._operation(argv)
    _need(ordinary["command"] in _ALLOWED
          and isinstance(ordinary["remote"], str)
          and ordinary["remote"].startswith(ORIGINAL_PREFIX)
          and ordinary["timeout"] in (60, 900),
          "manual entry accepts only exact installed Runtime operations")
    return {
        **ordinary,
        "remote": MANUAL_PREFIX + ordinary["remote"][len(ORIGINAL_PREFIX):],
        "manualSudo": True,
        "manualArgv": tuple(argv),
    }


def _ssh_argv(target, operation, identity_path=None):
    arguments = operation.get("manualArgv")
    _need(type(arguments) is tuple and len(arguments) <= 10
          and all(type(value) is str for value in arguments),
          "manual operation arguments differ")
    _need(operation == _operation(list(arguments)),
          "manual SSH command binding differs")
    args = transport._ssh_argv(target, operation, identity_path)
    _need(args[:5] == ["/usr/bin/ssh", "-F", "/dev/null", "-n", "-T"]
          and args.count("-n") == 1 and args.count("-T") == 1,
          "fixed SSH transport shape differs")
    # Only change the PTY switches. Preserve every host-key, identity, network,
    # forwarding, BatchMode and SSH config constraint of the original client.
    return args[:3] + ["-tt"] + args[5:]


def _terminal():
    _need(all(os.isatty(fd) for fd in (0, 1, 2)),
          "manual sudo requires an actual local Mac terminal; no pipe or automation")
    original = termios.tcgetattr(0)
    identity = os.fstat(0)
    _need(os.isatty(0), "terminal disappeared")
    return original, (identity.st_dev, identity.st_ino)


def _safe_text(chunk, decoder, *, final=False):
    try:
        text = decoder.decode(chunk, final=final)
    except UnicodeError:
        raise transport.ClientError("remote terminal output contains invalid UTF-8") from None
    _need(not any(
        (ord(char) < 32 and char not in "\r\n\t")
        or ord(char) == 127 or 128 <= ord(char) <= 159
        or 0x202a <= ord(char) <= 0x202e or 0x2066 <= ord(char) <= 0x2069
        for char in text), "remote terminal output contains unsafe controls")
    # SSH can put the local terminal in raw mode. Never allow a bare remote CR
    # to move the cursor backwards, and render a complete new line in raw mode.
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")


def _stop_ssh(process):
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=2)
    except (OSError, subprocess.TimeoutExpired):
        try:
            process.kill()
            process.wait(timeout=2)
        except (OSError, subprocess.TimeoutExpired):
            pass


def _transport(target, operation, environment, identity_path, deadline):
    """Bounded remote display; stdin is inherited by SSH, never read by Python."""
    _need(time.monotonic() < deadline, "manual SSH deadline expired")
    argv = _ssh_argv(target, operation, identity_path)
    process = subprocess.Popen(
        argv, stdin=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=environment, cwd=target["home"], close_fds=True,
        start_new_session=False,
    )
    budgets = {"out": 0, "err": 0}
    decoders = {name: codecs.getincrementaldecoder("utf-8")("strict")
                for name in budgets}
    try:
        with selectors.DefaultSelector() as selector:
            for name, stream in (("out", process.stdout), ("err", process.stderr)):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, name)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                _need(remaining > 0, "manual SSH output deadline expired")
                for key, _ in selector.select(min(remaining, 0.2)):
                    name = key.data
                    try:
                        chunk = os.read(key.fileobj.fileno(), 65536)
                    except BlockingIOError:
                        continue
                    if not chunk:
                        remaining_text = _safe_text(b"", decoders[name], final=True)
                        if remaining_text:
                            destination = sys.stdout if name == "out" else sys.stderr
                            destination.write(remaining_text)
                            destination.flush()
                        selector.unregister(key.fileobj)
                        continue
                    budgets[name] += len(chunk)
                    _need(budgets[name] <= (MAX_OUTPUT if name == "out" else MAX_ERROR),
                          "manual SSH output budget exceeded")
                    display = _safe_text(chunk, decoders[name])
                    if display:
                        destination = sys.stdout if name == "out" else sys.stderr
                        destination.write(display)
                        destination.flush()
            while process.poll() is None:
                _need(time.monotonic() < deadline, "manual SSH exit deadline expired")
                try:
                    process.wait(timeout=min(0.2, max(0.001, deadline - time.monotonic())))
                except subprocess.TimeoutExpired:
                    pass
        _need(process.returncode is not None and process.returncode >= 0,
              "manual SSH exited without a normal exit code")
        _need(time.monotonic() < deadline, "manual SSH final deadline expired")
        target["check"]()
        return process.returncode
    finally:
        _stop_ssh(process)
        process.stdout.close()
        process.stderr.close()


def _execute(target, operation, original, terminal_identity):
    target["check"]()
    _need((os.fstat(0).st_dev, os.fstat(0).st_ino) == terminal_identity,
          "operator terminal changed")
    environment = transport._environment(target["home"])
    deadline = time.monotonic() + operation["timeout"]
    try:
        with transport._agent_identity(target, environment) as identity_path:
            return _transport(target, operation, environment, identity_path, deadline)
    finally:
        # SSH switches the user's real terminal to raw mode during PTY use.
        # Restore it even on a failed SSH process, timeout or interrupt.
        termios.tcsetattr(0, termios.TCSANOW, original)


def main(argv=None):
    try:
        operation = _operation(sys.argv[1:] if argv is None else argv)
        _need(sys.platform == "darwin" and sys.version_info >= (3, 9)
              and os.geteuid() != 0, "manual entry requires an unprivileged Mac account")
        original, identity = _terminal()
    except (transport.ClientError, OSError, ValueError, termios.error) as error:
        print("人工操作被阻断：" + str(error), file=sys.stderr)
        return 1

    attempted = False
    try:
        with transport._signals(), transport._profile() as target:
            attempted = True
            print("本次将经固定 SSH 主机执行人工 sudo；请等提示后在终端输入密码。"
                  "SSH 退出不表示发布或回滚已经完成。", file=sys.stderr, flush=True)
            code = _execute(target, operation, original, identity)
        if code != 0:
            print("远端执行非零；保留原任务身份，核对 VM 权威结果，勿自动重试。"
                  + transport._unknown_guidance(operation), file=sys.stderr)
        else:
            print("SSH 原生退出码为 0；仍须独立核对 VM 状态，不代表发布/回滚完成。",
                  file=sys.stderr)
        return code
    except transport.ClientInterrupted as error:
        print("人工 SSH 已中断；远端状态未知，勿自动重试。" if attempted
              else "人工操作尚未连接。", file=sys.stderr)
        return 128 + error.number
    except (transport.ClientError, OSError, ValueError, UnicodeError,
            subprocess.SubprocessError, termios.error) as error:
        print(("人工 SSH 结果未知；勿自动重试。" if attempted
               else "人工 SSH 未连接；") + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
