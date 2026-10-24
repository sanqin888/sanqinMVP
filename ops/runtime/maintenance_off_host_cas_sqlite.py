"""P2-C3A offline-only SQLite CAS. No network, root, Docker or Guard integration.

Strong SQLite transaction semantics in a private synthetic lab do NOT certify
power-loss durability, off-host origin, authenticated identity or anti-rollback.
"""
from __future__ import annotations

import os
from pathlib import Path
import sqlite3
import stat
from urllib.parse import quote

from maintenance_boot_guard_contract import (
    BootGuardBlocked, InstallationAnchor, decode_anchor, decode_state,
    identity, require, sha,
)
from maintenance_off_host_cas_contract import (
    OfflineCasHead, OfflineCasLookup, OfflineCasReceipt, OfflineCasSubmission,
)
from normal_runtime_launch import canonical, digest

SCHEMA_VERSION = 1
# NO release/rollback/normal-business authorization exists in the offline lab.
TRANSITIONS = {
    "INSTALLED_INACTIVE": frozenset({"READY_TO_ARM", "INCIDENT"}),
    "READY_TO_ARM": frozenset({"ARMING", "INCIDENT"}),
    "ARMING": frozenset({"FENCED", "INCIDENT"}),
    "FENCED": frozenset({"INCIDENT"}),
    "INCIDENT": frozenset(),
}
SCHEMA = (
    """CREATE TABLE enrollments (
         host_id TEXT NOT NULL, installation_id TEXT NOT NULL,
         anchor_bytes BLOB NOT NULL, client_identity TEXT NOT NULL,
         PRIMARY KEY(host_id, installation_id))""",
    """CREATE TABLE heads (
         host_id TEXT NOT NULL, installation_id TEXT NOT NULL,
         epoch INTEGER NOT NULL CHECK(epoch >= 1),
         state_sha256 TEXT NOT NULL, commit_sha256 TEXT NOT NULL,
         PRIMARY KEY(host_id, installation_id),
         FOREIGN KEY(host_id, installation_id)
           REFERENCES enrollments(host_id, installation_id))""",
    """CREATE TABLE commits (
         commit_sha256 TEXT PRIMARY KEY,
         host_id TEXT NOT NULL, installation_id TEXT NOT NULL,
         epoch INTEGER NOT NULL CHECK(epoch >= 1),
         request_sha256 TEXT NOT NULL UNIQUE,
         nonce_sha256 TEXT NOT NULL UNIQUE,
         proposal_sha256 TEXT NOT NULL UNIQUE,
         state_sha256 TEXT NOT NULL,
         previous_state_sha256 TEXT,
         previous_commit_sha256 TEXT,
         state_bytes BLOB NOT NULL,
         receipt_bytes BLOB NOT NULL,
         client_identity TEXT NOT NULL,
         UNIQUE(host_id, installation_id, epoch),
         FOREIGN KEY(host_id, installation_id)
           REFERENCES enrollments(host_id, installation_id))""",
    """CREATE TABLE audit_events (
         commit_sha256 TEXT PRIMARY KEY,
         request_sha256 TEXT NOT NULL UNIQUE,
         event_type TEXT NOT NULL CHECK(event_type = 'LAB_CAS_COMMITTED'),
         FOREIGN KEY(commit_sha256) REFERENCES commits(commit_sha256))""",
)


def _private_location(path: Path, *, must_exist: bool) -> None:
    """A narrow lab preflight; not a symlink-race-proof root installation."""
    parent = path.parent
    p = parent.lstat()
    require(stat.S_ISDIR(p.st_mode) and p.st_uid == os.getuid()
            and stat.S_IMODE(p.st_mode) == 0o700,
            "UNSAFE_LAB_PARENT")
    if must_exist:
        info = path.lstat()
        require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
                and info.st_uid == os.getuid()
                and stat.S_IMODE(info.st_mode) == 0o600,
                "UNSAFE_LAB_DB")
    else:
        require(not os.path.lexists(str(path)), "LAB_DB_ALREADY_EXISTS")


