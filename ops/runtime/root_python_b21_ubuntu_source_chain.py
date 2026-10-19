"""B2-1B: bounded, inert Ubuntu Release -> Packages -> .deb byte-chain review.

The caller supplies all bytes, receipt digests and repository metadata. This
module checks internal bytes/fields only. In particular it DOES NOT VERIFY GPG
signatures, trusted keys, freshness, mirror provenance, deb member contents, or
Guest FD identities. No network, subprocess, filesystem, root or execution.
"""
from __future__ import annotations

import hashlib
import lzma
import re
from typing import Any

SCHEMA = "sanq.c5.g2.r1.b2b2b2.ubuntu-source-byte-chain.v1"
MAX_RELEASE_BYTES = 262144
MAX_SIGNATURE_BYTES = 32768
MAX_INDEX_ARCHIVE_BYTES = 8 * 1024 * 1024
MAX_INDEX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024
MAX_DEB_BYTES = 32 * 1024 * 1024
MAX_STANZAS = 32768
_SHA = re.compile(r"[0-9a-f]{64}\Z")
_PACKAGE = re.compile(r"[a-z0-9][a-z0-9+.-]{0,127}\Z")
_VERSION = re.compile(r"[0-9][A-Za-z0-9.+:~_-]{0,127}\Z")
_INDEX_PATH = re.compile(
    r"(main|universe|restricted|multiverse)/binary-amd64/Packages(?:\.xz)?\Z"
)
_FILENAME = re.compile(
    r"pool/(main|universe|restricted|multiverse)/"
    r"[a-z0-9.+_-]+(?:/[a-z0-9.+_-]+){1,5}\.deb\Z"
)


class UbuntuSourceChainBlocked(ValueError):
    """Malformed or inconsistent *candidate* Ubuntu archive bytes."""


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise UbuntuSourceChainBlocked(reason)


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _bytes(value: Any, max_len: int, label: str) -> bytes:
    _require(type(value) is bytes and 0 < len(value) <= max_len,
             "invalid/budget-exceeding " + label)
    return value


def _digest_equal(raw: bytes, proposed: Any, label: str) -> None:
    _require(type(proposed) is str and _SHA.fullmatch(proposed) is not None
             and _sha(raw) == proposed, label + " digest mismatch")


def _text(raw: bytes, name: str) -> str:
    try:
        text = raw.decode("utf-8")
    except UnicodeError as exc:
        raise UbuntuSourceChainBlocked("non-UTF8 " + name) from exc
    _require("\x00" not in text and "\r" not in text
             and all(c == "\n" or c == "\t" or ord(c) >= 32 for c in text),
             "control bytes in " + name)
    return text


