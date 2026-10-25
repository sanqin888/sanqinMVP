"""Offline checks for lab input pins and fail-closed evidence validation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

PATH = Path(__file__).resolve().parents[1] / 'c1_jammy_negative_lab.py'
SPEC = importlib.util.spec_from_file_location('c1_negative_lab_test', PATH)
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class LabBoundaries(unittest.TestCase):
    def test_independent_production_input_pins_bind_fixture(self):
        fixture = json.loads((PATH.parent / 'fixtures/c1_assembly_inputs.json').read_bytes())
        for name, expected in lab.PINS.items():
            self.assertEqual(lab.sha(lab.canonical(fixture[name])), expected)

    def test_report_cannot_grant_production_or_flow_authority(self):
        with self.assertRaises(ValueError):
            lab.report_ok(b'{"authorizedToMutateProduction":true}', b'launch', b'request')

    def test_report_cannot_hide_incomplete_identity(self):
        with self.assertRaises(ValueError):
            lab.report_ok(b'{"status":"CANDIDATE_ASSEMBLED"}', b'launch', b'request')

    def test_input_reader_rejects_symlink_and_hardlink(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'raw'
            path.write_bytes(b'bytes')
            alias = Path(directory) / 'alias'
            alias.symlink_to(path)
            with self.assertRaises(OSError):
                lab.regular(alias, 10)
            alias.unlink()
            alias.hardlink_to(path)
            with self.assertRaises(ValueError):
                lab.regular(path, 10)

    def test_input_reader_rejects_oversize(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'raw'
            path.write_bytes(b'too large')
            with self.assertRaises(ValueError):
                lab.regular(path, 2)


if __name__ == '__main__':
    unittest.main()