def _connect(path: Path) -> sqlite3.Connection:
    _private_location(path, must_exist=True)
    uri = "file:" + quote(str(path), safe="/") + "?mode=rw"
    connection = sqlite3.connect(uri, uri=True, isolation_level=None, timeout=1.0)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA fullfsync=ON")
        connection.execute("PRAGMA checkpoint_fullfsync=ON")
        require(connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
                and connection.execute("PRAGMA synchronous").fetchone()[0] == 2
                and connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
                and connection.execute("PRAGMA fullfsync").fetchone()[0] == 1
                and connection.execute("PRAGMA checkpoint_fullfsync").fetchone()[0] == 1,
                "SQLITE_DURABILITY_CONFIG_MISMATCH")
        require(connection.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION,
                "LAB_SCHEMA_MISMATCH")
        require(connection.execute("PRAGMA quick_check").fetchall() == [("ok",)],
                "LAB_DB_INTEGRITY_FAILURE")
        return connection
    except BaseException:
        connection.close()
        raise


def _enrollment(connection: sqlite3.Connection, host: str, install: str,
                client: str) -> InstallationAnchor:
    require(identity(host) and identity(install) and identity(client),
            "INVALID_LAB_IDENTITY")
    row = connection.execute(
        "SELECT anchor_bytes, client_identity FROM enrollments "
        "WHERE host_id=? AND installation_id=?", (host, install)).fetchone()
    require(row is not None, "MISSING_LAB_ENROLLMENT")
    anchor = decode_anchor(bytes(row[0]))
    require(anchor.host_id == host and anchor.installation_id == install
            and row[1] == client, "LAB_IDENTITY_MISMATCH")
    return anchor


def _current(connection: sqlite3.Connection, host: str, install: str):
    head = connection.execute(
        "SELECT epoch,state_sha256,commit_sha256 FROM heads "
        "WHERE host_id=? AND installation_id=?", (host, install)).fetchone()
    if head is None:
        require(connection.execute(
            "SELECT count(*) FROM commits WHERE host_id=? AND installation_id=?",
            (host, install)).fetchone()[0] == 0, "LAB_HEAD_MISSING")
        return None, None
    commit = connection.execute(
        "SELECT epoch,state_sha256,state_bytes,receipt_bytes,request_sha256,"
        "proposal_sha256,previous_commit_sha256,client_identity,previous_state_sha256 "
        "FROM commits WHERE commit_sha256=? AND host_id=? AND installation_id=?",
        (head[2], host, install)).fetchone()
    require(commit is not None and type(head[0]) is int
            and head[0] == commit[0] and head[1] == commit[1]
            and digest(bytes(commit[2])) == head[1],
            "LAB_HEAD_CORRUPT")
    state = decode_state(bytes(commit[2]))
    require(state.host_id == host and state.installation_id == install
            and state.epoch == head[0] and commit[8] == state.previous_sha256,
            "LAB_HEAD_CORRUPT")
    counts = connection.execute(
        "SELECT (SELECT count(*) FROM commits WHERE host_id=? AND installation_id=?),"
        "(SELECT count(*) FROM audit_events e JOIN commits c "
        "ON c.commit_sha256=e.commit_sha256 "
        "WHERE c.host_id=? AND c.installation_id=?)",
        (host, install, host, install)).fetchone()
    require(counts == (head[0], head[0]), "LAB_HISTORY_INCOMPLETE")
    if head[0] == 1:
        require(commit[6] is None, "LAB_CHAIN_BROKEN")
    else:
        previous = connection.execute(
            "SELECT epoch,state_sha256 FROM commits WHERE commit_sha256=? "
            "AND host_id=? AND installation_id=?",
            (commit[6], host, install)).fetchone()
        require(previous == (head[0] - 1, state.previous_sha256),
                "LAB_CHAIN_BROKEN")
    receipt = OfflineCasReceipt(host, install, commit[7], commit[0],
                                commit[4], commit[1], commit[5],
                                commit[6], head[2])
    require(receipt.encode() == bytes(commit[3]), "LAB_RECEIPT_CORRUPT")
    return head, state


