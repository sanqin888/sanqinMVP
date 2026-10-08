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
        self.assertIn('tmp_root="$(mktemp -d /tmp/sanq-nginx.', source)
        self.assertIn('tmp_rclone_config="$tmp_root/rclone.conf"', source)
        self.assertIn('tmp_archive="$tmp_root/archive.tar.gz"', source)
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
        self.assertIn("StandardOutput=journal", source)
        self.assertIn("StandardError=journal", source)
        self.assertNotIn("StandardOutput=append:", source)

    def test_c3b_target_paths_and_fail_closed_preflight(self) -> None:
        source = BACKUP_SCRIPT.read_text()
        for contract in (
            'PROJECT_ROOT="/opt/sanq/runtime"',
            'BACKUP_DIR="/srv/sanq/backups"',
            'UPLOADS_DIR="/srv/sanq/uploads"',
            'ENV_FILE="$PROJECT_ROOT/.env"',
            'verify_trusted_parent /opt/sanq',
            'verify_trusted_parent /srv/sanq',
            'verify_trusted_parent "$PROJECT_ROOT"',
            'verify_data_dir "$BACKUP_DIR" "$(id -u)"',
            'grep -Fxq \'BACKUP_DIR="/srv/sanq/backups"\'',
            'LAYOUT_ACTIVATION_MARKER="/opt/sanq/runtime/.sanq-backup-layout-activated"',
            '"SANQ_BACKUP_LAYOUT_C4_V1"',
            'helper_uid="$(stat -c',
        ):
            self.assertIn(contract, source)
        self.assertNotIn('mkdir -p "$BACKUP_DIR"', source)
        self.assertNotIn('PROJECT_ROOT="/home/ubuntu/sanq-app"', source)
        self.assertLess(source.index('verify_data_dir "$BACKUP_DIR"'), source.index('rclone sync'))

    def test_protected_backup_uses_root_private_upload_and_safe_rename(self) -> None:
        source = PROTECTED_HELPER.read_text()
        for contract in (
            'BACKUP_DIR="/srv/sanq/backups"',
            "for trusted in /srv /srv/sanq",
            'LAYOUT_ACTIVATION_MARKER="/opt/sanq/runtime/.sanq-backup-layout-activated"',
            '"SANQ_BACKUP_LAYOUT_C4_V1"',
            'ubuntu_uid="$(id -u ubuntu)"',
            'tmp_root="$(mktemp -d /tmp/sanq-nginx.',
            'tmp_archive="$tmp_root/archive.tar.gz"',
            'copyto \\',
            '"$tmp_archive" \\',
            'mv -T -- "$tmp_archive" "$archive_path"',
            'chmod 600 "$tmp_archive"',
            'if [ "$upload_failed" -ne 0 ]; then',
        ):
            self.assertIn(contract, source)
        self.assertLess(source.index('copyto \\'), source.index('mv -T --'))
        self.assertNotIn('copyto \\\n    "$archive_path"', source)
        self.assertNotIn('rm -f -- "$archive_path"', source)

    def test_retention_and_offsite_destinations_unchanged(self) -> None:
        script = BACKUP_SCRIPT.read_text()
        helper = PROTECTED_HELPER.read_text()
        self.assertIn('REMOTE_DB_DAILY="$REMOTE_ROOT/database-daily"', script)
        self.assertIn('REMOTE_DB_MONTHLY="$REMOTE_ROOT/database-monthly"', script)
        self.assertIn('REMOTE_UPLOADS_CURRENT="$REMOTE_ROOT/uploads-current"', script)
        self.assertIn('REMOTE_UPLOADS_HISTORY="$REMOTE_ROOT/uploads-history"', script)
        self.assertIn('REMOTE_DIR="gdrive_secure:nginx"', helper)
        self.assertIn('REMOTE_ARCHIVE_FOLDER="sanqin-archives/messaging"', script)
        self.assertIn('--min-age 30d', script)
        self.assertIn('--min-age 7y', script)
        self.assertIn('--backup-dir', script)

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
