from pathlib import Path
import subprocess
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKUP_SCRIPT = REPO_ROOT / "ops/backup/backup-db.sh"
PROTECTED_HELPER = REPO_ROOT / "ops/backup/sanq-backup-protected-nginx"
SERVICE_UNIT = REPO_ROOT / "ops/backup/sanq-backup.service"
SUDOERS = REPO_ROOT / "ops/backup/sanq-backup.sudoers"


class BackupSafetyContractTest(unittest.TestCase):
    def test_shell_scripts_parse(self) -> None:
        for path in (BACKUP_SCRIPT, PROTECTED_HELPER):
            result = subprocess.run(
                ["bash", "-n", str(path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_main_job_propagates_failures_and_does_not_ignore_tar_reads(self) -> None:
        source = BACKUP_SCRIPT.read_text()
        self.assertIn("BACKUP_FAILED=0", source)
        self.assertIn('sudo -n "$PROTECTED_NGINX_HELPER" "$NGINX_FILENAME"', source)
        self.assertNotIn("--ignore-failed-read", source)
        self.assertIn("SanQ backup completed WITH FAILURES", source)
        self.assertIn("exit 1", source)

    def test_privileged_helper_is_narrow_and_fail_closed(self) -> None:
        source = PROTECTED_HELPER.read_text()
        self.assertIn('if [ "$EUID" -ne 0 ]', source)
        self.assertIn(
            r"^sanqin_nginx_[0-9]{8}_[0-9]{6}\.tar\.gz$",
            source,
        )
        self.assertIn(
            'RCLONE_CONFIG="/home/ubuntu/.config/rclone/rclone.conf"',
            source,
        )
        self.assertIn('tmp_rclone_config="$(mktemp /tmp/sanq-rclone.', source)
        self.assertIn('cp -- "$RCLONE_CONFIG" "$tmp_rclone_config"', source)
        self.assertIn('--config "$tmp_rclone_config"', source)
        self.assertIn('REMOTE_DIR="gdrive_secure:nginx"', source)
        self.assertIn("copyto", source)
        self.assertNotIn("--ignore-failed-read", source)

        for member in (
            "nginx/nginx.conf",
            "nginx/sites-available/sanq-api.conf",
            "nginx/sites-available/sanq-web.conf",
            "nginx/certs/cf-origin.pem",
            "nginx/certs/cf-origin.key",
        ):
            self.assertIn(member, source)

    def test_service_remains_unprivileged(self) -> None:
        source = SERVICE_UNIT.read_text()
        self.assertIn("User=ubuntu", source)
        self.assertNotIn("User=root", source)
        self.assertIn("UMask=0077", source)
        self.assertIn("ExecStart=/home/ubuntu/backup-db.sh", source)

    def test_sudoers_grants_only_the_fixed_helper(self) -> None:
        source = SUDOERS.read_text()
        self.assertIn(
            "ubuntu ALL=(root) NOPASSWD: "
            "/usr/local/sbin/sanq-backup-protected-nginx "
            "sanqin_nginx_*.tar.gz",
            source,
        )
        self.assertNotIn("/bin/tar", source)
        self.assertNotIn("ALL=(ALL) NOPASSWD: ALL", source)


if __name__ == "__main__":
    unittest.main()