def initialize_offline_lab(db_path: str, anchor: InstallationAnchor,
                           client_identity: str) -> None:
    """Explicit synthetic enrollment. Never called from a service startup."""
    require(type(anchor) is InstallationAnchor and identity(client_identity),
            "INVALID_LAB_ENROLLMENT")
    anchor.document()
    path = Path(os.path.abspath(os.fspath(db_path)))
    _private_location(path, must_exist=False)
    flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(str(path), flags, 0o600)
    os.close(fd)
    # If setup fails, leave the incomplete file for investigation; do not erase.
    conn = sqlite3.connect(str(path), isolation_level=None, timeout=1.0)
    try:
        require(conn.execute("PRAGMA journal_mode=WAL").fetchone()[0].lower() == "wal",
                "SQLITE_WAL_UNAVAILABLE")
        conn.execute("PRAGMA synchronous=FULL")
        conn.execute("PRAGMA fullfsync=ON")
        conn.execute("PRAGMA checkpoint_fullfsync=ON")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("BEGIN IMMEDIATE")
        for sql in SCHEMA:
            conn.execute(sql)
        conn.execute(
            "INSERT INTO enrollments(host_id,installation_id,anchor_bytes,client_identity)"
            " VALUES(?,?,?,?)",
            (anchor.host_id, anchor.installation_id,
             sqlite3.Binary(canonical(anchor.document())), client_identity))
        conn.execute("PRAGMA user_version=" + str(SCHEMA_VERSION))
        conn.commit()
    finally:
        conn.close()


