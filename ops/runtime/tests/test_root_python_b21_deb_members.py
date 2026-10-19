"""B2-1C fabricated ar/tar member bytes; never read any real Ubuntu package."""
from __future__ import annotations

import gzip
import hashlib
import io
import lzma
from pathlib import Path
import sys
import tarfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from root_python_b21_deb_members import (  # noqa: E402
    DebMemberBlocked, review_candidate_deb_members,
)

REGULAR = "usr/bin/python3.12"
LINK = "lib64/ld-linux-x86-64.so.2"
TARGET = "../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
BODY = b"FAKE PYTHON BINARY, NO ELF AND NOT EXECUTABLE"


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def ar_member(name: str, data: bytes) -> bytes:
    # Standard Debian/GNU short-name ar members only.
    name_field = (name + "/").ljust(16)
    header = (
        name_field + "0".ljust(12) + "0".ljust(6)
        + "0".ljust(6) + "100644".ljust(8)
        + str(len(data)).ljust(10) + "`\n"
    ).encode("ascii")
    assert len(header) == 60
    return header + data + (b"\n" if len(data) % 2 else b"")


def deb(parts: list[tuple[str, bytes]]) -> bytes:
    return b"!<arch>\n" + b"".join(ar_member(*p) for p in parts)


def tar_payload(entries=None, *, compression="xz"):
    if entries is None:
        entries = [
            ("./", "dir", b""),
            ("./usr", "dir", b""),
            ("./usr/bin", "dir", b""),
            ("./usr/bin/python3.12", "file", BODY),
            ("./lib64", "dir", b""),
            ("./lib64/ld-linux-x86-64.so.2", "symlink", TARGET),
        ]
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.USTAR_FORMAT) as stream:
        for name, kind, content in entries:
            info = tarfile.TarInfo(name)
            if kind == "dir":
                info.type = tarfile.DIRTYPE
                info.mode = 0o755
                info.size = 0
            elif kind == "file":
                info.type = tarfile.REGTYPE
                info.mode = 0o755
                info.size = len(content)
            elif kind == "symlink":
                info.type = tarfile.SYMTYPE
                info.linkname = content
                info.size = 0
            elif kind == "hardlink":
                info.type = tarfile.LNKTYPE
                info.linkname = REGULAR
                info.size = 0
            else:
                raise AssertionError(kind)
            stream.addfile(info, io.BytesIO(content) if kind == "file" else None)
    data = raw.getvalue()
    return (lzma.compress(data, format=lzma.FORMAT_XZ)
            if compression == "xz" else gzip.compress(data))


def bundle(entries=None, *, compression="xz"):
    return deb([
        ("debian-binary", b"2.0\n"),
        ("control.tar.gz", b"MOCK CONTROL DATA"),
        (f"data.tar.{compression}", tar_payload(entries, compression=compression)),
    ])


def claimed(source=None):
    archive = bundle() if source is None else source
    return {
        "deb_archive": archive,
        "proposed_deb_sha256": sha256(archive),
        "proposed_file_sha256": {REGULAR: sha256(BODY)},
        "proposed_symlink_text": {LINK: TARGET},
    }


