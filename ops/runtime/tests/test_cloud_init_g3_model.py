"""G3 offline characterization of documented cloud-init 25.2 / Lightsail append behavior.

Models only. NOT the Ubuntu-installed cloud-init package, sshd, sudo, an
installer, a production checker, or a replacement for AWS dynamic validation.
"""

from __future__ import annotations

import unittest


TEST_USER = "ubuntu"
PASSWORD_RULE = TEST_USER + " ALL=(ALL:ALL) ALL"
CANONICAL_CLOUD_INIT_BLOCK = f"\n# User rules for {TEST_USER}\n{PASSWORD_RULE}\n"
CA_DIRECTIVE = "TrustedUserCAKeys /etc/ssh/lightsail_instance_ca.pub"


def cloud_init_25_2_write_sudo_rules_model(existing: str | None) -> str:
    """Model Distro.write_sudo_rules' whole-block containment/append decision.

    The actual cloud-init header generation, file permissions, locking and
    datasource/user selection are intentionally outside this pure text model.
    """
    if existing is None:
        return "# generated sudoers fixture\n" + CANONICAL_CLOUD_INIT_BLOCK
    if CANONICAL_CLOUD_INIT_BLOCK in existing:
        return existing
    return existing + CANONICAL_CLOUD_INIT_BLOCK


def lightsail_user_data_append_model(existing: str) -> str:
    """Model the observed 16-line user-data's unconditional >> CA directive."""
    return existing + "\n" + CA_DIRECTIVE + "\n"


def password_policy_review(sudoers: str) -> bool:
    """Narrow fixture gate: one effective ubuntu PASSWD rule, no broad bypass.

    This cannot replace sudo -l, visudo -c or checking every sudoers source.
    """
    non_comment = [
        line.strip() for line in sudoers.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    return non_comment.count(PASSWORD_RULE) == 1 and not any(
        "NOPASSWD" in line for line in non_comment
    )


def ca_directive_review(sshd_config: str) -> bool:
    """Narrow fixture gate: all explicit CA directives must match expected."""
    lines = [
        line.strip() for line in sshd_config.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
        and line.strip().split(maxsplit=1)[0].lower() == "trustedusercakeys"
    ]
    return bool(lines) and all(line == CA_DIRECTIVE for line in lines)


class CloudInitG3CharacterizationTests(unittest.TestCase):
    def test_existing_single_password_line_gets_duplicate_on_reinitialization(self):
        # This is the starting shape manually installed in the AWS lab.
        original = "# generated sudoers fixture\n" + PASSWORD_RULE + "\n"
        self.assertTrue(password_policy_review(original))
        after_first_reinit = cloud_init_25_2_write_sudo_rules_model(original)
        self.assertEqual(after_first_reinit.count(PASSWORD_RULE), 2)
        self.assertIn(CANONICAL_CLOUD_INIT_BLOCK, after_first_reinit)
        self.assertFalse(password_policy_review(after_first_reinit))
        # Only the first reinitialization appends the complete official block.
        self.assertEqual(
            cloud_init_25_2_write_sudo_rules_model(after_first_reinit),
            after_first_reinit,
        )

    def test_full_official_block_is_text_idempotent_across_reinitializations(self):
        canonical = cloud_init_25_2_write_sudo_rules_model(None)
        self.assertTrue(password_policy_review(canonical))
        self.assertEqual(
            cloud_init_25_2_write_sudo_rules_model(canonical), canonical
        )
        self.assertEqual(
            cloud_init_25_2_write_sudo_rules_model(
                cloud_init_25_2_write_sudo_rules_model(canonical)
            ),
            canonical,
        )

    def test_old_nopasswd_rule_is_not_deleted_or_overridden_safely(self):
        old = "ubuntu ALL=(ALL) NOPASSWD:ALL\n"
        after_reinit = cloud_init_25_2_write_sudo_rules_model(old)
        self.assertIn("NOPASSWD:ALL", after_reinit)
        self.assertIn(PASSWORD_RULE, after_reinit)
        self.assertFalse(password_policy_review(after_reinit))
        self.assertEqual(
            cloud_init_25_2_write_sudo_rules_model(after_reinit),
            after_reinit,
        )
        # Presence of a canonical block alone is never sufficient approval.
        self.assertFalse(password_policy_review(
            CANONICAL_CLOUD_INIT_BLOCK + "ubuntu ALL=(ALL) NOPASSWD:ALL\n"
        ))

    def test_identical_ca_lines_still_accumulate_on_every_reinitialization(self):
        base = "# sshd_config fixture\n"
        first = lightsail_user_data_append_model(base)
        second = lightsail_user_data_append_model(first)
        third = lightsail_user_data_append_model(second)
        self.assertEqual(first.count(CA_DIRECTIVE), 1)
        self.assertEqual(second.count(CA_DIRECTIVE), 2)
        self.assertEqual(third.count(CA_DIRECTIVE), 3)
        self.assertTrue(ca_directive_review(third))
        self.assertNotEqual(second, third)  # Strict text idempotence FAIL.

    def test_prior_different_ca_directive_is_not_hidden_by_later_good_line(self):
        prior = "TrustedUserCAKeys /etc/ssh/unreviewed_ca.pub\n"
        after = lightsail_user_data_append_model(prior)
        self.assertFalse(ca_directive_review(after))
        self.assertEqual(after.count(CA_DIRECTIVE), 1)
        # sshd first-value-wins must be checked in real sshd -T -C as well.

    def test_absent_or_comment_only_ca_is_not_mistaken_for_active_trust(self):
        self.assertFalse(ca_directive_review(""))
        self.assertFalse(ca_directive_review("# " + CA_DIRECTIVE + "\n"))


if __name__ == "__main__":
    unittest.main()
