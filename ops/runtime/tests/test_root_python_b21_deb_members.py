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
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from root_python_b21_deb_members import (  # noqa: E402
    DebMemberBlocked, review_candidate_deb_members,
    _ar_parts,
)

REGULAR = "usr/bin/python3.12"
LINK = "lib64/ld-linux-x86-64.so.2"
TARGET = "../lib/x86_64-linux-gnu/ld-linux-x86-64.so.2"
BODY = b"FAKE PYTHON BINARY, NO ELF AND NOT EXECUTABLE"


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def ar_member(name: str, data: bytes, *, slash: bool = True) -> bytes:
    # Standard Debian/GNU short-name ar members only.
    name_field = (name + ("/" if slash else "")).ljust(16)
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
    if compression == "raw":
        return data
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


def raw_zstd_frame(raw: bytes, *, known_size=True) -> bytes:
    # RFC 8878 frame with one uncompressed raw block: synthetic and inert.
    assert len(raw) < 128 * 1024
    if not known_size:
        header = b"\x00\x38"  # 128 KiB declared window; unknown content size.
    elif len(raw) < 256:
        header = b"\x20" + bytes([len(raw)])
    elif len(raw) < 65792:
        header = b"\x60" + (len(raw) - 256).to_bytes(2, "little")
    else:
        header = b"\xa0" + len(raw).to_bytes(4, "little")
    block = ((len(raw) << 3) | 1).to_bytes(3, "little")
    return b"\x28\xb5\x2f\xfd" + header + block + raw


def zstd_bundle(frame=None):
    payload = raw_zstd_frame(tar_payload(compression="raw")) if frame is None else frame
    # Match real Ubuntu short ar names, including a zstd control envelope.
    return b"!<arch>\n" + b"".join(
        ar_member(name, data, slash=False)
        for name, data in [
            ("debian-binary", b"2.0\n"),
            ("control.tar.zst", b"INERT CONTROL ENVELOPE"),
            ("data.tar.zst", payload),
        ]
    )


class RealDebFormatCompatibilityTests(unittest.TestCase):
    def test_short_ar_names_with_or_without_slash_and_mixed_forms(self):
        parts = [("debian-binary", b"2.0\n"),
                 ("control.tar.gz", b"MOCK"), ("data.tar.xz", tar_payload())]
        for flags in ((True, True, True), (False, False, False), (True, False, True)):
            with self.subTest(flags=flags):
                raw = b"!<arch>\n" + b"".join(
                    ar_member(n, b, slash=s) for (n, b), s in zip(parts, flags)
                )
                self.assertEqual(review_candidate_deb_members(**claimed(raw))["decision"], "BLOCKED")

    def test_slash_normalization_cannot_hide_duplicate_ar_names(self):
        raw = bundle() + ar_member("data.tar.xz", tar_payload(), slash=False)
        with self.assertRaisesRegex(DebMemberBlocked, "duplicate"):
            review_candidate_deb_members(**claimed(raw))

    def test_bsd_and_gnu_longname_schemes_stay_rejected(self):
        for name in ("#1/12", "//", "/"):
            with self.subTest(name=name), self.assertRaises(DebMemberBlocked):
                _ar_parts(b"!<arch>\n" + ar_member(name, b"not a normal name", slash=False))

    def test_zstd_raw_and_unknown_size_frames_are_bounded_candidates(self):
        for known_size in (True, False):
            raw = zstd_bundle(raw_zstd_frame(tar_payload(compression="raw"), known_size=known_size))
            if sys.version_info < (3, 14):
                with self.assertRaisesRegex(DebMemberBlocked, "compression.zstd"):
                    review_candidate_deb_members(**claimed(raw))
            else:
                receipt = review_candidate_deb_members(**claimed(raw))
                self.assertEqual(receipt["candidateFileSha256"][REGULAR], sha256(BODY))
                self.assertEqual(receipt["candidateSymlinkText"][LINK], TARGET)
                self.assertEqual(receipt["decision"], "BLOCKED")
                for key in ("readyToInstall", "authorizedToMutateProduction",
                            "filePinsIndependentlyAuthenticated",
                            "ubuntuReleaseSignatureIndependentlyAuthenticated",
                            "actualDynamicPythonElfDlopenConsumptionWitnessed"):
                    self.assertIs(receipt[key], False)

    def test_stdlib_compressed_blocks_and_checksum_on_supported_host(self):
        if sys.version_info < (3, 14):
            with self.assertRaisesRegex(DebMemberBlocked, "compression.zstd"):
                review_candidate_deb_members(**claimed(zstd_bundle()))
            return
        # Positive zstd execution is required on 3.14+, never skipped/mock decoded.
        from compression import zstd
        raw = tar_payload(compression="raw")
        frame = zstd.compress(raw, options={zstd.CompressionParameter.checksum_flag: 1})
        self.assertLess(len(frame), len(raw))
        self.assertEqual(review_candidate_deb_members(**claimed(zstd_bundle(frame)))["decision"], "BLOCKED")
        corrupted = frame[:-1] + bytes([frame[-1] ^ 1])
        with self.assertRaises(DebMemberBlocked):
            review_candidate_deb_members(**claimed(zstd_bundle(corrupted)))

    def test_missing_stdlib_capability_blocks_without_external_fallback(self):
        real_import = __import__
        def missing(name, *args, **kwargs):
            if name == "compression":
                raise ModuleNotFoundError("forced absent stdlib codec")
            return real_import(name, *args, **kwargs)
        with mock.patch("builtins.__import__", side_effect=missing):
            with self.assertRaisesRegex(DebMemberBlocked, "compression.zstd"):
                review_candidate_deb_members(**claimed(zstd_bundle()))
            self.assertEqual(review_candidate_deb_members(**claimed())["decision"], "BLOCKED")

    def test_zstd_truncation_concatenation_and_trailing_bytes_rejected(self):
        frame = raw_zstd_frame(tar_payload(compression="raw"))
        for altered in (frame[:4], frame[:5], frame[:-1], frame + frame,
                        frame + b"trailing"):
            with self.subTest(size=len(altered)), self.assertRaises(DebMemberBlocked):
                review_candidate_deb_members(**claimed(zstd_bundle(altered)))

    def test_zstd_skippable_dictionary_and_oversized_window_rejected(self):
        frames = [
            b"\x50\x2a\x4d\x18" + b"\x00" * 4,
            b"\x28\xb5\x2f\xfd\x21\x01\x00\x01\x00\x00",
            # Unknown content size, 128 MiB window (WD exponent 17), empty last block.
            b"\x28\xb5\x2f\xfd\x00\x88\x01\x00\x00",
        ]
        for frame in frames:
            with self.subTest(frame=frame.hex()), self.assertRaises(DebMemberBlocked):
                review_candidate_deb_members(**claimed(zstd_bundle(frame)))

    def test_zstd_known_and_unknown_output_budgets_rejected(self):
        for known_size in (True, False):
            frame = raw_zstd_frame(tar_payload(compression="raw"), known_size=known_size)
            with mock.patch("root_python_b21_deb_members.MAX_TAR_BYTES", 1024):
                with self.assertRaises(DebMemberBlocked):
                    review_candidate_deb_members(**claimed(zstd_bundle(frame)))

    def test_zstd_wrong_member_digest_still_rejected(self):
        data = claimed(zstd_bundle())
        data["proposed_file_sha256"][REGULAR] = "0" * 64
        with self.assertRaises(DebMemberBlocked):
            review_candidate_deb_members(**data)


if __name__ == "__main__":
    unittest.main()
