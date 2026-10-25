from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import c1_python_build_materials as build


class BuilderPreflightTests(unittest.TestCase):
    def checked_builder(self, *, version="22.04", machine="x86_64", uid=1001, env=None):
        environment = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                       "GITHUB_REPOSITORY": "sanqin888/sanqinMVP", "GITHUB_REF": "refs/heads/dev",
                       "GITHUB_SHA": "a" * 40} if env is None else env
        with patch.object(build.platform, "freedesktop_os_release",
                          return_value={"ID": "ubuntu", "VERSION_ID": version}), \
             patch.object(build.platform, "system", return_value="Linux"), \
             patch.object(build.platform, "machine", return_value=machine), \
             patch.object(build.os, "getuid", return_value=uid), \
             patch.object(build.os, "geteuid", return_value=uid), \
             patch.dict(build.os.environ, environment, clear=True):
            return build.require_builder()

    def test_nonroot_hosted_jammy_is_identified_without_installation_authority(self):
        result = self.checked_builder()
        self.assertEqual(result["sourceCommit"], "a" * 40)
        self.assertNotIn("readyToInstall", result)

    def test_wrong_platform_and_root_are_rejected(self):
        for values in ({"version": "24.04"}, {"machine": "aarch64"}, {"uid": 0}):
            with self.subTest(values=values), self.assertRaises(build.BuildMaterialsBlocked):
                self.checked_builder(**values)

    def test_missing_hosted_environment_or_exact_commit_is_rejected(self):
        common = {"GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
                  "GITHUB_REPOSITORY": "sanqin888/sanqinMVP", "GITHUB_REF": "refs/heads/dev",
                  "GITHUB_SHA": "a" * 40}
        for environment in ({}, {**common, "RUNNER_ENVIRONMENT": "self-hosted"},
                {**common, "GITHUB_SHA": "dev"}, {**common, "GITHUB_REPOSITORY": "other/repo"},
                {**common, "GITHUB_REF": "refs/heads/main"}):
            with self.subTest(env=environment), self.assertRaises(build.BuildMaterialsBlocked):
                self.checked_builder(env=environment)


