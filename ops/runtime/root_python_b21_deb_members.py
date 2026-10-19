"""B2-1C: inert, bounded candidate Debian archive member byte review.

Pure in-memory: independently caller-proposed .deb digest, regular-file hashes,
and raw symlink texts are checked against an *untrusted* supplied .deb archive.
No extraction to filesystem, package signature check, Guest FD/path trust,
execution or authority transfer. Every successful candidate remains BLOCKED.
"""
from __future__ import annotations

import hashlib
import io
import lzma
import re
import tarfile
import zlib
from typing import Any

from root_python_b21_ubuntu_source_chain import MAX_DEB_BYTES

SCHEMA = "sanq.c5.g2.r1.b2b2b2.deb-member-claims.v1"
MAX_MEMBERS = 8192
MAX_TAR_BYTES = 64 * 1024 * 1024
MAX_SELECTED_FILE_BYTES = 32 * 1024 * 1024
MAX_SELECTED_TOTAL = 64 * 1024 * 1024
MAX_REQUESTED_FILES = 64
MAX_REQUESTED_LINKS = 8
MAX_PATH_LEN = 256
MAX_LINK_TEXT = 256
MAX_AR_PARTS = 4
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_PART_NAME = re.compile(r"[a-z][a-z0-9.+_-]*(?:\.tar\.(?:gz|xz|zst))?\Z")


