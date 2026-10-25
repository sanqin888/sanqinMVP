"""PREP-12: authenticated source extraction and review-only build materials.

Runs in an explicitly selected isolated builder, never an installer/launcher.
The hosted builder, system Python/GnuPG/toolchain and Ubuntu APT trust are
declared prerequisites. Receipts do not authenticate themselves or grant C1.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import stat
import subprocess
import tarfile

VERSION = "3.12.15"
SOURCE_NAME = "Python-3.12.15.tar.xz"
SOURCE_SHA256 = "c2c4321961fab0fb999d66e0cecf521c2ab3994c7992873ea99e306c1094fd5a"
SIGNER = "7169605F62C751356D054A26A821E680E5FA6305"
PREFIX = PurePosixPath("opt/sanq/python/3.12.15")
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_EXPANDED_BYTES = 512 * 1024 * 1024


class BuildMaterialsBlocked(ValueError):
    pass


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise BuildMaterialsBlocked(reason)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def write_json(path: Path, value: dict) -> None:
    with path.open("x", encoding="ascii") as stream:
        json.dump(value, stream, sort_keys=True, indent=2, ensure_ascii=True)
        stream.write("\n")


def regular_bytes(path: Path, limit: int) -> bytes:
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= limit,
            "missing, linked or excessive build input")
    raw = path.read_bytes()
    require(len(raw) == info.st_size, "build input changed during read")
    return raw


def require_builder() -> dict:
    release = platform.freedesktop_os_release()
    require(release.get("ID") == "ubuntu" and release.get("VERSION_ID") == "22.04"
            and platform.system() == "Linux" and platform.machine() == "x86_64",
            "an isolated Ubuntu22.04 x86_64 builder is required")
    require(os.getuid() != 0 and os.geteuid() != 0
            and os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
            and os.environ.get("GITHUB_REPOSITORY") == "sanqin888/sanqinMVP"
            and os.environ.get("GITHUB_REF") == "refs/heads/dev",
            "use the reviewed non-root hosted build workflow")
    commit = os.environ.get("GITHUB_SHA", "")
    require(re.fullmatch(r"[0-9a-f]{40}", commit) is not None,
            "exact build workflow source commit required")
    return {"os": "ubuntu", "versionId": "22.04", "architecture": "x86_64",
            "sourceCommit": commit, "builderTrust": "github-hosted-and-ubuntu-apt",
            "runId": os.environ.get("GITHUB_RUN_ID"),
            "runAttempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
            "workflowRef": os.environ.get("GITHUB_WORKFLOW_REF")}


def require_key_listing(text: str) -> None:
    lines = [line.split(":") for line in text.splitlines()]
    require(sum(line[0] == "pub" for line in lines) == 1,
            "exactly one publisher primary key required")
    fingerprints = [line[9] for line in lines if line[0] == "fpr" and len(line) > 9]
    require(bool(fingerprints) and fingerprints[0] == SIGNER,
            "publisher primary fingerprint differs")


def require_signature_status(text: str) -> None:
    records = [line.split() for line in text.splitlines()
               if line.startswith("[GNUPG:] ")]
    forbidden = {"BADSIG", "ERRSIG", "EXPSIG", "EXPKEYSIG", "REVKEYSIG",
                 "KEYEXPIRED", "SIGEXPIRED", "NO_PUBKEY", "FAILURE"}
    require(not any(len(row) > 1 and row[1] in forbidden for row in records),
            "invalid, expired or revoked publisher signature")
    signatures = [row for row in records if len(row) > 1 and row[1] == "VALIDSIG"]
    require(len(signatures) == 1, "one verified publisher signature required")
    row = signatures[0]
    require(len(row) in (11, 12) and (row[11] if len(row) == 12 else row[2]) == SIGNER
            and row[9] in ("8", "9", "10"),
            "unapproved signer or signature hash algorithm")


def extract_source(raw: bytes, destination: Path) -> None:
    """Validate the full inventory before creating any source file."""
    require(digest(raw) == SOURCE_SHA256, "source archive digest differs")
    with tarfile.open(fileobj=io.BytesIO(raw), mode="r:xz") as archive:
        members = archive.getmembers()
        require(0 < len(members) <= 30000, "excessive source inventory")
        names, kinds, expanded = set(), {}, 0
        for member in members:
            name = PurePosixPath(member.name)
            require(not name.is_absolute() and bool(name.parts)
                    and name.parts[0] == "Python-" + VERSION
                    and ".." not in name.parts and "\\" not in member.name
                    and not any(ord(c) < 32 for c in member.name)
                    and str(name) not in names
                    and (member.isdir() or member.isfile()),
                    "unsafe or duplicate source archive member")
            names.add(str(name))
            kinds[str(name)] = member.isdir()
            require(member.size >= 0, "invalid source member size")
            expanded += member.size
        require(expanded <= MAX_EXPANDED_BYTES, "excessive expanded source")
        for name in names:
            require(all(kinds.get(str(parent), True)
                        for parent in PurePosixPath(name).parents),
                    "source file is used as an ancestor directory")
        destination.mkdir(mode=0o700)
        for member in members:
            target = destination.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir():
                target.mkdir(mode=0o755, parents=True, exist_ok=True)
            else:
                target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                with target.open("xb") as output, archive.extractfile(member) as source:
                    while block := source.read(1024 * 1024):
                        output.write(block)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)


def run_gpg(command: list[str], root: Path, label: str) -> str:
    result = subprocess.run(command, capture_output=True, text=True)
    (root / "logs" / (label + ".stdout")).write_text(result.stdout, encoding="utf-8")
    (root / "logs" / (label + ".stderr")).write_text(result.stderr, encoding="utf-8")
    require(result.returncode == 0, "GnuPG " + label + " failed; see build diagnostics")
    return result.stdout


def verify_extract(root: Path) -> None:
    inputs = root / "inputs"
    artifact = inputs / SOURCE_NAME
    raw = regular_bytes(artifact, MAX_SOURCE_BYTES)
    require(digest(raw) == SOURCE_SHA256, "source archive digest differs")
    regular_bytes(inputs / (SOURCE_NAME + ".asc"), 1024 * 1024)
    regular_bytes(inputs / "publisher.gpg", 1024 * 1024)
    home = root / "gnupg"
    home.mkdir(mode=0o700)
    command = ["/usr/bin/gpg", "--no-options", "--batch", "--homedir", str(home),
               "--no-auto-key-retrieve"]
    listing = run_gpg(command + ["--with-colons", "--show-keys",
                      str(inputs / "publisher.gpg")], root, "gpg-key-list")
    require_key_listing(listing)
    run_gpg(command + ["--import", str(inputs / "publisher.gpg")], root, "gpg-import")
    verified = run_gpg(command + ["--status-fd=1", "--verify",
                       str(inputs / (SOURCE_NAME + ".asc")), str(artifact)],
                       root, "gpg-verify")
    require_signature_status(verified)
    require(regular_bytes(artifact, MAX_SOURCE_BYTES) == raw,
            "source archive changed during signature verification")
    extract_source(raw, root / "source")
    (root / "logs" / "gpg-status.txt").write_text(verified, encoding="utf-8")
    write_json(root / "source-receipt.json", {
        "version": VERSION, "sourceSha256": SOURCE_SHA256,
        "publisherPrimaryFingerprint": SIGNER, "signatureVerified": True,
        "launchAuthorized": False, "readyToInstall": False,
    })


def staged_inventory(prefix: Path) -> list[dict]:
    require(prefix.is_dir() and not prefix.is_symlink(), "staged prefix missing")
    rows, total_bytes = [], 0
    resolved = prefix.resolve()
    for path in sorted(prefix.rglob("*")):
        info = path.lstat()
        name = str(path.relative_to(prefix))
        require(not any(ord(c) < 32 for c in name), "invalid staged member name")
        mode = stat.S_IMODE(info.st_mode)
        require(stat.S_ISLNK(info.st_mode) or mode & 0o7022 == 0,
                "unsafe staged member permissions")
        row = {"name": name, "mode": mode}
        if stat.S_ISLNK(info.st_mode):
            target = os.readlink(path)
            require(not Path(target).is_absolute()
                    and path.resolve(strict=True).is_relative_to(resolved),
                    "staged link escapes version prefix")
            row.update(type="symlink", target=target)
        elif stat.S_ISDIR(info.st_mode):
            row.update(type="directory")
        elif stat.S_ISREG(info.st_mode):
            require(info.st_nlink == 1, "staged hardlink is unsupported")
            require(0 <= info.st_size <= MAX_EXPANDED_BYTES,
                    "excessive staged file")
            total_bytes += info.st_size
            require(total_bytes <= 2 * 1024 * 1024 * 1024,
                    "excessive staged inventory bytes")
            row.update(type="file", bytes=info.st_size,
                       sha256=digest(path.read_bytes()))
        else:
            raise BuildMaterialsBlocked("special staged object is unsupported")
        rows.append(row)
        require(len(rows) <= 50000, "excessive staged inventory members")
    require(bool(rows) and any(row["name"] == "bin/python3.12"
            and row["type"] == "file" for row in rows), "versioned interpreter missing")
    return rows


def native_dependencies(root: Path, prefix: Path) -> list[dict]:
    """Bound critical ldd observations to bytes and Ubuntu package records."""
    paths = set()
    for name in ("interpreter-ldd.txt", "extensions-ldd.txt"):
        text = (root / "logs" / name).read_text(encoding="utf-8")
        require("not found" not in text, "missing critical shared library")
        for token in re.findall(r"(?:=>\s+)?(/[^\s()]+)", text):
            path = Path(token.rstrip(":"))
            if not path.resolve(strict=True).is_relative_to(prefix.resolve()):
                paths.add(path)
    require(bool(paths), "critical native dependency observations missing")
    rows = []
    for path in sorted(paths):
        real = path.resolve(strict=True)
        raw = regular_bytes(real, MAX_EXPANDED_BYTES)
        owner = None
        for candidate in dict.fromkeys((str(path), str(real))):
            found = subprocess.run(["/usr/bin/dpkg-query", "-S", candidate],
                                   capture_output=True, text=True)
            if found.returncode == 0:
                owners = [line.rsplit(": ", 1)[0] for line in found.stdout.splitlines()]
                if len(owners) == 1 and re.fullmatch(
                        r"[a-z0-9][a-z0-9+.-]*(?::[a-z0-9]+)?", owners[0]):
                    owner = owners[0]
                    break
        require(owner is not None, "critical native library has no exact package owner")
        metadata = subprocess.run(["/usr/bin/dpkg-query", "-W",
            "-f=${Version}\\t${Architecture}\\t${Status}\\n", owner],
            check=True, capture_output=True, text=True).stdout.strip().split("\t")
        require(len(metadata) == 3 and metadata[2] == "install ok installed",
                "critical package metadata missing")
        rows.append({"observedPath": str(path), "realPath": str(real),
                     "bytes": len(raw), "sha256": digest(raw), "package": owner,
                     "packageVersion": metadata[0], "architecture": metadata[1],
                     "sourceTrust": "declared Ubuntu APT / hosted builder prerequisite"})
    return rows


def package(root: Path) -> None:
    builder = require_builder()
    receipt = json.loads((root / "source-receipt.json").read_text(encoding="ascii"))
    require(receipt == {"version": VERSION, "sourceSha256": SOURCE_SHA256,
            "publisherPrimaryFingerprint": SIGNER, "signatureVerified": True,
            "launchAuthorized": False, "readyToInstall": False},
            "source verification receipt differs")
    prefix = root / "stage" / Path(str(PREFIX))
    members = staged_inventory(prefix)
    dependencies = native_dependencies(root, prefix)
    for name in ("interpreter-smoke.json", "c1-regression.log", "configure.log",
                 "config.log", "make.log", "altinstall.log", "build-packages.tsv"):
        regular_bytes(root / "logs" / name, MAX_EXPANDED_BYTES)
    output = root / "output"
    output.mkdir(mode=0o700)
    archive_path = output / "sanq-cpython-3.12.15-jammy-x86_64.tar.gz"
    with archive_path.open("xb") as target:
        with gzip.GzipFile(filename="", mode="wb", fileobj=target, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for row in members:
                    path = prefix / row["name"]
                    entry = tarfile.TarInfo(str(PREFIX / row["name"]))
                    entry.mode = row["mode"]
                    entry.uid = entry.gid = entry.mtime = 0
                    if row["type"] == "directory":
                        entry.type = tarfile.DIRTYPE
                        archive.addfile(entry)
                    elif row["type"] == "symlink":
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = row["target"]
                        archive.addfile(entry)
                    else:
                        raw = path.read_bytes()
                        require(len(raw) == row["bytes"] and digest(raw) == row["sha256"],
                                "staged object changed before packaging")
                        entry.size = len(raw)
                        archive.addfile(entry, io.BytesIO(raw))
    write_json(output / "build-review.json", {
        "schema": "sanq.c1.python-build-review.v1", "builder": builder,
        "version": VERSION, "prefix": "/" + str(PREFIX), "source": receipt,
        "configureArgs": ["--prefix=/" + str(PREFIX), "--with-ensurepip=no", "CC=/usr/bin/cc"],
        "criticalNativeDependencies": dependencies,
        "members": members, "archiveSha256": digest(archive_path.read_bytes()),
        "installationVerified": False, "launchAuthorized": False, "readyToInstall": False,
        "trustBoundary": "reviewed workflow and hosted builder; not a production permit",
    })
    # The upload step runs only after smoke/regression/dependency collection succeed.
    for name in ("source-receipt.json", "builder.json"):
        (output / name).write_bytes((root / name).read_bytes())
    for name, limit in ((SOURCE_NAME, MAX_SOURCE_BYTES),
                        (SOURCE_NAME + ".asc", 1024 * 1024),
                        ("publisher.gpg", 1024 * 1024)):
        raw = regular_bytes(root / "inputs" / name, limit)
        if name == SOURCE_NAME:
            require(digest(raw) == SOURCE_SHA256, "source proof changed before packaging")
        (output / name).write_bytes(raw)
    for path in (root / "logs").glob("*"):
        require(path.is_file() and not path.is_symlink(), "invalid build log")
        (output / path.name).write_bytes(path.read_bytes())
    sums = "".join(digest(path.read_bytes()) + "  " + path.name + "\n"
                   for path in sorted(output.iterdir()))
    (output / "SHA256SUMS").write_text(sums, encoding="ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preflight", "verify-extract", "package"))
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    require(args.root.is_absolute() and args.root.is_dir() and not args.root.is_symlink(),
            "private absolute build directory required")
    if args.command == "preflight":
        write_json(args.root / "builder.json", require_builder())
    elif args.command == "verify-extract":
        verify_extract(args.root)
    else:
        package(args.root)


if __name__ == "__main__":
    try:
        main()
    except BuildMaterialsBlocked as error:
        raise SystemExit("C1 Python build blocked: " + str(error)) from None
    except (OSError, ValueError, tarfile.TarError,
            subprocess.SubprocessError) as error:
        raise SystemExit("C1 Python build blocked: " + type(error).__name__) from None