class SourceTrustTests(unittest.TestCase):
    def valid_status(self, primary=None, signing=None, algorithm="10"):
        return ("[GNUPG:] GOODSIG arbitrary This text is not identity proof\n"
                "[GNUPG:] VALIDSIG " + (signing or build.SIGNER)
                + " 2026-09-30 1790726400 0 4 0 1 " + algorithm + " 00 "
                + (primary or build.SIGNER) + "\n")

    def test_primary_and_subkey_signatures_bind_to_fixed_primary(self):
        build.require_signature_status(self.valid_status())
        build.require_signature_status(self.valid_status(signing="A" * 40))

    def test_validsig_from_another_primary_or_weak_digest_is_rejected(self):
        for text in (self.valid_status(primary="B" * 40),
                     self.valid_status(algorithm="2"),
                     "[GNUPG:] GOODSIG A821E680E5FA6305 Thomas Wouters\n",
                     self.valid_status() + self.valid_status(),
                     "untrusted output mentioning VALIDSIG " + build.SIGNER):
            with self.subTest(text=text), self.assertRaises(build.BuildMaterialsBlocked):
                build.require_signature_status(text)

    def test_expired_revoked_and_error_status_cannot_be_hidden_by_validsig(self):
        for status in ("BADSIG", "ERRSIG", "EXPSIG", "EXPKEYSIG", "REVKEYSIG",
                       "KEYEXPIRED", "SIGEXPIRED", "NO_PUBKEY", "FAILURE"):
            with self.subTest(status=status), self.assertRaises(build.BuildMaterialsBlocked):
                build.require_signature_status(self.valid_status()
                                               + "[GNUPG:] " + status + " rejected\n")

    def test_publisher_file_cannot_add_another_trusted_primary(self):
        pub = "pub:-:4096:1:A821E680E5FA6305:0:0::::::\n"
        fingerprint = "fpr:::::::::" + build.SIGNER + ":\n"
        build.require_key_listing(pub + fingerprint)
        for text in (pub + fingerprint.replace(build.SIGNER, "F" * 40),
                     pub + fingerprint + pub + fingerprint, fingerprint, pub):
            with self.subTest(text=text), self.assertRaises(build.BuildMaterialsBlocked):
                build.require_key_listing(text)

    def test_bad_source_digest_stops_before_gpg_or_extraction(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "inputs").mkdir()
            (root / "inputs" / build.SOURCE_NAME).write_bytes(b"wrong source")
            with patch.object(build.subprocess, "run") as command:
                with self.assertRaisesRegex(build.BuildMaterialsBlocked, "digest"):
                    build.verify_extract(root)
                command.assert_not_called()
            self.assertFalse((root / "source").exists())
            self.assertFalse((root / "source-receipt.json").exists())

    def archive(self, members):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w:xz") as archive:
            for name, kind in members:
                entry = tarfile.TarInfo(name)
                entry.type = kind
                if kind == tarfile.REGTYPE:
                    entry.size = 2
                    archive.addfile(entry, io.BytesIO(b"ok"))
                else:
                    entry.linkname = "/tmp/escape"
                    archive.addfile(entry)
        return output.getvalue()

    def test_archive_rejects_traversal_links_duplicates_and_wrong_root_before_writes(self):
        good = ("Python-3.12.15/README", tarfile.REGTYPE)
        cases = [([good, ("Python-3.12.15/../../escape", tarfile.REGTYPE)]),
                 ([good, ("/tmp/escape", tarfile.REGTYPE)]),
                 ([good, ("Python-3.12.15/link", tarfile.SYMTYPE)]),
                 ([good, ("Python-3.12.15/link", tarfile.LNKTYPE)]),
                 ([good, good]), ([("Python-3.12.3/README", tarfile.REGTYPE)]),
                 ([good, ("Python-3.12.15/README/child", tarfile.REGTYPE)])]
        for members in cases:
            raw = self.archive(members)
            with tempfile.TemporaryDirectory() as directory:
                destination = Path(directory) / "source"
                with patch.object(build, "SOURCE_SHA256", hashlib.sha256(raw).hexdigest()):
                    with self.assertRaises(build.BuildMaterialsBlocked):
                        build.extract_source(raw, destination)
                self.assertFalse(destination.exists())

    def test_verified_archive_is_consumed_as_fixed_bytes(self):
        raw = self.archive([("Python-3.12.15/README", tarfile.REGTYPE)])
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "source"
            with patch.object(build, "SOURCE_SHA256", hashlib.sha256(raw).hexdigest()):
                build.extract_source(raw, destination)
            self.assertEqual((destination / "Python-3.12.15/README").read_bytes(), b"ok")

    def test_gpg_failure_never_extracts_source_or_creates_success_receipt(self):
        raw = self.archive([("Python-3.12.15/README", tarfile.REGTYPE)])
        for failed in (True, False):
            with self.subTest(nonzero=failed), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "inputs").mkdir()
                (root / "logs").mkdir()
                (root / "inputs" / build.SOURCE_NAME).write_bytes(raw)
                (root / "inputs" / (build.SOURCE_NAME + ".asc")).write_bytes(b"test signature")
                (root / "inputs/publisher.gpg").write_bytes(b"test public key")
                listing = "pub:-:4096:1:key:0:0::::::\nfpr:::::::::" + build.SIGNER + ":\n"
                replies = [SimpleNamespace(returncode=0, stdout=listing, stderr=""),
                           SimpleNamespace(returncode=0, stdout="", stderr=""),
                           SimpleNamespace(returncode=1 if failed else 0,
                               stdout=self.valid_status(primary="F" * 40), stderr="test failure")]
                with patch.object(build, "SOURCE_SHA256", hashlib.sha256(raw).hexdigest()), \
                     patch.object(build.subprocess, "run", side_effect=replies):
                    with self.assertRaises(build.BuildMaterialsBlocked):
                        build.verify_extract(root)
                self.assertFalse((root / "source").exists())
                self.assertFalse((root / "source-receipt.json").exists())
                self.assertTrue((root / "logs/gpg-verify.stderr").exists())