class DebMemberBlocked(ValueError):
    """The proposed .deb/member/link claim cannot pass inert review."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise DebMemberBlocked(reason)


def _candidate_path(raw: Any) -> bool:
    return (type(raw) is str and raw.isascii() and 0 < len(raw) <= MAX_PATH_LEN
            and not raw.startswith("/") and not raw.endswith("/")
            and all(32 < ord(c) < 127 for c in raw)
            and all(x not in ("", ".", "..") for x in raw.split("/")))


def _link_text(raw: Any) -> bool:
    return (type(raw) is str and raw.isascii() and 0 < len(raw) <= MAX_LINK_TEXT
            and not raw.startswith("//")
            and all(32 < ord(c) < 127 for c in raw))


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _ar_parts(deb: bytes) -> dict[str, bytes]:
    _require(deb.startswith(b"!<arch>\n"), "invalid Debian ar magic")
    parts: dict[str, bytes] = {}
    offset = 8
    while offset < len(deb):
        _require(len(parts) < MAX_AR_PARTS and offset + 60 <= len(deb),
                 "bad ar member count or truncated header")
        header = deb[offset:offset + 60]
        offset += 60
        _require(header[58:60] == b"`\n", "invalid ar header terminator")
        try:
            name = header[:16].decode("ascii").rstrip(" ")
            size_str = header[48:58].decode("ascii").strip()
        except UnicodeError as exc:
            raise DebMemberBlocked("non-ASCII ar header") from exc
        _require(name.endswith("/") and name != "/"
                 and _PART_NAME.fullmatch(name[:-1]) is not None
                 and size_str.isdecimal() and size_str.isascii()
                 and 0 < len(size_str) <= 10,
                 "unexpected GNU ar name/size or longname scheme")
        name = name[:-1]
        size = int(size_str)
        _require(name not in parts and 0 <= size <= len(deb) - offset,
                 "duplicate or truncated ar member")
        parts[name] = deb[offset:offset + size]
        offset += size
        if size % 2:
            _require(offset < len(deb) and deb[offset:offset + 1] == b"\n",
                     "invalid ar padding byte")
            offset += 1
    _require(parts.get("debian-binary") == b"2.0\n",
             "wrong Debian archive format version")
    _require(len(parts) == 3
             and list(parts)[0] == "debian-binary"
             and list(parts)[1].startswith("control.tar.")
             and list(parts)[2].startswith("data.tar."),
             "noncanonical/missing Debian control or data member order")
    data_name = next(k for k in parts if k.startswith("data.tar."))
    _require(data_name in {"data.tar.xz", "data.tar.gz"},
             "unsupported data.tar compression (zstd requires separate review)")
    return parts


def _tar_payload(data: bytes, name: str) -> bytes:
    try:
        if name.endswith(".xz"):
            decoder = lzma.LZMADecompressor(format=lzma.FORMAT_XZ)
            raw = decoder.decompress(data, max_length=MAX_TAR_BYTES + 1)
            _require(decoder.eof and not decoder.unused_data,
                     "incomplete/concatenated XZ payload")
        else:
            decoder = zlib.decompressobj(wbits=16 + zlib.MAX_WBITS)
            raw = decoder.decompress(data, max_length=MAX_TAR_BYTES + 1)
            _require(decoder.eof and not decoder.unused_data
                     and not decoder.unconsumed_tail,
                     "incomplete/concatenated gzip payload")
    except (EOFError, OSError, ValueError, zlib.error, lzma.LZMAError) as exc:
        raise DebMemberBlocked("malformed compressed tar payload") from exc
    _require(len(raw) <= MAX_TAR_BYTES, "tar inflation exceeds bounded budget")
    return raw


def _member_path(member: tarfile.TarInfo) -> str:
    path = member.name
    _require(type(path) is str, "invalid tar member name")
    if path in (".", "./"):
        _require(member.isdir(), "root tar member must be a directory")
        return ""
    if path.startswith("./"):
        path = path[2:]
    if path.endswith("/") and member.isdir():
        path = path[:-1]
    _require(_candidate_path(path), "unsafe or noncanonical package member path")
    return path


def review_candidate_deb_members(
    deb_archive: Any, *, proposed_deb_sha256: Any,
    proposed_file_sha256: Any, proposed_symlink_text: Any,
) -> dict[str, Any]:
    """Compare *caller-proposed* paths to untrusted archive member bytes.

    Does not assert that package/Release signatures were checked. It cannot
    grant file-pins or symlink paths official/external source authority.
    """
    _require(type(deb_archive) is bytes
             and 8 < len(deb_archive) <= MAX_DEB_BYTES,
             "invalid or oversized candidate Debian archive")
    _require(type(proposed_deb_sha256) is str
             and _SHA.fullmatch(proposed_deb_sha256) is not None
             and _sha(deb_archive) == proposed_deb_sha256,
             "candidate .deb SHA does not match")
    _require(type(proposed_file_sha256) is dict
             and type(proposed_symlink_text) is dict
             and 0 <= len(proposed_file_sha256) <= MAX_REQUESTED_FILES
             and 0 <= len(proposed_symlink_text) <= MAX_REQUESTED_LINKS
             and (len(proposed_file_sha256) + len(proposed_symlink_text)) > 0
             and set(proposed_file_sha256).isdisjoint(proposed_symlink_text),
             "invalid/overlapping selected regular files or links")
    _require(all(_candidate_path(k) and type(v) is str
                 and _SHA.fullmatch(v) is not None
                 for k, v in proposed_file_sha256.items())
             and all(_candidate_path(k) and _link_text(v)
                     for k, v in proposed_symlink_text.items()),
             "unsafe selected path, hash, or symlink target")
    parts = _ar_parts(deb_archive)
    data_name = next(k for k in parts if k.startswith("data.tar."))
    raw = _tar_payload(parts[data_name], data_name)
    found_files: dict[str, str] = {}
    found_links: dict[str, str] = {}
    all_seen: set[str] = set()
    cumulative = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:") as stream:
            for i, member in enumerate(stream):
                _require(i < MAX_MEMBERS, "too many tar entries")
                path = _member_path(member)
                if not path:
                    continue
                _require(path not in all_seen, "duplicate archive member path")
                all_seen.add(path)
                if path in proposed_file_sha256:
                    _require(member.isreg()
                             and 0 < member.size <= MAX_SELECTED_FILE_BYTES,
                             "selected member not a bounded regular file")
                    cumulative += member.size
                    _require(cumulative <= MAX_SELECTED_TOTAL,
                             "selected files total budget exceeded")
                    stream_member = stream.extractfile(member)
                    _require(stream_member is not None,
                             "selected regular member lacks readable payload")
                    with stream_member:
                        content = stream_member.read(member.size + 1)
                    _require(len(content) == member.size,
                             "selected member unexpectedly truncated")
                    digest = _sha(content)
                    _require(digest == proposed_file_sha256[path],
                             "selected file member bytes differ from proposed pin")
                    found_files[path] = digest
                if path in proposed_symlink_text:
                    _require(member.issym() and _link_text(member.linkname),
                             "selected alias must be a safe symlink member")
                    _require(member.linkname == proposed_symlink_text[path],
                             "selected symlink target text mismatch")
                    found_links[path] = member.linkname
    except (tarfile.TarError, EOFError, OSError, ValueError) as exc:
        raise DebMemberBlocked("malformed or truncated tar member inventory") from exc
    _require(set(found_files) == set(proposed_file_sha256)
             and set(found_links) == set(proposed_symlink_text),
             "incomplete requested archive member inventory")
    return {
        "schema": SCHEMA,
        "candidateDebSha256": proposed_deb_sha256,
        "candidateFileSha256": {k: found_files[k] for k in sorted(found_files)},
        "candidateSymlinkText": {k: found_links[k] for k in sorted(found_links)},
        "candidateByteAndLinkTextClaimsMatch": True,
        "ubuntuReleaseSignatureIndependentlyAuthenticated": False,
        "debContainerPackageOriginIndependentlyAuthenticated": False,
        "filePinsIndependentlyAuthenticated": False,
        "guestRootFdAndInodeProvenanceAuthenticated": False,
        "actualDynamicPythonElfDlopenConsumptionWitnessed": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
