"""Manual disposable hosted-Jammy CLI acceptance, never a production operator."""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import stat
import subprocess
import sys
import tarfile

COMMIT = "711197d2f31d1d6198d37f662e072e647f541efb"
TX = "c1-assembly-20261025-001"
BASE = Path("/root/sanq-runtime-operator")
SOURCE = BASE / "normal-update-v1"
APPROVAL = BASE / "normal-update-approvals" / TX
PREFIX = Path("/opt/sanq/python/3.12.15")
PYTHON = PREFIX / "bin/python3.12"
RESULTS = Path("/root/sanq-c1-negative-results")
PINS = {
    "launch.json": "1bcfe5482876c79239c9137750cd4b744c82c8604e46b293418c7b0bcae6b395",
    "request.json": "54ee69fd11f188a0ff17b636c77c4213a2cf9bea83a3fa8b361a4de2db954cc6",
    "pins.json": "850a3b5745312540eec7b58b6552518c80522ba943049af5ef8e92de684b542f",
}
ENV = dict(HOME="/root", LANG="C", LC_ALL="C", PATH="/usr/bin:/bin", TZ="UTC")


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def regular(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and 0 <= info.st_size <= limit, "unsafe bounded input")
        raw = stream.read(limit + 1)
    require(len(raw) == info.st_size, "input size changed")
    return raw


def private(path):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
            and stat.S_IMODE(info.st_mode) == 0o700, "unsafe lab root")


def guard():
    release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines()
                   if "=" in line)
    require(release.get("ID", "").strip('"') == "ubuntu"
            and release.get("VERSION_ID", "").strip('"') == "22.04"
            and os.uname().machine == "x86_64", "requires Jammy x86_64")
    require((os.getuid(), os.geteuid(), os.getgid(), os.getegid()) == (0, 0, 0, 0),
            "requires disposable runner root")
    expected = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                "GITHUB_REPOSITORY": "sanqin888/sanqinMVP", "GITHUB_REF": "refs/heads/dev",
                "GITHUB_WORKFLOW": "C1 Jammy isolated negative acceptance"}
    require(all(os.environ.get(k) == v for k, v in expected.items()), "wrong hosted workflow")
    require(os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "manual only")
    require(not any(os.environ.get(k) for k in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
                                              "AWS_SESSION_TOKEN")), "AWS credentials forbidden")
    private(Path("/root"))
    require(all(not p.exists() and not p.is_symlink()
                for p in (BASE, RESULTS, PREFIX)), "lab targets already exist")


def install_python(materials):
    raw = regular(materials / "sanq-cpython-3.12.15-jammy-x86_64.tar.gz", 256 * 1024**2)
    require(sha(raw) == "b8238d97ea09cfb608f5d96cee29f033f91f6bb1ab32365f0049a79bbc698555",
            "Python archive mismatch")
    review_raw = regular(materials / "build-review.json", 8 * 1024**2)
    require(sha(review_raw) == "e9a3540f5c9e100325ff9b74643c71b0267f70f3af7d9e385fd9dce67c757222",
            "Python inventory mismatch")
    review = json.loads(review_raw)
    for dep in review["criticalNativeDependencies"]:
        require(sha(regular(Path(dep["realPath"]), 32 * 1024**2)) == dep["sha256"],
                "critical native dependency differs")
    for path in (Path("/opt"), Path("/opt/sanq"), PREFIX.parent):
        if not path.exists() and not path.is_symlink():
            path.mkdir(mode=0o755)
            path.chmod(0o755)
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == info.st_gid == 0
                and not info.st_mode & 0o022, "unsafe interpreter parent")
    PREFIX.mkdir(mode=0o755)
    PREFIX.chmod(0o755)
    inventory = {row["name"]: row for row in review["members"]}
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
        members = archive.getmembers()
        require(len(members) == len(inventory) == 8368, "Python member count differs")
        seen = set()
        for member in members:
            parts = PurePosixPath(member.name).parts
            require(parts[:4] == ("opt", "sanq", "python", "3.12.15")
                    and ".." not in parts and "\\" not in member.name, "unsafe Python path")
            name = "/".join(parts[4:])
            require(name in inventory and name not in seen, "unexpected Python member")
            seen.add(name)
            row = inventory[name]
            require(member.mode == row["mode"] and member.uid == member.gid == 0
                    and not member.mode & 0o022, "Python metadata differs")
            path = PREFIX / name
            if member.isdir() and row["type"] == "directory":
                path.mkdir(mode=member.mode)
                path.chmod(member.mode)
            else:
                require(member.isfile() and row["type"] == "file", "unsupported Python type")
                data = archive.extractfile(member).read()
                require(len(data) == row["bytes"] and sha(data) == row["sha256"],
                        "Python member differs")
                with path.open("xb") as out:
                    out.write(data)
                path.chmod(member.mode)
    return inventory["bin/python3.12"]["sha256"]


