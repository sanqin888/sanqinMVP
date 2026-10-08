"""Offline C5-B3B2D isolated directory verification tests; never production."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from isolated_host_fixture import HostFixtureBlocked, IsolatedHostFixture


def populate(fixture):
    for name in fixture.NAMES:
        fixture.make_directory(name)


class IsolatedHostInspectionTests(unittest.TestCase):
    def test_private_fixture_directory_identity_and_non_authority(self):
        with IsolatedHostFixture() as f:
            populate(f)
            outcome = f.inspect()
            self.assertTrue(outcome["filesystemLayoutExamined"])
            self.assertFalse(outcome["productionHostExamined"])
            self.assertFalse(outcome["authorizedToMutateProduction"])
            self.assertFalse(outcome["readyToInstall"])
            self.assertNotEqual(str(f.root), "/opt/sanq/runtime")

    def test_missing_unknown_and_bad_permissions_are_blocked(self):
        with IsolatedHostFixture() as f:
            with self.assertRaises(HostFixtureBlocked):
                f.inspect()
            populate(f)
            os.chmod(f.root / "active", 0o777)
            with self.assertRaises(HostFixtureBlocked):
                f.inspect()
            os.chmod(f.root / "active", 0o700)
            (f.root / "unexpected").mkdir()
            with self.assertRaises(HostFixtureBlocked):
                f.inspect()

    def test_symlink_replacement_is_blocked(self):
        with IsolatedHostFixture() as f:
            populate(f)
            (f.root / "active").rmdir()
            (f.root / "active").symlink_to(f.root / "releases", target_is_directory=True)
            with self.assertRaises(HostFixtureBlocked):
                f.inspect()

    def test_cannot_supply_outside_paths(self):
        with IsolatedHostFixture() as f:
            with self.assertRaises(HostFixtureBlocked):
                f.make_directory("../somewhere")
            with self.assertRaises(HostFixtureBlocked):
                f.make_directory("/opt/sanq/runtime")
            populate(f)
            self.assertEqual(f.inspect()["kind"], "isolated-host-inspection-v1")


if __name__ == "__main__":
    unittest.main()
