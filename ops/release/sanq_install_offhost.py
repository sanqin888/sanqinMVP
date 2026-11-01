"""Mac-only, local off-host index retention for a single reviewed install round.

Not a live SSH peer, AWS verifier, installation submitter or recovery permit.
The existing VM is the sole authority for interpreting the native ACK.  This
module must never be invoked with a directory on the VM or production host.
"""
import contextlib
import fcntl
import hashlib
import os
from pathlib import Path
import stat
import sys

import sanq_install_evidence as evidence
import sanq_install_frames as frames


def _need(condition):
    frames._need(condition)


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_gid,
            stat.S_IMODE(info.st_mode), stat.S_IFMT(info.st_mode))


def _file_fingerprint(info):
    return (_identity(info), info.st_nlink, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns)


@contextlib.contextmanager
def _private_directory(directory, uid):
    _need(type(directory) is str and 0 < len(directory) <= 4096
          and all(ord(c) >= 32 for c in directory))
    path = Path(directory)
    _need(path.is_absolute() and str(path) == directory
          and ".." not in path.parts and len(path.parts) <= 128)
    _need(not any(path == root or root in path.parents for root in map(Path,
          ("/opt", "/srv", "/etc", "/proc", "/sys", "/dev", "/run",
           "/home/ubuntu/sanq-app"))))
    with contextlib.ExitStack() as stack:
        root = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        stack.callback(os.close, root)
        ancestors = []
        for name in path.parts[1:]:
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                            dir_fd=root)
            stack.callback(os.close, child)
            info = os.fstat(child)
            _need(stat.S_ISDIR(info.st_mode) and info.st_uid in (0, uid)
                  and ((stat.S_IMODE(info.st_mode) & 0o022) == 0
                       or (info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX))))
            ancestors.append((root, name, child, _identity(info)))
            root = child
        info = os.fstat(root)
        _need(stat.S_ISDIR(info.st_mode) and info.st_uid == uid
              and stat.S_IMODE(info.st_mode) == 0o700)
        yield root
        for parent, name, child, identity in reversed(ancestors):
            _need(_identity(os.fstat(child)) == identity
                  == _identity(os.stat(name, dir_fd=parent, follow_symlinks=False)))


def _readback(root, name, uid, expected_size):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC,
                 dir_fd=root)
    try:
        before = os.fstat(fd)
        _need(stat.S_ISREG(before.st_mode) and before.st_uid == uid
              and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600
              and before.st_size == expected_size)
        parts, size = [], 0
        while size <= expected_size:
            block = os.read(fd, min(4096, expected_size + 1 - size))
            if not block:
                break
            parts.append(block)
            size += len(block)
        _need(size == expected_size
              and _file_fingerprint(before) == _file_fingerprint(os.fstat(fd))
              == _file_fingerprint(os.stat(name, dir_fd=root, follow_symlinks=False)))
        return b"".join(parts)
    finally:
        os.close(fd)


def retain_index(round_review, evidence_review, transfer_raw, directory, *,
                 operator_confirmed_off_host=False):
    """Write a create-only 0600 index and return the VM's exact native ACK bytes.

    Only a separately authenticated operator may supply a confirmed Mac-local
    directory; structural reviews cannot authenticate AWS or the SSH peer.
    Any error (including an unknown fsync result) consumes this round.  A
    partial/complete file is deliberately never removed or overwritten.
    """
    _need(type(round_review) is frames.Review and round_review.phase == 3
          and not round_review.failed and not round_review.offhost_attempted
          and type(evidence_review) is evidence.EvidenceReview
          and evidence_review.round is round_review
          and evidence_review.finished and not evidence_review.failed
          and evidence_review.snapshot_identity is not None)
    round_review.offhost_attempted = True
    try:
        uid = os.geteuid()
        _need(uid > 0 and sys.platform in ("linux", "darwin")
              and operator_confirmed_off_host is True)
        _need(type(transfer_raw) is bytes
              and round_review.index_transfer_sha == hashlib.sha256(transfer_raw).hexdigest())
        transfer = frames._frame(transfer_raw, 32 * 1024)
        index = transfer["index"]
        arn, name, created, observed, zone = evidence_review.snapshot_identity
        _need(index["snapshotArn"] == arn and index["snapshotName"] == name
              and evidence._timestamp(index["createdAt"]) == created
              and evidence._timestamp(index["availableObservedAt"]) == observed
              and index["snapshotAvailabilityZone"] == zone)
        _need(index["installationId"] == round_review.installation
              and index["retentionId"] == round_review.retention
              and index["challenge"] == round_review.challenge)
        fullsync = getattr(fcntl, "F_FULLFSYNC", None) if sys.platform == "darwin" else None
        _need(sys.platform != "darwin" or type(fullsync) is int)
        raw = frames._canonical(index)
        _need(len(raw) == transfer["indexBytes"]
              and hashlib.sha256(raw).hexdigest() == transfer["indexSha256"])
        leaf = "snapshot-index-" + round_review.installation + ".json"
        with _private_directory(directory, uid) as root:
            free = os.fstatvfs(root)
            _need(free.f_bavail * free.f_frsize >= 1024 * 1024 + len(raw))
            fd = os.open(leaf, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                         0o600, dir_fd=root)
            try:
                before = os.fstat(fd)
                _need(stat.S_ISREG(before.st_mode) and before.st_uid == uid
                      and before.st_nlink == 1 and stat.S_IMODE(before.st_mode) == 0o600)
                remaining = memoryview(raw)
                while remaining:
                    count = os.write(fd, remaining)
                    _need(count > 0)
                    remaining = remaining[count:]
                os.fsync(fd)
                os.fsync(root)
                if fullsync is not None:
                    fcntl.fcntl(fd, fullsync)
                written = os.fstat(fd)
                _need(written.st_size == len(raw)
                      and _readback(root, leaf, uid, len(raw)) == raw)
                final = os.fstat(fd)
                _need(_file_fingerprint(written) == _file_fingerprint(final)
                      == _file_fingerprint(os.stat(leaf, dir_fd=root, follow_symlinks=False))
                      and (before.st_dev, before.st_ino) == (final.st_dev, final.st_ino))
            finally:
                os.close(fd)
        # The VM's _snapshot_index_ack_value validates these exact v1 fields.
        ack = frames._canonical({
            "schemaVersion": 1, "kind": "sanq-minimal-snapshot-index-ack",
            "installationId": index["installationId"],
            "snapshotReviewSha256": index["snapshotReviewSha256"],
            "indexSha256": transfer["indexSha256"],
            "indexBytes": transfer["indexBytes"],
            "transferChallenge": transfer["transferChallenge"],
            "operatorConfirmedOffHost": True, "clientIndexDurable": True,
            "syncMethod": "darwin-fullfsync" if fullsync is not None else "posix-fsync",
            "canExecute": False, "recoveryReady": False})
        round_review.offhost_ack_sha = hashlib.sha256(ack).hexdigest()
        return ack
    except BaseException:
        round_review.failed = True
        raise
