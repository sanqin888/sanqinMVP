"""Read-only Mac first-install task observer and local AWS target preflight.

Requires the existing protected .sanq-deploy profile and matching SSH identity.
Does not submit/install, verify AWS origin, or interpret manager success as
installation completion. Usage: /bin/sh ops/release/sanq-install.sh --help.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
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
TARGET_FILE = "sanq-install-target.json"
TARGET_LIMIT = 65536


def _hex(value, length):
    if re.fullmatch(r"[a-f0-9]{" + str(length) + "}", value) is None:
        raise argparse.ArgumentTypeError("expected exact lowercase hexadecimal identity")
    return value


def _operation(argv):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("status", "check-target"):
        sub = commands.add_parser(name, allow_abbrev=False)
        sub.add_argument("--source-sha", required=True, type=lambda v: _hex(v, 40))
        sub.add_argument("--retention-id", required=True, type=lambda v: _hex(v, 64))
    flags = [part.partition("=")[0] for part in argv if part.startswith("--")]
    if len(flags) != len(set(flags)):
        parser.error("duplicate options are not accepted")
    args = parser.parse_args(argv)
    unit = UNIT_PREFIX + args.retention_id + ".service"
    remote = ("/usr/bin/systemctl --system show " + unit
              + " --no-pager --property=" + ",".join(KEYS)) if args.command == "status" else None
    return {"command": "installation-status" if args.command == "status" else "target-check",
            "remote": remote, "timeout": 60 if remote else 0,
            "sourceSha": args.source_sha, "retentionId": args.retention_id,
            "unit": unit, "planId": None}



def _pairs(items):
    value = {}
    for name, item in items:
        transport._need(name not in value, "duplicate operator target field")
        value[name] = item
    return value


def _target_bytes(target):
    """Read one fixed, user-owned home file; do not extend .sanq-deploy inventory."""
    home = target["home"]
    target["check"]()
    root = os.open(home, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        before = os.fstat(root)
        transport._directory(before)
        transport._need(transport._stamp(before) == transport._stamp(
            os.stat(home, follow_symlinks=False)), "operator home changed")
        fd = os.open(TARGET_FILE, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                     dir_fd=root)
        try:
            identity = os.fstat(fd)
            transport._need(stat.S_ISREG(identity.st_mode) and identity.st_uid == os.getuid()
                            and identity.st_nlink == 1
                            and stat.S_IMODE(identity.st_mode) in (0o400, 0o600)
                            and 0 < identity.st_size <= TARGET_LIMIT,
                            "operator target file permissions, type or size differ")
            raw = os.pread(fd, identity.st_size + 1, 0)
            transport._need(len(raw) == identity.st_size
                            and transport._stamp(identity) == transport._stamp(os.fstat(fd))
                            == transport._stamp(os.stat(TARGET_FILE, dir_fd=root, follow_symlinks=False)),
                            "operator target file changed during read")
        finally:
            os.close(fd)
        transport._need(transport._stamp(before) == transport._stamp(os.fstat(root))
                        == transport._stamp(os.stat(home, follow_symlinks=False)),
                        "operator home changed during target read")
        target["check"]()
        return raw
    finally:
        os.close(root)


def _target_value(raw, target):
    """Structural subset mirrors the installed VM's original target contract.

    No local AWS-origin attestation and no permission to start the installation.
    """
    transport._need(type(raw) is bytes and 0 < len(raw) <= TARGET_LIMIT,
                    "operator target input exceeds bounds")
    try:
        value = json.loads(raw.decode("ascii"), object_pairs_hook=_pairs,
            parse_constant=lambda _: transport._need(False, "operator target nonfinite number"))
        canonical = (json.dumps(value, sort_keys=True, separators=(",", ":"),
                                ensure_ascii=True, allow_nan=False) + "\n").encode("ascii")
    except (ValueError, UnicodeError, TypeError, RecursionError):
        raise transport.ClientError("operator target JSON is invalid") from None
    transport._need(type(value) is dict and canonical == raw
        and set(value) == {"schemaVersion", "kind", "accountId", "region", "instanceArn",
                           "instanceName", "sshTarget", "sshHostKeySha256",
                           "linuxSystemDisk", "operatorConfirmed", "instance"}
        and type(value["schemaVersion"]) is int and value["schemaVersion"] == 1
        and value["kind"] == "sanq-minimal-pre-snapshot-target"
        and value["operatorConfirmed"] is True,
        "operator target does not match the canonical v1 contract")
    for key in ("accountId", "region", "instanceArn", "instanceName", "sshTarget",
                "sshHostKeySha256", "linuxSystemDisk"):
        transport._need(type(value[key]) is str, "operator target field type differs")
    transport._need(re.fullmatch(r"[0-9]{12}", value["accountId"]) is not None
        and re.fullmatch(r"[a-z]{2}(?:-[a-z]+)+-[0-9]+", value["region"]) is not None
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,254}", value["instanceName"]) is not None
        and re.fullmatch(r"/dev/[A-Za-z0-9_.-]{1,100}", value["linuxSystemDisk"]) is not None
        and value["sshTarget"] == target["host"]
        and value["sshHostKeySha256"] == target["fingerprint"],
        "operator target does not match fixed Mac host/key or approved field shapes")
    prefix = ("arn:aws:lightsail:" + value["region"] + ":" + value["accountId"] + ":Instance/")
    transport._need(value["instanceArn"].startswith(prefix)
        and re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}",
                         value["instanceArn"][len(prefix):]) is not None,
        "operator target instance ARN differs")
    instance = value["instance"]
    transport._need(type(instance) is dict and instance.get("arn") == value["instanceArn"]
        and instance.get("name") == value["instanceName"]
        and instance.get("resourceType") == "Instance"
        and type(instance.get("location")) is dict
        and instance["location"].get("regionName") == value["region"]
        and type(instance["location"].get("availabilityZone")) is str
        and re.fullmatch(re.escape(value["region"]) + r"[a-z]",
                         instance["location"]["availabilityZone"]) is not None
        and type(instance.get("hardware")) is dict
        and type(instance["hardware"].get("disks")) is list
        and len(instance["hardware"]["disks"]) == 1,
        "operator instance identity or disk inventory differs")
    disk = instance["hardware"]["disks"][0]
    transport._need(type(disk) is dict and disk.get("isSystemDisk") is True
        and disk.get("isAttached") is True and type(disk.get("sizeInGb")) is int
        and 0 < disk["sizeInGb"] <= 65536
        and type(disk.get("path")) is str
        and re.fullmatch(r"/dev/[A-Za-z0-9_.-]{1,100}", disk["path"]) is not None
        and ("attachedTo" not in disk or disk["attachedTo"] in ("", value["instanceName"]))
        and ("resourceType" not in disk or disk["resourceType"] == "Disk")
        and ("location" not in disk or type(disk["location"]) is dict
             and disk["location"].get("regionName") == value["region"]
             and disk["location"].get("availabilityZone")
                 == instance["location"]["availabilityZone"]),
        "operator system disk attachment differs")
    return {"schemaVersion": 1, "kind": "sanq-install-target-preflight",
            "outcome": "TARGET_STRUCTURE_MATCHED_FIXED_PROFILE",
            "targetInputSha256": hashlib.sha256(raw).hexdigest(),
            "fixedHostKeyMatched": True, "instanceInventoryStructurallyReviewed": True,
            "awsOriginAuthenticated": False, "operatorEvidenceIndependentlyVerified": False,
            "readyToInstall": False, "installationComplete": False,
            "canExecute": False, "restoreProven": False}


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
        local_report = None
        with transport._signals(), transport._profile() as target:
            if operation["command"] == "target-check":
                local_report = _target_value(_target_bytes(target), target)
                local_report["requestedSourceSha"] = operation["sourceSha"]
                local_report["requestedRetentionId"] = operation["retentionId"]
            else:
                attempted = True
                code, output, error = transport._execute(target, operation)
        if local_report is not None:
            print(json.dumps(local_report, sort_keys=True, separators=(",", ":")))
            return 0
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