class CandidateDebMembersTests(unittest.TestCase):
    def setUp(self):
        self.data = claimed()

    def check(self):
        return review_candidate_deb_members(**self.data)

    def replace_deb(self, raw: bytes):
        self.data["deb_archive"] = raw
        self.data["proposed_deb_sha256"] = sha256(raw)

    def test_matching_archive_is_still_permanently_blocked(self):
        receipt = self.check()
        self.assertEqual(receipt["decision"], "BLOCKED")
        self.assertEqual(receipt["candidateFileSha256"][REGULAR], sha256(BODY))
        self.assertEqual(receipt["candidateSymlinkText"][LINK], TARGET)
        self.assertIs(receipt["filePinsIndependentlyAuthenticated"], False)
        self.assertIs(receipt["guestRootFdAndInodeProvenanceAuthenticated"], False)
        self.assertIs(receipt["authorizedToMutateProduction"], False)

    def test_gzip_data_tar_candidate_supported_but_not_authenticated(self):
        self.replace_deb(bundle(compression="gz"))
        self.assertEqual(self.check()["decision"], "BLOCKED")

    def test_proposed_deb_hash_mismatch(self):
        self.data["proposed_deb_sha256"] = "0" * 64
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_regular_file_pin_mismatch(self):
        self.data["proposed_file_sha256"][REGULAR] = "0" * 64
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_alias_text_mismatch(self):
        self.data["proposed_symlink_text"][LINK] = "/tmp/elsewhere"
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_missing_proposed_member(self):
        self.data["proposed_file_sha256"] = {
            "usr/bin/does-not-exist": sha256(BODY),
        }
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_path_traversal_declared_member_blocked(self):
        self.data["proposed_file_sha256"] = {"../etc/passwd": sha256(BODY)}
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_unsafe_member_path_blocked_even_if_unrequested(self):
        entries = [("../etc/passwd", "file", BODY),
                   ("./usr/bin/python3.12", "file", BODY),
                   ("./lib64/ld-linux-x86-64.so.2", "symlink", TARGET)]
        self.replace_deb(bundle(entries))
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_duplicate_regular_tar_path_blocked(self):
        entries = [("./usr/bin/python3.12", "file", BODY),
                   ("./usr/bin/python3.12", "file", BODY),
                   ("./lib64/ld-linux-x86-64.so.2", "symlink", TARGET)]
        self.replace_deb(bundle(entries))
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_hardlink_cannot_impersonate_regular_member(self):
        entries = [("./usr/bin/python3.12", "hardlink", b""),
                   ("./lib64/ld-linux-x86-64.so.2", "symlink", TARGET)]
        self.replace_deb(bundle(entries))
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_regular_member_cannot_impersonate_symlink(self):
        entries = [("./usr/bin/python3.12", "file", BODY),
                   ("./lib64/ld-linux-x86-64.so.2", "file", b"FOO")]
        self.replace_deb(bundle(entries))
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_symlink_target_in_archive_mismatch_even_with_resealed_deb(self):
        entries = [("./usr/bin/python3.12", "file", BODY),
                   ("./lib64/ld-linux-x86-64.so.2", "symlink", "../elsewhere")]
        self.replace_deb(bundle(entries))
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_member_bytes_modified_even_if_deb_digest_resealed(self):
        changed = BODY + b"CHANGED"
        entries = [("./usr/bin/python3.12", "file", changed),
                   ("./lib64/ld-linux-x86-64.so.2", "symlink", TARGET)]
        self.replace_deb(bundle(entries))
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_duplicate_ar_member_names_blocked(self):
        raw = deb([
            ("debian-binary", b"2.0\n"),
            ("control.tar.gz", b"MOCK"),
            ("data.tar.xz", tar_payload()),
            ("data.tar.xz", tar_payload()),
        ])
        self.replace_deb(raw)
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_debian_container_ar_member_order_must_be_canonical(self):
        raw = deb([
            ("control.tar.gz", b"MOCK"),
            ("debian-binary", b"2.0\n"),
            ("data.tar.xz", tar_payload()),
        ])
        self.replace_deb(raw)
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_debian_magic_version_must_be_exact(self):
        raw = deb([
            ("debian-binary", b"2.1\n"),
            ("control.tar.gz", b"MOCK"),
            ("data.tar.xz", tar_payload()),
        ])
        self.replace_deb(raw)
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_no_zstd_fallback_or_implicit_new_dependency(self):
        raw = deb([
            ("debian-binary", b"2.0\n"),
            ("control.tar.gz", b"MOCK"),
            ("data.tar.zst", b"FAKE ZSTD STREAM"),
        ])
        self.replace_deb(raw)
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_truncated_ar_entry_blocked(self):
        self.replace_deb(self.data["deb_archive"][:-9])
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_no_empty_or_unbounded_selection(self):
        self.data["proposed_file_sha256"] = {}
        self.data["proposed_symlink_text"] = {}
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_link_path_must_not_collide_with_regular_path(self):
        self.data["proposed_symlink_text"][REGULAR] = "../escape"
        with self.assertRaises(DebMemberBlocked):
            self.check()

    def test_fake_externally_authenticated_flag_rejected(self):
        self.data["externalSourceAuthenticated"] = True
        with self.assertRaises(TypeError):
            self.check()


if __name__ == "__main__":
    unittest.main()
