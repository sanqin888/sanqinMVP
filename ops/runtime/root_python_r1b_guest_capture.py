"""R1-B/S4: standalone, read-only Guest FD evidence candidate; always BLOCKED.

Not an installer or a trusted loader. Approved source/input staging and the exact
root command require separate review. No network/subprocess/package execution or
Guest output files. The future Mac wrapper retains stdout/stderr and both RCs.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import stat
import sys
import types

SCHEMA = "sanq.r1b.readonly-guest-fd-capture.v1"
PROPOSAL_SCHEMA = "sanq.r1b.readonly-guest-fd-proposal.v1"
SOURCE_SCHEMA = "sanq.r1b.readonly-source-set.v1"
SOURCE_MODULES = (
    "root_python_dependency_manifest",
    "root_python_dependency_alias_fds",
    "root_python_dependency_fd_observer",
    "root_python_dependency_offline_review",
    "root_python_dependency_guest_evidence",
)
SOURCE_FILES = {name + ".py" for name in SOURCE_MODULES} | {
    "root_python_r1b_guest_capture.py",
}
PATHS = {"/usr/bin/python3.12", "/usr/lib/python3.12/os.py",
         "/lib64/ld-linux-x86-64.so.2"}
LINKS = {"/lib64": "usr/lib64",
         "/usr/lib64/ld-linux-x86-64.so.2":
             "../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"}
ROOT_ALIASES = {"/lib": "usr/lib"}
SHA = re.compile(r"[0-9a-f]{64}\Z")
MAX_JSON = 524288
MAX_SOURCE = 65536
MAX_OUTPUT = 2 * 1024 * 1024


class R1BCaptureBlocked(ValueError):
    """The candidate session cannot safely produce a complete observation."""


def require(ok, reason):
    if not ok:
        raise R1BCaptureBlocked(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii") + b"\n"


def json_object(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "duplicate JSON field")
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique,
                       parse_constant=lambda _: (_ for _ in ()).throw(
                           R1BCaptureBlocked("non-finite JSON number")))
    require(type(value) is dict, "expected JSON object")
    return value


def bounded_fd(fd, maximum):
    chunks, used = [], 0
    while True:
        block = os.read(fd, min(65536, maximum + 1 - used))
        if not block:
            return b"".join(chunks)
        chunks.append(block)
        used += len(block)
        require(used <= maximum, "read exceeds bounded budget")


def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_uid, info.st_gid,
            info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def safe_directory(info, uid=0, gid=0):
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == uid and info.st_gid == gid
            and stat.S_IMODE(info.st_mode) & 0o6022 == 0,
            "directory is writable, privileged or not owned by expected user")


def read_owned(path, maximum, *, private=False):
    """Read through held root-owned nofollow ancestors; never reopen a path."""
    uid, gid = 0, 0
    path = os.fspath(path)
    require(path.startswith("/") and len(path) <= 512
            and all(x not in ("", ".", "..") for x in path[1:].split("/")),
            "source/input path must be canonical and absolute")
    held, entries = [], []
    try:
        parent = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        held.append(parent)
        # Fixture ancestors such as /tmp are intentionally not exempted.
        for name in path[1:].split("/")[:-1]:
            safe_directory(os.fstat(parent), uid, gid)
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
                            | os.O_CLOEXEC, dir_fd=parent)
            held.append(child)
            safe_directory(os.fstat(child), uid, gid)
            entries.append((parent, name, child))
            parent = child
        safe_directory(os.fstat(parent), uid, gid)
        if private:
            require(stat.S_IMODE(os.fstat(parent).st_mode) == 0o700,
                    "private input parent must be mode 700")
        name = path.rsplit("/", 1)[1]
        fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW
                     | os.O_CLOEXEC, dir_fd=parent)
        held.append(fd)
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid == uid
                and before.st_gid == gid and before.st_nlink == 1
                and stat.S_IMODE(before.st_mode) & 0o6022 == 0
                and 0 < before.st_size <= maximum, "unsafe source/input file")
        if private:
            require(stat.S_IMODE(before.st_mode) == 0o600,
                    "private input file must be mode 600")
        raw = bounded_fd(fd, maximum)
        require(len(raw) == before.st_size and identity(before) == identity(os.fstat(fd)),
                "source/input changed during read")
        entries.append((parent, name, fd))
        for par, part, child in entries:
            require(identity(os.stat(part, dir_fd=par, follow_symlinks=False))
                    == identity(os.fstat(child)), "source/input ancestor changed")
        return raw
    finally:
        for fd in reversed(held):
            os.close(fd)


def proc_bytes(path, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        return bounded_fd(fd, maximum)
    finally:
        os.close(fd)


def mount_id(fd):
    raw = proc_bytes("/proc/self/fdinfo/" + str(fd), 4096)
    values = [line.split(b":", 1)[1].strip()
              for line in raw.splitlines() if line.startswith(b"mnt_id:")]
    require(len(values) == 1 and values[0].isdigit() and len(values[0]) <= 20
            and int(values[0]) > 0, "missing/ambiguous FD mount ID")
    return int(values[0])


def root_context(fd, *, _fixture_root="/"):
    info = os.fstat(fd)
    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    require((flags & os.O_ACCMODE) == os.O_RDONLY and not (flags & os.O_PATH)
            and stat.S_ISDIR(info.st_mode), "root anchor is not read-only directory FD")
    require(identity(os.stat(_fixture_root, follow_symlinks=False)) == identity(info),
            "held FD no longer names the expected root")
    mid = mount_id(fd)
    rows = []
    for line in proc_bytes("/proc/self/mountinfo", 1024 * 1024).decode("ascii").splitlines():
        fields = line.split()
        if fields and fields[0] == str(mid):
            separator = fields.index("-")
            require(separator >= 6 and len(fields) >= separator + 4,
                    "malformed root mount record")
            rows.append({"mountId": mid, "device": fields[2], "mountRoot": fields[3],
                         "mountPoint": fields[4], "options": fields[5],
                         "fsType": fields[separator + 1], "source": fields[separator + 2]})
    require(len(rows) == 1, "missing/ambiguous mountinfo root record")
    require(rows[0]["device"] == str(os.major(info.st_dev)) + ":" + str(os.minor(info.st_dev)),
            "root FD device differs from mountinfo")
    boot = proc_bytes("/proc/sys/kernel/random/boot_id", 64).decode("ascii").strip()
    namespace = os.readlink("/proc/self/ns/mnt")
    require(re.fullmatch(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}", boot)
            and re.fullmatch(r"mnt:\[[1-9][0-9]*\]", namespace), "invalid boot/namespace record")
    return {"guestBootId": boot, "mountNamespace": namespace, "rootMountId": mid,
            "rootDevice": info.st_dev, "rootInode": info.st_ino,
            "rootUid": info.st_uid, "rootGid": info.st_gid, "rootMode": info.st_mode,
            "rootIdentity": list(identity(info)), "mountRecord": rows[0]}


@contextmanager
def extra_root_alias(fd, *, uid=0, gid=0):
    """Observe /lib separately: B1 must keep rejecting unused link claims."""
    link = os.open("lib", os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
    try:
        before = os.fstat(link)
        text = os.readlink("", dir_fd=link)
        def check():
            require(stat.S_ISLNK(before.st_mode) and before.st_uid == uid
                    and before.st_gid == gid and before.st_nlink == 1
                    and before.st_dev == os.fstat(fd).st_dev
                    and identity(before) == identity(os.fstat(link))
                    and identity(before) == identity(os.stat("lib", dir_fd=fd,
                                                              follow_symlinks=False))
                    and mount_id(link) == mount_id(fd)
                    and os.readlink("", dir_fd=link) == text == ROOT_ALIASES["/lib"],
                    "root alias FD/text/identity drift")
        check()
        yield {"path": "/lib", "linkText": text, "device": before.st_dev,
               "inode": before.st_ino, "uid": before.st_uid, "gid": before.st_gid,
               "mode": stat.S_IMODE(before.st_mode), "mountId": mount_id(link)}
        check()
    finally:
        os.close(link)


def observe_session(root_fd, *, manifest, manifest_sha256, pins, expected_context,
                    alias_api, observer_api, _fixture_uid=None, _fixture_gid=None,
                    _fixture_root="/"):
    """In-process B1 -> B3B1 held-FD handoff; no candidate byte execution."""
    uid = 0 if _fixture_uid is None else _fixture_uid
    gid = 0 if _fixture_gid is None else _fixture_gid
    before = root_context(root_fd, _fixture_root=_fixture_root)
    require(all(before.get(k) == v for k, v in expected_context.items()),
            "live root/session differs from approved candidate context")
    safe_directory(os.fstat(root_fd), uid, gid)
    with extra_root_alias(root_fd, uid=uid, gid=gid) as extra:
        with alias_api.borrow_candidate_alias_fds(
            root_fd, manifest, expected_manifest_sha256=manifest_sha256,
            proposed_file_pins=pins, proposed_exact_links=LINKS,
            _fixture_owner_uid=_fixture_uid, _fixture_owner_gid=_fixture_gid,
        ) as (fds, traces):
            observation = observer_api.capture_preopened_dependency_fds(
                manifest, proposed_manifest_sha256=manifest_sha256,
                proposed_file_pins=pins, opened_file_fds=fds, expected_owner_uid=uid)
            require({r["path"]: r["sha256"] for r in observation["files"]} == pins,
                    "observed file bytes differ from frozen candidate pins")
            require(observation["decision"] == "BLOCKED"
                    and observation["readyToInstall"] is False
                    and observation["authorizedToMutateProduction"] is False,
                    "unexpected observer authority")
        require(root_context(root_fd, _fixture_root=_fixture_root) == before,
                "boot/root/mount context changed during observation")
    require(root_context(root_fd, _fixture_root=_fixture_root) == before,
            "context changed before capture closure")
    return {"context": before, "aliasTraces": traces,
            "fdObservation": observation, "extraRootAlias": extra}


def load_sources(index_path, approved_sha):
    raw = read_owned(index_path, MAX_JSON, private=True)
    require(SHA.fullmatch(approved_sha) and sha(raw) == approved_sha,
            "source index differs from approved bytes")
    index = json_object(raw)
    require(set(index) == {"schema", "repoCommitSha", "files"}
            and index["schema"] == SOURCE_SCHEMA
            and re.fullmatch(r"[0-9a-f]{40}", index["repoCommitSha"])
            and type(index["files"]) is dict and set(index["files"]) == SOURCE_FILES
            and all(type(v) is str and SHA.fullmatch(v) for v in index["files"].values()),
            "invalid source-set contract")
    directory = Path(index_path).parent
    require(Path(__file__).absolute() == directory / "root_python_r1b_guest_capture.py",
            "collector must be in the approved source directory")
    snapshots = {}
    for name, expected in index["files"].items():
        data = read_owned(directory / name, MAX_SOURCE)
        require(sha(data) == expected, "source hash differs: " + name)
        snapshots[name] = data
    modules = {}
    for name in SOURCE_MODULES:
        module = types.ModuleType(name)
        module.__file__ = str(directory / (name + ".py"))
        sys.modules[name] = module
        exec(compile(snapshots[name + ".py"], module.__file__, "exec"), module.__dict__)
        modules[name] = module
    return index, modules


def validate_proposal(proposal, modules):
    require(set(proposal) == {"schema", "sessionClaims", "manifest", "manifestSha256",
                              "filePins", "mountRecord"}
            and proposal["schema"] == PROPOSAL_SCHEMA, "invalid capture proposal")
    claims = proposal["sessionClaims"]
    fields = modules[SOURCE_MODULES[-1]].SESSION_FIELDS - {"rootMountId", "observedAtUtc"}
    require(type(claims) is dict and set(claims) == fields, "invalid session claims")
    # Reuse the existing strict schema; these remain externally supplied claims.
    candidate = dict(claims, rootMountId=1, observedAtUtc="2026-01-01T00:00:00Z")
    modules[SOURCE_MODULES[-1]]._session(candidate)
    require(claims["rootUid"] == 0 and claims["rootGid"] == 0
            and claims["rootMode"] == 0o40755, "not a root-owned fixed Guest root")
    api = modules[SOURCE_MODULES[0]]
    api.review_dependency_manifest(
        proposal["manifest"], expected_manifest_sha256=proposal["manifestSha256"],
        proposed_external_file_pins=proposal["filePins"])
    require(set(proposal["filePins"]) == PATHS, "first capture requires exactly three selected files")
    mount = proposal["mountRecord"]
    require(type(mount) is dict and set(mount) == {"device", "mountRoot", "mountPoint", "fsType", "source"}
            and all(type(v) is str and 0 < len(v) <= 128 for v in mount.values())
            and mount["mountRoot"] == "/" and mount["mountPoint"] == "/"
            and mount["fsType"] == "ext4", "unapproved root mount model")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proposal", required=True)
    parser.add_argument("--approved-proposal-sha256", required=True)
    parser.add_argument("--source-index", required=True)
    parser.add_argument("--approved-source-index-sha256", required=True)
    parser.add_argument("--collector-id", required=True)
    args = parser.parse_args(argv)
    receipt = {"schema": SCHEMA, "collectionCompleted": False, "failure": None,
               "startedAtUtc": datetime.now(timezone.utc).isoformat(),
               "collectorRanAsRoot": os.geteuid() == 0, "guestPacket": None,
               "processIdentity": {"uid": os.getuid(), "euid": os.geteuid(),
                                   "gid": os.getgid(), "egid": os.getegid()},
               "rootAndPlatformAuthenticated": False,
               "externalReleaseProvenanceAuthenticated": False,
               "actualExecutionWitnessed": False, "readyToInstall": False,
               "authorizedToMutateProduction": False, "decision": "BLOCKED"}
    root_fd = None
    try:
        require(sys.platform == "linux" and platform.machine() == "x86_64"
                and sys.version_info[:3] == (3, 12, 3) and os.geteuid() == 0
                and os.getuid() == 0 and os.getgid() == 0 and os.getegid() == 0,
                "requires separately approved root Linux x86_64 Python 3.12.3")
        require(sys.flags.isolated == 1 and sys.flags.no_site == 1
                and sys.flags.dont_write_bytecode == 1, "requires exact -I -S -B startup")
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,95}", args.collector_id),
                "invalid collector identity")
        source_index, modules = load_sources(args.source_index,
                                             args.approved_source_index_sha256)
        proposal_raw = read_owned(args.proposal, MAX_JSON, private=True)
        require(SHA.fullmatch(args.approved_proposal_sha256)
                and sha(proposal_raw) == args.approved_proposal_sha256,
                "proposal differs from separately approved bytes")
        proposal = json_object(proposal_raw)
        validate_proposal(proposal, modules)
        receipt.update(sourceIndexSha256=args.approved_source_index_sha256,
                       proposalSha256=sha(proposal_raw),
                       sourceCommit=source_index["repoCommitSha"],
                       sourceFileSha256=source_index["files"])
        claims = proposal["sessionClaims"]
        root_fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        live = root_context(root_fd)
        expected = {k: claims[k] for k in ("guestBootId", "mountNamespace", "rootDevice",
                    "rootInode", "rootUid", "rootGid", "rootMode")}
        expected["mountRecord"] = dict(proposal["mountRecord"],
                                       mountId=live["rootMountId"],
                                       options=live["mountRecord"]["options"])
        observed = observe_session(
            root_fd, manifest=proposal["manifest"], manifest_sha256=proposal["manifestSha256"],
            pins=proposal["filePins"], expected_context=expected,
            alias_api=modules[SOURCE_MODULES[1]], observer_api=modules[SOURCE_MODULES[2]])
        receipt["rawObservation"] = observed
        session = dict(claims, rootMountId=observed["context"]["rootMountId"],
                       observedAtUtc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
        collector = {"repoCommitSha": source_index["repoCommitSha"],
                     "collectorSourceSha256": source_index["files"]["root_python_r1b_guest_capture.py"],
                     "collectorId": args.collector_id,
                     "commandId": "b2b2b2-guest-readonly-evidence-v1", "exitCode": 0}
        packet = modules[SOURCE_MODULES[-1]].build_claimed_guest_packet(
            proposal["manifest"], expected_manifest_sha256=proposal["manifestSha256"],
            proposed_file_pins=proposal["filePins"], proposed_exact_links=LINKS,
            alias_traces=observed["aliasTraces"], fd_observation=observed["fdObservation"],
            session=session, collector=collector)
        require(root_context(root_fd) == observed["context"], "root/session drift before final receipt")
        receipt.update(collectionCompleted=True, guestPacket=packet)
    except Exception as exc:
        receipt["failure"] = {"type": type(exc).__name__, "message": str(exc)[:1024]}
    finally:
        if root_fd is not None:
            os.close(root_fd)
    receipt["finishedAtUtc"] = datetime.now(timezone.utc).isoformat()
    data = encoded(receipt)
    require(len(data) <= MAX_OUTPUT, "capture receipt exceeds output budget")
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()
    return 0 if receipt["collectionCompleted"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