class StagedMaterialsTests(unittest.TestCase):
    def prepare(self, root):
        (root / "bin").mkdir(mode=0o755)
        binary = root / "bin/python3.12"
        binary.write_bytes(b"synthetic test bytes, never executed")
        binary.chmod(0o755)
        return binary

    def test_inventory_hashes_bytes_and_preserves_safe_internal_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = self.prepare(root)
            (root / "bin/alias").symlink_to("python3.12")
            rows = {row["name"]: row for row in build.staged_inventory(root)}
            self.assertEqual(rows["bin/python3.12"]["sha256"],
                             hashlib.sha256(binary.read_bytes()).hexdigest())
            self.assertEqual(rows["bin/alias"]["target"], "python3.12")

    def test_escaping_symlinks_hardlinks_and_writable_files_are_rejected(self):
        for kind in ("absolute", "parent", "hardlink", "writable", "fifo"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                binary = self.prepare(root)
                if kind == "absolute":
                    (root / "bin/bad").symlink_to("/etc/passwd")
                elif kind == "parent":
                    (root / "bin/bad").symlink_to("../../../escape")
                elif kind == "hardlink":
                    os.link(binary, root / "bin/bad")
                elif kind == "writable":
                    binary.chmod(0o777)
                else:
                    os.mkfifo(root / "bin/bad")
                with self.assertRaises((build.BuildMaterialsBlocked, OSError)):
                    build.staged_inventory(root)

    def test_installer_and_source_aliases_are_not_accepted_as_interpreter(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = self.prepare(root)
            binary.rename(root / "bin/actual")
            binary.symlink_to("actual")
            with self.assertRaisesRegex(build.BuildMaterialsBlocked, "interpreter"):
                build.staged_inventory(root)


class NativeDependencyTests(unittest.TestCase):
    def test_native_bytes_are_bound_to_exact_package_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "logs").mkdir()
            prefix = root / "stage"
            prefix.mkdir()
            library = root / "libexample.so"
            library.write_bytes(b"synthetic library bytes, not executed")
            (root / "logs/interpreter-ldd.txt").write_text("example => " + str(library) + " (0x1)\n")
            (root / "logs/extensions-ldd.txt").write_text("linux-vdso.so.1 (0x2)\n")
            replies = [SimpleNamespace(returncode=0, stdout="libexample:amd64: " + str(library)),
                       SimpleNamespace(stdout="1.2-ubuntu1\tamd64\tinstall ok installed\n")]
            with patch.object(build.subprocess, "run", side_effect=replies):
                rows = build.native_dependencies(root, prefix)
            self.assertEqual(rows[0]["packageVersion"], "1.2-ubuntu1")
            self.assertEqual(rows[0]["sha256"], hashlib.sha256(library.read_bytes()).hexdigest())

    def test_missing_library_or_unowned_native_object_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "logs").mkdir()
            prefix = root / "stage"
            prefix.mkdir()
            (root / "logs/interpreter-ldd.txt").write_text("libssl.so => not found\n")
            (root / "logs/extensions-ldd.txt").write_text("")
            with self.assertRaisesRegex(build.BuildMaterialsBlocked, "missing"):
                build.native_dependencies(root, prefix)
            library = root / "unowned.so"
            library.write_bytes(b"unowned")
            (root / "logs/interpreter-ldd.txt").write_text(str(library) + " (0x1)\n")
            with patch.object(build.subprocess, "run", return_value=SimpleNamespace(returncode=1)):
                with self.assertRaisesRegex(build.BuildMaterialsBlocked, "owner"):
                    build.native_dependencies(root, prefix)


class ReviewPackageTests(unittest.TestCase):
    def prepare(self, root):
        prefix = root / "stage" / Path(str(build.PREFIX))
        (prefix / "bin").mkdir(parents=True, mode=0o755)
        (prefix / "bin/python3.12").write_bytes(b"synthetic interpreter; never executed")
        (prefix / "bin/python3.12").chmod(0o755)
        build.write_json(root / "source-receipt.json", {
            "version": build.VERSION, "sourceSha256": build.SOURCE_SHA256,
            "publisherPrimaryFingerprint": build.SIGNER, "signatureVerified": True,
            "launchAuthorized": False, "readyToInstall": False})
        build.write_json(root / "builder.json", {"sourceCommit": "a" * 40})
        (root / "inputs").mkdir()
        (root / "inputs" / build.SOURCE_NAME).write_bytes(b"synthetic source")
        (root / "inputs" / (build.SOURCE_NAME + ".asc")).write_bytes(b"synthetic signature")
        (root / "inputs/publisher.gpg").write_bytes(b"synthetic public key")
        (root / "logs").mkdir()
        for name in ("interpreter-smoke.json", "c1-regression.log", "configure.log",
                     "config.log", "make.log", "altinstall.log", "build-packages.tsv"):
            (root / "logs" / name).write_bytes(b"synthetic unit-test log")
        return prefix

    def test_archive_preserves_bytes_but_cannot_grant_install_or_launch_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prefix = self.prepare(root)
            with patch.object(build, "require_builder", return_value={"sourceCommit": "a" * 40}), \
                 patch.object(build, "native_dependencies", return_value=[{"package": "test"}]), \
                 patch.object(build, "SOURCE_SHA256", hashlib.sha256(b"synthetic source").hexdigest()):
                # Match the source fixture before issuing the synthetic receipt.
                receipt = json.loads((root / "source-receipt.json").read_text())
                receipt["sourceSha256"] = build.SOURCE_SHA256
                (root / "source-receipt.json").write_text(json.dumps(receipt))
                build.package(root)
            review = json.loads((root / "output/build-review.json").read_text())
            for field in ("installationVerified", "launchAuthorized", "readyToInstall"):
                self.assertIs(review[field], False)
            archive = root / "output/sanq-cpython-3.12.15-jammy-x86_64.tar.gz"
            self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), review["archiveSha256"])
            with tarfile.open(archive) as stream:
                item = stream.getmember(str(build.PREFIX / "bin/python3.12"))
                self.assertEqual((item.uid, item.gid), (0, 0))
                self.assertEqual(stream.extractfile(item).read(), (prefix / "bin/python3.12").read_bytes())

    def test_missing_source_receipt_cannot_emit_a_build_review(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(build, "require_builder", return_value={"sourceCommit": "a" * 40}):
                with self.assertRaises(OSError):
                    build.package(root)
            self.assertFalse((root / "output").exists())


if __name__ == "__main__":
    unittest.main()