class OfflineSqliteCas:
    """Explicitly enrolled, file-backed synthetic CAS; NEVER an OffHostCasCustody."""

    def __init__(self, db_path: str):
        self.path = Path(os.path.abspath(os.fspath(db_path)))

    def _open(self) -> sqlite3.Connection:
        try:
            return _connect(self.path)
        except (OSError, sqlite3.Error) as exc:
            raise BootGuardBlocked("LAB_DB_UNAVAILABLE") from exc

    def submit(self, proposal: OfflineCasSubmission, *,
               _test_interrupt: str | None = None) -> OfflineCasReceipt:
        """Non-idempotent write. Unknown outcome MUST use lookup, not resubmit.

        _test_interrupt is an offline-test-only hook, NOT an executable/remote API.
        """
        require(type(proposal) is OfflineCasSubmission, "INVALID_LAB_PROPOSAL")
        state = proposal.state()
        require(_test_interrupt in (None, "before_commit", "after_commit"),
                "INVALID_TEST_INTERRUPT")
        request = proposal.request
        conn = self._open()
        committed = False
        try:
            conn.execute("BEGIN IMMEDIATE")
            anchor = _enrollment(conn, state.host_id, state.installation_id,
                                 proposal.client_identity)
            require(anchor.sha256() == proposal.anchor_sha256,
                    "LAB_ANCHOR_MISMATCH")
            current, prior = _current(conn, state.host_id, state.installation_id)
            expected_epoch = current[0] if current else 0
            expected_sha = current[1] if current else None
            require(request.expected_epoch == expected_epoch
                    and request.expected_state_sha256 == expected_sha,
                    "LAB_CAS_CONFLICT")
            if prior is None:
                require(state.phase == "INSTALLED_INACTIVE"
                        and state.epoch == 1, "LAB_INITIAL_STATE_DENIED")
            else:
                require(state.phase in TRANSITIONS.get(prior.phase, ())
                        and state.registry_sha256 == prior.registry_sha256
                        and state.owner_id == prior.owner_id
                        and state.transaction_id == prior.transaction_id
                        and state.anchor_sha256 == prior.anchor_sha256,
                        "LAB_TRANSITION_DENIED")
            prior_commit = current[2] if current else None
            proposal_sha = proposal.sha256()
            commit_sha = digest(canonical({
                "schema": "sanq.runtime.offline-cas-commit.v2",
                "proposalSha256": proposal_sha,
                "previousCommitSha256": prior_commit}))
            receipt = OfflineCasReceipt(
                state.host_id, state.installation_id, proposal.client_identity,
                state.epoch, request.sha256(), state.sha256(), proposal_sha,
                prior_commit, commit_sha)
            conn.execute(
                "INSERT INTO commits(commit_sha256,host_id,installation_id,epoch,"
                "request_sha256,nonce_sha256,proposal_sha256,state_sha256,"
                "previous_state_sha256,previous_commit_sha256,state_bytes,"
                "receipt_bytes,client_identity) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (commit_sha, state.host_id, state.installation_id, state.epoch,
                 request.sha256(), request.nonce_sha256, proposal_sha, state.sha256(),
                 state.previous_sha256, prior_commit,
                 sqlite3.Binary(state.encode()),
                 sqlite3.Binary(receipt.encode()), proposal.client_identity))
            conn.execute(
                "INSERT INTO audit_events(commit_sha256,request_sha256,event_type) "
                "VALUES(?,?,'LAB_CAS_COMMITTED')",
                (commit_sha, request.sha256()))
            conn.execute(
                "INSERT INTO heads(host_id,installation_id,epoch,state_sha256,"
                "commit_sha256) VALUES(?,?,?,?,?) ON CONFLICT(host_id,installation_id)"
                " DO UPDATE SET epoch=excluded.epoch,state_sha256=excluded.state_sha256,"
                " commit_sha256=excluded.commit_sha256",
                (state.host_id, state.installation_id, state.epoch,
                 state.sha256(), commit_sha))
            if _test_interrupt == "before_commit":
                raise BootGuardBlocked("SYNTHETIC_BEFORE_COMMIT")
            try:
                conn.commit()
            except sqlite3.Error as exc:
                # A COMMIT exception can be indeterminate; read head/status first.
                raise BootGuardBlocked("LAB_COMMIT_OUTCOME_UNKNOWN") from exc
            committed = True
            if _test_interrupt == "after_commit":
                raise BootGuardBlocked("SYNTHETIC_OUTCOME_UNKNOWN")
            return receipt
        except sqlite3.Error as exc:
            raise BootGuardBlocked("LAB_TRANSACTION_FAILURE") from exc
        finally:
            if not committed:
                try:
                    conn.rollback()
                except sqlite3.Error:
                    pass
            conn.close()

    def read_head(self, host_id: str, installation_id: str,
                  client_identity: str) -> OfflineCasHead | None:
        conn = self._open()
        try:
            _enrollment(conn, host_id, installation_id, client_identity)
            head, state = _current(conn, host_id, installation_id)
            if head is None:
                return None
            return OfflineCasHead(head[0], head[1], head[2], state.phase)
        except sqlite3.Error as exc:
            raise BootGuardBlocked("LAB_READ_FAILURE") from exc
        finally:
            conn.close()

    def lookup_commit(self, host_id: str, installation_id: str,
                      client_identity: str, request_sha256: str) -> OfflineCasLookup | None:
        require(sha(request_sha256), "INVALID_LAB_REQUEST_HASH")
        conn = self._open()
        try:
            _enrollment(conn, host_id, installation_id, client_identity)
            head, _ = _current(conn, host_id, installation_id)
            row = conn.execute(
                "SELECT epoch,state_sha256,proposal_sha256,"
                "previous_commit_sha256,commit_sha256,receipt_bytes,client_identity "
                "FROM commits WHERE host_id=? AND installation_id=? AND request_sha256=?",
                (host_id, installation_id, request_sha256)).fetchone()
            if row is None:
                return None
            receipt = OfflineCasReceipt(host_id, installation_id, row[6],
                                        row[0], request_sha256, row[1],
                                        row[2], row[3], row[4])
            require(receipt.encode() == bytes(row[5]), "LAB_RECEIPT_CORRUPT")
            return OfflineCasLookup(receipt, head is not None and head[2] == row[4])
        except sqlite3.Error as exc:
            raise BootGuardBlocked("LAB_READ_FAILURE") from exc
        finally:
            conn.close()
