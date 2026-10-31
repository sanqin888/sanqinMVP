"""Read-only Mac first-install task observer; not an installation or resume client.

Requires the existing protected .sanq-deploy profile and its exact local SSH agent
identity. Does not install tools, submit a task, or interpret manager success as
installation completion. Usage: /bin/sh ops/release/sanq-install.sh status ...
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys

# Reuse the already-reviewed Mac profile, agent selection, and SSH transport.
# -I excludes the checkout directory from sys.path; load this fixed sibling only.
_PATH = Path(__file__).resolve().with_name("sanq_deploy.py")
_SPEC = importlib.util.spec_from_file_location("_sanq_install_transport", _PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError("fixed Mac SSH transport is unavailable")
transport = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(transport)

KEYS = ("LoadState", "Transient", "Type", "ActiveState", "SubState", "Result",
        "InvocationID", "ExecMainCode", "ExecMainStatus", "ExecStart", "ExecStopPost")
UNIT_PREFIX = "sanq-runtime-install-"
OUTPUT_LIMIT = 32768


def _hex(value, length):
    if re.fullmatch(r"[a-f0-9]{" + str(length) + "}", value) is None:
        raise argparse.ArgumentTypeError("expected exact lowercase hexadecimal identity")
    return value


def _operation(argv):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    commands = parser.add_subparsers(dest="command", required=True)
    status = commands.add_parser("status", allow_abbrev=False)
    status.add_argument("--source-sha", required=True, type=lambda v: _hex(v, 40))
    status.add_argument("--retention-id", required=True, type=lambda v: _hex(v, 64))
    flags = [part.partition("=")[0] for part in argv if part.startswith("--")]
    if len(flags) != len(set(flags)):
        parser.error("duplicate options are not accepted")
    args = parser.parse_args(argv)
    unit = UNIT_PREFIX + args.retention_id + ".service"
    remote = ("/usr/bin/systemctl --system show " + unit
              + " --no-pager --property=" + ",".join(KEYS))
    return {"command": "installation-status", "remote": remote, "timeout": 60,
            "sourceSha": args.source_sha, "retentionId": args.retention_id,
            "unit": unit, "planId": None}


def _manager_fields(raw):
    transport._need(type(raw) is str and 0 < len(raw) <= OUTPUT_LIMIT
                    and all(char == "\n" or " " <= char <= "~" for char in raw),
                    "installation manager response is absent, malformed or oversized")
    fields = {}
    for line in raw.splitlines():
        transport._need("=" in line, "invalid installation manager field")
        key, value = line.split("=", 1)
        transport._need(key in KEYS and key not in fields,
                        "duplicate or unknown installation manager field")
        fields[key] = value
    transport._need(set(fields) == set(KEYS), "incomplete installation manager fields")
    transport._need(fields["LoadState"] in ("loaded", "not-found"),
                    "unrecognized installation manager load state")
    for key in ("ActiveState", "SubState", "Result", "InvocationID",
                "ExecMainCode", "ExecMainStatus"):
        transport._need(len(fields[key]) <= 128 and "\n" not in fields[key],
                        "invalid installation manager status field")
    return fields


def _task_argv(source_sha, retention_id, role):
    return ("/usr/bin/python3 -I -S -B "
            "/opt/sanq/install-bootstrap/" + source_sha
            + "/ops/release/install_minimal_executor.py installation-" + role
            + " --source-sha " + source_sha + " --retention-id " + retention_id)


def _manager_exec_matches(raw, expected):
    # Mirror the VM's fixed manager ExecStart/ExecStopPost argv contract.
    return (len(raw) <= 16384 and raw.count("argv[]=") == 1 and raw.count("path=") == 1
            and re.fullmatch(r"\{\s*path=/usr/bin/python3\s*;\s*argv\[\]="
                             + re.escape(expected)
                             + r"\s*;\s*ignore_errors=no\s*;[^{}]*\}", raw) is not None)


def _observation(operation, raw):
    fields = _manager_fields(raw)
    loaded = fields["LoadState"] == "loaded"
    if loaded:
        transport._need(fields["Transient"] == "yes" and fields["Type"] == "oneshot"
                        and _manager_exec_matches(fields["ExecStart"],
                              _task_argv(operation["sourceSha"], operation["retentionId"], "run"))
                        and _manager_exec_matches(fields["ExecStopPost"],
                              _task_argv(operation["sourceSha"], operation["retentionId"], "cleanup")),
                        "manager unit does not match the requested first-install task identity")
    else:
        transport._need(fields["ExecStart"] == "" and fields["ExecStopPost"] == ""
                        and fields["InvocationID"] == "",
                        "unloaded installation task has ambiguous manager identity")
    return {"schemaVersion": 1, "kind": "sanq-install-task-manager-observation",
            "outcome": "MANAGER_UNIT_OBSERVED" if loaded else "MANAGER_UNIT_NOT_FOUND",
            "requestedSourceSha": operation["sourceSha"],
            "retentionId": operation["retentionId"], "unit": operation["unit"],
            "managerIdentityMatched": loaded, "loadState": fields["LoadState"],
            "activeState": fields["ActiveState"], "subState": fields["SubState"],
            "managerResult": fields["Result"], "invocationId": fields["InvocationID"] or None,
            "execMainCode": fields["ExecMainCode"], "execMainStatus": fields["ExecMainStatus"],
            "installationComplete": False, "canExecute": False,
            "readyToInstall": False, "restoreProven": False}


def main(argv=None):
    operation = _operation(sys.argv[1:] if argv is None else argv)
    attempted = False
    try:
        transport._need(sys.platform == "darwin" and sys.version_info >= (3, 9)
                        and transport.os.geteuid() != 0,
                        "installation observer requires an unprivileged Mac and Python 3.9+")
        with transport._signals(), transport._profile() as target:
            attempted = True
            code, output, error = transport._execute(target, operation)
        if code != 0:
            if error:
                sys.stderr.write(error)
            print("安装任务结果未知；按原 source-sha/retention-id 核查，禁止自动重新提交。", file=sys.stderr)
            return code
        report = _observation(operation, output)
        print(json.dumps(report, sort_keys=True, separators=(",", ":")))
        return 0
    except transport.ClientInterrupted as error:
        print("本地查询中断；远端事实未知，禁止据此重提安装任务。" if attempted
              else "本地检查中断，尚未查询远端。", file=sys.stderr)
        return 128 + error.number
    except (transport.ClientError, OSError, ValueError, UnicodeError,
            NotImplementedError, transport.subprocess.SubprocessError):
        print("首次安装状态查询被阻断；远端事实未证实，禁止自动重提或恢复。", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
