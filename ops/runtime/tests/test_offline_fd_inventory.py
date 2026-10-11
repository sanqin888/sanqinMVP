"""C5-U2D-2B2-A: descriptor-anchored inventory boundary tests."""
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from offline_fd_inventory import InventoryBlocked, inspect_lab_inventory  # noqa: E402
from test_offline_root_private_installer import fixture  # noqa: E402


class DescriptorInventoryTests(unittest.TestCase):
    def test_clean_inventory_and_never_authority(self):
        with fixture() as folder:
            root = Path(folder)
            result = inspect_lab_inventory(root)
            self.assertEqual(result["status"], "offline-fd-inventory-only")
            self.assertEqual(result["slot"], "live/runtime")
            self.assertEqual(len(result["members"]), 21)
            self.assertFalse(result["quiescenceVerified"])
            self.assertFalse(result["productionActivationAuthorized"])
            self.assertFalse(result["readyToInstall"])
            self.assertEqual(result["treeInode"], (root / "live/runtime").stat().st_ino)

    def test_refuse_prod_root_or_non_fixture_path(self):
        with fixture() as folder:
            for invalid in (Path("/opt/sanq/runtime"), Path("/tmp"), Path(folder) / "live"):
                with self.subTest(invalid=str(invalid)), self.assertRaises(InventoryBlocked):
                    inspect_lab_inventory(invalid)

    def test_intermediate_symlink_and_unknown_extra_entry(self):
        with fixture() as folder:
            tree = Path(folder) / "live/runtime"
            (tree / "ops").rename(tree / "ops-original")
            (tree / "ops").symlink_to(tree / "ops-original", target_is_directory=True)
            with self.assertRaises((OSError, InventoryBlocked)):
                inspect_lab_inventory(Path(folder))
        with fixture() as folder:
            (Path(folder) / "live/runtime/extra").write_text("extra")
            with self.assertRaisesRegex(InventoryBlocked, "unexpected"):
                inspect_lab_inventory(Path(folder))

    def test_hardlink_and_untrusted_mode(self):
        with fixture() as folder:
            root = Path(folder)
            os.link(root / "live/runtime/docker-compose.yml", root / "proof/alias")
            with self.assertRaisesRegex(InventoryBlocked, "file identity"):
                inspect_lab_inventory(root)
        with fixture() as folder:
            root = Path(folder)
            (root / "live/runtime/.env").chmod(0o666)
            with self.assertRaisesRegex(InventoryBlocked, "permissions"):
                inspect_lab_inventory(root)

    def test_leaf_exchange_between_open_and_read_fails_closed(self):
        with fixture() as folder:
            root = Path(folder)
            tree = root / "live/runtime"
            original = tree / "docker-compose.yml"
            replacement = root / "proof/alternate"
            replacement.write_bytes(original.read_bytes())
            replacement.chmod(0o644)
            invoked = False

            def attack():
                nonlocal invoked
                if not invoked:
                    invoked = True
                    original.rename(root / "proof/held-original")
                    replacement.rename(original)

            with self.assertRaisesRegex(InventoryBlocked, "entry changed|file changed while reading"):
                inspect_lab_inventory(root, before_read=attack)
            self.assertTrue(invoked)

    def test_live_slot_swap_during_scan_fails_closed(self):
        with fixture() as folder:
            root = Path(folder)
            invoked = False

            def attack():
                nonlocal invoked
                if not invoked:
                    invoked = True
                    os.rename(root / "live/runtime", root / "live/old-pinned")
                    # Existing tree FD remains on the old tree, but the public
                    # Runtime path is no longer that same directory.

            with self.assertRaises((OSError, InventoryBlocked)):
                inspect_lab_inventory(root, before_read=attack)
            self.assertTrue(invoked)

    def test_modified_open_file_is_rejected(self):
        with fixture() as folder:
            root = Path(folder)
            item = root / "live/runtime/docker-compose.yml"
            def modify_opened_file():
                with item.open("ab") as stream:
                    stream.write(b"unexpected")
            with self.assertRaisesRegex(InventoryBlocked, "file changed"):
                inspect_lab_inventory(root, before_read=modify_opened_file)

    def test_intermediate_folder_rename_during_read_rejected(self):
        with fixture() as folder:
            root = Path(folder)
            ops = root / "live/runtime/ops"
            def rename_parent():
                ops.rename(root / "live/runtime/ops-renamed")
            with self.assertRaises((OSError, InventoryBlocked)):
                inspect_lab_inventory(root, before_read=rename_parent)

    def test_no_write_or_execute_entrypoint(self):
        import offline_fd_inventory as checker
        for forbidden in ("execute", "install", "rollback", "deploy", "rename_exchange"):
            self.assertFalse(hasattr(checker, forbidden))


if __name__ == "__main__":
    unittest.main()
