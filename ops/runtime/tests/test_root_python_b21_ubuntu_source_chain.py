"""B2-1B purely synthetic Ubuntu archive byte-chain checks, no real downloads."""
from __future__ import annotations

import hashlib
import lzma
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from root_python_b21_ubuntu_source_chain import (  # noqa: E402
    UbuntuSourceChainBlocked, review_ubuntu_source_byte_chain,
)

PACKAGE = "python3.12-minimal"
VERSION = "3.12.3-1ubuntu0.1"
DEB_PATH = (
    "pool/main/p/python3.12/"
    "python3.12-minimal_3.12.3-1ubuntu0.1_amd64.deb"
)
INDEX_PATH = "main/binary-amd64/Packages.xz"


def digest(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def candidate():
    deb = b"SYNTHETIC .deb TEST DATA, NOT A REAL PACKAGE"
    stanza = (
        f"Package: {PACKAGE}\n"
        f"Version: {VERSION}\n"
        "Architecture: amd64\n"
        f"Filename: {DEB_PATH}\n"
        f"Size: {len(deb)}\n"
        f"SHA256: {digest(deb)}\n"
        "Description: synthetic only\n"
        " with a folded multiline control field\n"
    ).encode("ascii")
    compressed = lzma.compress(stanza, format=lzma.FORMAT_XZ)
    release = (
        "Codename: noble\n"
        "Suite: noble-updates\n"
        "Architectures: amd64 arm64\n"
        "Components: main universe\n"
        "MD5Sum:\n"
        " " + "0" * 32 + " 10 main/binary-amd64/Packages.xz\n"
        "SHA256:\n"
        f" {digest(compressed)} {len(compressed)} {INDEX_PATH}\n"
        "SHA512:\n"
        " " + "f" * 128 + " 10 main/binary-amd64/Packages.xz\n"
    ).encode("ascii")
    sig = b"SYNTHETIC DETACHED SIGNATURE (NOT A GPG SIGNATURE)"
    return {
        "release_body": release, "release_signature": sig,
        "packages_index_archive": compressed, "deb_archive": deb,
        "packages_index_path": INDEX_PATH,
        "package_name": PACKAGE, "package_version": VERSION,
        "deb_filename": DEB_PATH,
        "proposed_release_sha256": digest(release),
        "proposed_signature_sha256": digest(sig),
        "proposed_packages_sha256": digest(compressed),
        "proposed_deb_sha256": digest(deb),
    }


def reseal(src: dict) -> None:
    src["proposed_release_sha256"] = digest(src["release_body"])
    src["proposed_signature_sha256"] = digest(src["release_signature"])
    src["proposed_packages_sha256"] = digest(src["packages_index_archive"])
    src["proposed_deb_sha256"] = digest(src["deb_archive"])


def with_stanza_change(src: dict, before: bytes, after: bytes) -> None:
    data = lzma.decompress(src["packages_index_archive"])
    assert before in data
    src["packages_index_archive"] = lzma.compress(
        data.replace(before, after), format=lzma.FORMAT_XZ)
    # Update *all* caller-proposed digests and Release table deliberately,
    # so negative tests hit the internal package contract instead of a stale pin.
    old = src["release_body"].split(b"SHA256:\n", 1)[1].split(b"\n", 1)[0]
    new_index = src["packages_index_archive"]
    replacement = (
        b" " + digest(new_index).encode("ascii") + b" "
        + str(len(new_index)).encode("ascii") + b" "
        + INDEX_PATH.encode("ascii")
    )
    src["release_body"] = src["release_body"].replace(old, replacement)
    reseal(src)


class UbuntuByteChainTests(unittest.TestCase):
    def setUp(self):
        self.src = candidate()

    def review(self):
        return review_ubuntu_source_byte_chain(**self.src)

    def test_synthetic_chain_consistent_but_never_authorized(self):
        result = self.review()
        self.assertEqual(result["decision"], "BLOCKED")
        self.assertTrue(result["releaseIndexByteClaimMatches"])
        self.assertTrue(result["packageArchiveByteClaimMatches"])
        for key in ("releaseGpgSignatureVerified",
                    "trustedUbuntuKeyAndRepositoryAuthenticated",
                    "ubuntuReleaseValidityIndependentlyEstablished",
                    "packageMemberBytesAndSymlinksExtracted",
                    "guestFdToPackagePathAuthenticated",
                    "pythonElfDlopenClosureVerified",
                    "authorizedToMutateProduction"):
            self.assertIs(result[key], False)

    def test_original_release_bytes_digest_mismatch(self):
        self.src["release_body"] += b"# mutated\n"
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_signature_bytes_digest_mismatch(self):
        self.src["release_signature"] += b"tampered"
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_empty_signature_even_with_resealed_caller(self):
        self.src["release_signature"] = b""
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_packages_bytes_digest_mismatch(self):
        self.src["packages_index_archive"] += b"stale"
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_release_table_pin_mismatch_even_after_caller_reseals(self):
        self.src["packages_index_archive"] = lzma.compress(b"wrong\n")
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_deb_hash_mismatch_with_packages_index(self):
        self.src["deb_archive"] += b"evil"
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_wrong_package_arch_even_when_all_hashes_consistent(self):
        with_stanza_change(self.src, b"Architecture: amd64",
                           b"Architecture: arm64")
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_wrong_package_filename_even_when_all_hashes_consistent(self):
        with_stanza_change(self.src, DEB_PATH.encode("ascii"),
                           b"pool/main/p/fake/not-the-selected.deb")
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_duplicate_package_version_even_with_consistent_index_hash(self):
        data = lzma.decompress(self.src["packages_index_archive"])
        self.src["packages_index_archive"] = lzma.compress(data + b"\n" + data)
        old_line = self.src["release_body"].split(b"SHA256:\n", 1)[1].split(b"\n", 1)[0]
        new_blob = self.src["packages_index_archive"]
        new_line = (b" " + digest(new_blob).encode() + b" "
                    + str(len(new_blob)).encode() + b" "
                    + INDEX_PATH.encode())
        self.src["release_body"] = self.src["release_body"].replace(old_line, new_line)
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_unsupported_ubuntu_suite_cannot_be_autoswitched(self):
        self.src["release_body"] = self.src["release_body"].replace(
            b"Suite: noble-updates", b"Suite: noble-proposed")
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_no_weak_md5_fallback_for_missing_sha256(self):
        self.src["release_body"] = self.src["release_body"].replace(
            b"SHA256:", b"SHAXXX:")
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_duplicate_release_digest_table_is_blocked(self):
        self.src["release_body"] += (b"SHA256:\n"
                                     + b"0" * 64 + b" 1 "
                                     + INDEX_PATH.encode() + b"\n")
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_index_path_traversal_blocked(self):
        self.src["packages_index_path"] = "../private/Packages.xz"
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_deb_filename_path_traversal_blocked(self):
        self.src["deb_filename"] = "pool/main/p/../../private.deb"
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_truncated_xz_even_if_release_digest_rebuilt(self):
        self.src["packages_index_archive"] = self.src["packages_index_archive"][:-2]
        old_line = self.src["release_body"].split(b"SHA256:\n", 1)[1].split(b"\n", 1)[0]
        blob = self.src["packages_index_archive"]
        new_line = (b" " + digest(blob).encode() + b" "
                    + str(len(blob)).encode() + b" "
                    + INDEX_PATH.encode())
        self.src["release_body"] = self.src["release_body"].replace(old_line, new_line)
        reseal(self.src)
        with self.assertRaises(UbuntuSourceChainBlocked):
            self.review()

    def test_uncompressed_package_index_also_supported(self):
        raw_index = lzma.decompress(self.src["packages_index_archive"])
        self.src["packages_index_path"] = "main/binary-amd64/Packages"
        self.src["packages_index_archive"] = raw_index
        old_line = self.src["release_body"].split(b"SHA256:\n", 1)[1].split(b"\n", 1)[0]
        new_line = (b" " + digest(raw_index).encode() + b" "
                    + str(len(raw_index)).encode() + b" "
                    + b"main/binary-amd64/Packages")
        self.src["release_body"] = self.src["release_body"].replace(old_line, new_line)
        reseal(self.src)
        self.assertIs(self.review()["releaseGpgSignatureVerified"], False)


if __name__ == "__main__":
    unittest.main()