def report_ok(raw, launch, request):
    value = json.loads(raw)
    require(value == {"schema": "sanq.runtime.normal-update-bootstrap-result.v1",
            "status": "CANDIDATE_ASSEMBLED", "mode": "ASSEMBLY_ONLY", "transactionId": TX,
            "sourceCommit": COMMIT, "launchMaterialsSha256": sha(launch),
            "requestSha256": sha(request), "sourceProvenanceAuthenticated": False,
            "flowInvoked": False, "launchAuthorized": False, "readyToInstall": False,
            "authorizedToMutateProduction": False, "decision": "BLOCKED"}, "positive report differs")


def run(materials):
    guard()
    os.umask(0o077)
    RESULTS.mkdir(mode=0o700)
    data = json.loads(regular(Path(__file__).parent / "fixtures/c1_assembly_inputs.json", 65536))
    require(set(data) == set(PINS), "unexpected fixture documents")
    inputs = {name: canonical(data[name]) for name in PINS}
    require(all(sha(inputs[n]) == PINS[n] for n in PINS), "independent input pins differ")
    launch = data["launch.json"]
    sources = {}
    for name, pin in launch["sourceFiles"].items():
        require(PurePosixPath(name).name == name and name.endswith(".py"), "unsafe source name")
        raw = regular(Path(__file__).parent / name, 65536)
        require(len(raw) == pin["bytes"] and sha(raw) == pin["sha256"], "candidate source differs")
        sources[name] = raw
    require(len(sources) == 9, "requires exact nine sources")
    interpreter_sha = install_python(materials)
    BASE.mkdir(mode=0o700)
    (BASE / "normal-update-approvals").mkdir(mode=0o700)
    owner = BASE / ".negative-lab-owner"
    owner.write_text(os.environ["GITHUB_RUN_ID"], encoding="ascii")
    owner.chmod(0o400)
    cases = []

    def reset():
        require(owner.read_text() == os.environ["GITHUB_RUN_ID"], "lab ownership changed")
        BASE.chmod(0o700)
        held = BASE / ".held-normal-update-v1"
        if held.exists():
            shutil.rmtree(held)
        for path, files in ((SOURCE, sources), (APPROVAL, inputs)):
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.exists():
                shutil.rmtree(path)
            path.mkdir(mode=0o700)
            for name, raw in files.items():
                (path / name).write_bytes(raw)
                (path / name).chmod(0o400)

    def execute(name, mutate=lambda: None, *, positive=False, preexec=False,
                cwd=None, env=None, flags=None, interpreter=None):
        reset()
        mutate()
        record = {"case": name, "phase": "PREEXEC" if preexec else "BOOTSTRAP", "started": False}
        case_dir = RESULTS / name
        case_dir.mkdir(mode=0o700)
        try:
            selected = interpreter or PYTHON
            try:
                require(selected == PYTHON and sha(regular(PYTHON, 128 * 1024**2)) == interpreter_sha,
                        "interpreter preexec gate")
                bootstrap = SOURCE / "normal_runtime_bootstrap.py"
                require(sha(regular(bootstrap, 65536)) == launch["sourceFiles"][bootstrap.name]["sha256"],
                        "bootstrap preexec gate")
            except ValueError as exc:
                require(preexec, "unexpected preexec refusal")
                record.update(outcome="EXPECTED_REJECTION", reason=str(exc))
                return
            require(not preexec, "preexec negative unexpectedly admitted")
            command = [str(selected), *(flags if flags is not None else ["-I", "-S", "-B"]),
                       str(SOURCE / "normal_runtime_bootstrap.py"), "--transaction-id", TX]
            record["started"] = True
            with (case_dir / "stdout").open("xb") as out, (case_dir / "stderr").open("xb") as err:
                child = subprocess.Popen(command, cwd=cwd or SOURCE, env=env or ENV,
                                         stdout=out, stderr=err, start_new_session=True)
                try:
                    rc = child.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                    raise ValueError("lab timeout; process group killed")
            stdout = regular(case_dir / "stdout", 65536)
            stderr = regular(case_dir / "stderr", 65536)
            record.update(exitCode=rc, stdoutSha256=sha(stdout), stderrSha256=sha(stderr))
            if positive:
                require(rc == 0 and not stderr, "positive CLI failed")
                report_ok(stdout, inputs["launch.json"], inputs["request.json"])
            else:
                require(rc == 2 and not stdout, "negative CLI exit/output differs")
                value = json.loads(stderr)
                require(set(value) == {"status", "failureType", "flowInvoked",
                                      "authorizedToMutateProduction", "decision"}
                        and value["status"] == value["decision"] == "BLOCKED"
                        and value["flowInvoked"] is False
                        and value["authorizedToMutateProduction"] is False, "negative report differs")
            record["outcome"] = "PASS" if positive else "EXPECTED_REJECTION"
        except BaseException as exc:
            record.update(outcome="FAIL", failureType=type(exc).__name__)
            raise
        finally:
            cases.append(record)
            (case_dir / "result.json").write_bytes(canonical(record))
            (RESULTS / "summary.json").write_bytes(canonical({"sourceCommit": COMMIT,
                "transactionId": TX, "runId": os.environ["GITHUB_RUN_ID"],
                "harnessCommit": os.environ["GITHUB_SHA"], "cases": cases,
                "productionAuthorized": False, "flowInvoked": False,
                "complete": len(cases) == 23 and all(c["outcome"] != "FAIL" for c in cases)}))

    def append(path):
        path.write_bytes(path.read_bytes() + b" ")

    def missing(path):
        path.unlink()

    def symlink(path):
        path.rename(path.with_name(".held-" + path.name))
        path.symlink_to(path.with_name(".held-" + path.name))

    execute("baseline", positive=True)
    execute("wrong-bootstrap", lambda: append(SOURCE / "normal_runtime_bootstrap.py"), preexec=True)
    execute("wrong-interpreter-path", preexec=True, interpreter=Path("/usr/bin/python3"))
    execute("extra-environment", env={**ENV, "C1_UNAPPROVED": "1"})
    execute("wrong-cwd", cwd=Path("/root"))
    execute("extra-B-argv", flags=["-I", "-S", "-B", "-B"])
    for name in ("pins.json", "launch.json", "request.json"):
        execute("tamper-" + name, lambda name=name: append(APPROVAL / name))
    execute("wrong-support", lambda: append(SOURCE / "normal_runtime_inputs.py"))
    execute("missing-source", lambda: missing(SOURCE / "normal_runtime_inputs.py"))
    execute("extra-source", lambda: (SOURCE / "extra.py").write_text("# lab\n"))
    execute("missing-input", lambda: missing(APPROVAL / "request.json"))
    execute("extra-input", lambda: (APPROVAL / "extra.json").write_text("{}"))
    execute("writable-ancestor", lambda: BASE.chmod(0o777))
    execute("public-input", lambda: (APPROVAL / "request.json").chmod(0o644))
    execute("public-source", lambda: (SOURCE / "normal_runtime_inputs.py").chmod(0o644))
    execute("wrong-owner-input", lambda: os.chown(APPROVAL / "request.json", 65534, 65534))
    execute("symlink-input", lambda: symlink(APPROVAL / "request.json"))
    execute("symlink-source-directory", lambda: symlink(SOURCE))
    execute("hardlink-input", lambda: os.link(APPROVAL / "request.json", RESULTS / "held-hardlink"))
    execute("fifo-source", lambda: (missing(SOURCE / "normal_runtime_inputs.py"),
                                   os.mkfifo(SOURCE / "normal_runtime_inputs.py", 0o400)))
    execute("final-baseline", positive=True)
    reset()
    print("C1 negative lab complete: 23 cases; no Flow or production authority")


if __name__ == "__main__":
    require(len(sys.argv) == 2 and Path(sys.argv[1]).is_absolute(), "requires materials directory")
    run(Path(sys.argv[1]))
