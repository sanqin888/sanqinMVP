"""C5-A offline source-checkout retirement audit regression coverage."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "audit_source_retirement.py"
SPEC = importlib.util.spec_from_file_location("sanq_c5_retirement", SOURCE)
assert SPEC is not None and SPEC.loader is not None
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)


def fixture(root: Path) -> None:
    for path, required in audit.REQUIREMENTS.items():
        file = root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("\n".join(required) + "\n", encoding="utf-8")


class CheckoutRetirementAuditTests(unittest.TestCase):
    def test_complete_source_inventory_never_authorizes_checkout_delete(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            report = audit.audit(root)
            self.assertEqual(
                set(report["checkoutDependencies"]), set(audit.DEPENDS_ON_CHECKOUT)
            )
            self.assertEqual(
                set(report["checkoutDependencies"].values()), {"present"}
            )
            self.assertFalse(report["readyToDeleteProductionSourceCheckout"])
            self.assertFalse(report["authorizedToChangeMcpProductionBoundary"])
            self.assertFalse(report["authorizedToDeleteProductionFiles"])

    def test_retargeting_prod_mcp_without_review_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            server = root / "ops/sanq-mcp/server.py"
            server.write_text("source suddenly elsewhere")
            report = audit.audit(root)
            self.assertEqual(
                report["checkoutDependencies"]["ops/sanq-mcp/server.py"],
                "unknown-needs-review",
            )
            self.assertFalse(report["readyToDeleteProductionSourceCheckout"])

    def test_missing_checkout_validation_marks_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            file = root / "ops/release/deploy_release.py"
            file.unlink()
            report = audit.audit(root)
            self.assertEqual(
                report["sourceContracts"]["ops/release/deploy_release.py"]["status"],
                "blocked",
            )

    def test_symlinks_are_not_followed_or_secret_text_exposed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture(root)
            path = root / "ops/sanq-mcp/server.py"
            path.unlink()
            secret = root / "secret.txt"
            secret.write_text("TEST_SECRET_VALUE_SHOULD_NOT_APPEAR")
            path.symlink_to(secret)
            report = audit.audit(root)
            self.assertEqual(report["sourceContracts"]["ops/sanq-mcp/server.py"]["status"], "blocked")
            self.assertNotIn("TEST_SECRET_VALUE", json.dumps(report))

    def test_source_scope_does_not_list_any_sensitive_runtime_paths(self):
        for path in audit.REQUIREMENTS:
            self.assertNotIn(".env", path)
            self.assertNotIn("uploads", path)
            self.assertNotIn("backups", path)
            self.assertNotIn(".git", Path(path).parts)


if __name__ == "__main__":
    unittest.main()