def _fields(lines: list[str], *, required: set[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in lines:
        if not line.strip():
            continue
        if line.startswith((" ", "\t")):
            # Only the Release SHA256 table may have folded lines.
            raise UbuntuSourceChainBlocked("unexpected folded control metadata")
        match = re.fullmatch(r"([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)", line)
        _require(match is not None, "malformed control stanza")
        key, value = match.groups()
        _require(key not in result, "ambiguous duplicate control field")
        result[key] = value
    _require(required <= result.keys(), "missing required control fields")
    return result


def _release(raw: bytes, path: str) -> tuple[dict[str, str], str, int]:
    lines = _text(raw, "Release").splitlines()
    # SHA256 table is a multiline APT Release field; do not parse stale MD5/SHA1.
    heading = [i for i, line in enumerate(lines) if line == "SHA256:"]
    _require(len(heading) == 1, "missing/duplicate Release SHA256 index")
    i = heading[0]
    start = i + 1
    end = start
    while end < len(lines) and lines[end].startswith((" ", "\t")):
        end += 1
    sha_lines = lines[start:end]
    _require(0 < len(sha_lines) <= 4096, "unbounded or empty Release digest table")
    declared: dict[str, tuple[str, int]] = {}
    for line in sha_lines:
        match = re.fullmatch(r"[ \t]+([0-9a-f]{64})[ \t]+([0-9]+)[ \t]+([^\s]+)",
                             line)
        _require(match is not None, "Release SHA256 line malformed")
        digest, size, filename = match.groups()
        _require(filename not in declared, "duplicate Release index path")
        declared[filename] = (digest, int(size))
    _require(path in declared, "selected index absent from Release")
    # Real Ubuntu Release also contains MD5Sum/SHA1/SHA512 continuation
    # tables. Those are NOT selected or accepted as SHA256 pins.
    non_sha = [line for line in (lines[:i] + lines[end:])
               if not line.startswith((" ", "\t"))]
    fields = _fields(non_sha, required={"Codename", "Suite", "Architectures",
                                        "Components"})
    _require(fields["Codename"] == "noble"
             and fields["Suite"] in {"noble", "noble-updates", "noble-security"}
             and "amd64" in fields["Architectures"].split(),
             "unexpected Ubuntu release identity")
    _require(path.split("/", 1)[0] in fields["Components"].split(),
             "index component not in declared release")
    digest, size = declared[path]
    _require(0 < size <= MAX_INDEX_ARCHIVE_BYTES, "index size over budget")
    return fields, digest, size


def _unpack_index(raw: bytes, name: str) -> bytes:
    if not name.endswith(".xz"):
        _text(raw, "Packages")
        _require(len(raw) <= MAX_INDEX_UNCOMPRESSED_BYTES,
                 "uncompressed Packages exceeds budget")
        return raw
    try:
        dec = lzma.LZMADecompressor(format=lzma.FORMAT_XZ)
        data = dec.decompress(raw, max_length=MAX_INDEX_UNCOMPRESSED_BYTES + 1)
    except (lzma.LZMAError, EOFError, ValueError) as exc:
        raise UbuntuSourceChainBlocked("invalid Packages.xz") from exc
    _require(dec.eof and not dec.unused_data
             and len(data) <= MAX_INDEX_UNCOMPRESSED_BYTES,
             "incomplete, concatenated or unbounded Packages.xz")
    _text(data, "Packages.xz payload")
    return data


def _package(index_raw: bytes, package: str, version: str,
             deb_filename: str) -> dict[str, str]:
    # A bounded Packages index with one or more Debian control paragraphs.
    text = _text(index_raw, "Packages index")
    paragraphs = re.split(r"\n[ \t]*\n", text.strip())
    _require(0 < len(paragraphs) <= MAX_STANZAS,
             "Packages stanza count exceeds budget")
    match: dict[str, str] | None = None
    for block in paragraphs:
        # Folded Description and other fields may appear, but never in needed
        # identity/hash fields; ignore multiline descriptions safely.
        entries: list[str] = []
        previous: str | None = None
        for line in block.splitlines():
            if line.startswith((" ", "\t")):
                _require(previous is not None
                         and previous not in {"Package", "Version",
                                              "Architecture", "Filename",
                                              "Size", "SHA256"},
                         "folded authoritative Packages field")
                continue
            entries.append(line)
            previous = line.split(":", 1)[0]
        stanza = _fields(entries, required=set())
        if (stanza.get("Package") == package
                and stanza.get("Version") == version):
            _require(match is None, "duplicate package/version entry")
            match = stanza
    _require(match is not None, "Package/version missing from Packages index")
    _require({"Package", "Version", "Architecture", "Filename",
              "Size", "SHA256"} <= match.keys(), "incomplete package stanza")
    _require(match["Architecture"] == "amd64"
             and match["Filename"] == deb_filename,
             "package architecture or filename mismatch")
    _require(re.fullmatch(r"[0-9]+", match["Size"]) is not None,
             "malformed package size")
    _require(0 < int(match["Size"]) <= MAX_DEB_BYTES,
             "deb size exceeds budget")
    _require(_SHA.fullmatch(match["SHA256"]) is not None,
             "malformed .deb SHA256")
    return match


def review_ubuntu_source_byte_chain(
    *, release_body: Any, release_signature: Any,
    packages_index_archive: Any, deb_archive: Any,
    packages_index_path: Any, package_name: Any, package_version: Any,
    deb_filename: Any, proposed_release_sha256: Any,
    proposed_signature_sha256: Any, proposed_packages_sha256: Any,
    proposed_deb_sha256: Any,
) -> dict[str, Any]:
    """Compare supplied archive bytes. Every success is still BLOCKED.

    Detached Release.gpg bytes here are unvalidated and untrusted; matching
    caller-proposed SHA256 pins DO NOT establish any external provenance.
    """
    _require(type(packages_index_path) is str
             and _INDEX_PATH.fullmatch(packages_index_path) is not None
             and type(deb_filename) is str
             and _FILENAME.fullmatch(deb_filename) is not None
             and type(package_name) is str
             and _PACKAGE.fullmatch(package_name) is not None
             and type(package_version) is str
             and _VERSION.fullmatch(package_version) is not None,
             "invalid archive resource identity/path")
    release = _bytes(release_body, MAX_RELEASE_BYTES, "Release")
    sig = _bytes(release_signature, MAX_SIGNATURE_BYTES, "Release.gpg")
    index = _bytes(packages_index_archive, MAX_INDEX_ARCHIVE_BYTES, "Packages")
    deb = _bytes(deb_archive, MAX_DEB_BYTES, "deb")
    _digest_equal(release, proposed_release_sha256, "Release")
    _digest_equal(sig, proposed_signature_sha256, "Release.gpg")
    _digest_equal(index, proposed_packages_sha256, "Packages archive")
    _digest_equal(deb, proposed_deb_sha256, "deb archive")
    _, expected_index_sha, expected_index_size = _release(
        release, packages_index_path)
    _require(expected_index_sha == _sha(index)
             and expected_index_size == len(index),
             "Release -> Packages bytes mismatch")
    uncompressed = _unpack_index(index, packages_index_path)
    match = _package(uncompressed, package_name, package_version, deb_filename)
    _require(int(match["Size"]) == len(deb)
             and match["SHA256"] == _sha(deb),
             "Packages -> deb bytes mismatch")
    return {
        "schema": SCHEMA,
        "releaseIndexByteClaimMatches": True,
        "packageArchiveByteClaimMatches": True,
        "ubuntuCodenameAndSuiteClaimsConsistent": True,
        "releaseGpgSignatureVerified": False,
        "trustedUbuntuKeyAndRepositoryAuthenticated": False,
        "ubuntuReleaseValidityIndependentlyEstablished": False,
        "packageMemberBytesAndSymlinksExtracted": False,
        "guestFdToPackagePathAuthenticated": False,
        "pythonElfDlopenClosureVerified": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
        "decision": "BLOCKED",
    }
