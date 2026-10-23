"""R2-A2-1: inert, typed Maintenance Fence inventory and observation contracts.

Caller-supplied identities/coverage/policies are claims, never live evidence.
No host observer, persistence implementation, commands, paths or production grant.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace
import re

from normal_runtime_launch import TXID, canonical, digest

SCOPES = ("backup-helpers", "business-admission", "containers", "cron",
          "deploy-compose", "management", "systemd")
CONTROL_ROLES = frozenset({"BUSINESS", "STARTUP", "BACKUP"})
PRESERVE_ROLES = frozenset({"MANAGEMENT", "SANDBOX", "SYSTEM"})
ENABLED_STATES = frozenset({"enabled", "disabled", "static", "indirect", "masked",
                            "enabled-runtime", "masked-runtime", "linked",
                            "linked-runtime", "alias", "generated", "transient"})
PROTECTED_NAMES = frozenset({
    "sanq-clover-dev-cloudflared", "docker.service", "docker.socket",
    "ssh.service", "ssh.socket", "cron.service", "unattended-upgrades.service",
    "apt-daily.timer", "apt-daily-upgrade.timer",
})
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,255}\Z")


class FenceBlocked(ValueError):
    """Only bounded reason codes may be retained in incident evidence."""


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise FenceBlocked(reason)


def pin(value: str) -> bool:
    return type(value) is str and HEX64.fullmatch(value) is not None and value != "0" * 64


def token(value: str) -> bool:
    return type(value) is str and TOKEN.fullmatch(value) is not None


@dataclass(frozen=True)
class OriginalPolicyRecord:
    """An exact object and its original raw policy, not a generic enable/start."""
    object_key: str
    kind: str
    name: str
    native_id: str
    identity_sha256: str
    role: str
    disposition: str
    active_state: str
    enabled_state: str | None = None
    restart_name: str | None = None
    restart_max_retry: int | None = None

    def document(self) -> dict:
        require(token(self.object_key) and token(self.name) and token(self.native_id),
                "INVALID_OBJECT_ID")
        require(all(type(value) is str for value in (self.kind, self.role, self.disposition,
                                                     self.active_state)), "INVALID_POLICY_FIELDS")
        require(self.enabled_state is None or type(self.enabled_state) is str,
                "INVALID_POLICY_FIELDS")
        require(self.restart_name is None or type(self.restart_name) is str,
                "INVALID_POLICY_FIELDS")
        require(pin(self.identity_sha256), "INVALID_OBJECT_IDENTITY")
        require(self.kind in ("CONTAINER", "SYSTEMD", "ENTRYPOINT"), "INVALID_OBJECT_KIND")
        require(self.role in CONTROL_ROLES | PRESERVE_ROLES, "UNCLASSIFIED_OBJECT")
        expected = "CONTROL" if self.role in CONTROL_ROLES else "PRESERVE"
        require(self.disposition == expected, "DISPOSITION_CONFLICT")
        if self.name in PROTECTED_NAMES:
            require(self.disposition == "PRESERVE", "PROTECTED_OBJECT")
        if self.name == "sanq-clover-dev-cloudflared":
            require(self.kind == "CONTAINER" and self.role == "SANDBOX", "TUNNEL_CLASSIFICATION")
        if self.kind == "CONTAINER":
            require(pin(self.native_id), "INVALID_CONTAINER_ID")
            require(self.active_state in ("running", "exited", "created", "paused"),
                    "UNKNOWN_CONTAINER_STATE")
            require(self.enabled_state is None, "CONTAINER_ENABLED_STATE")
            require(self.restart_name in ("no", "always", "unless-stopped", "on-failure"),
                    "UNKNOWN_RESTART_POLICY")
            require(type(self.restart_max_retry) is int and 0 <= self.restart_max_retry <= 2147483647,
                    "INVALID_RESTART_RETRY")
            require(self.restart_name == "on-failure" or self.restart_max_retry == 0,
                    "RESTART_RETRY_CONFLICT")
        else:
            require(self.restart_name is None and self.restart_max_retry is None,
                    "NON_CONTAINER_RESTART_POLICY")
            require(self.active_state in ("active", "inactive", "failed"), "UNKNOWN_ACTIVE_STATE")
            if self.kind == "SYSTEMD":
                require(self.native_id == self.name
                        and self.name.endswith((".service", ".timer", ".socket")),
                        "INVALID_UNIT_ID")
                require(self.enabled_state in ENABLED_STATES, "UNKNOWN_ENABLED_STATE")
            else:
                require(self.enabled_state in ("enabled", "disabled"), "UNKNOWN_ENTRY_STATE")
        return asdict(self)


@dataclass(frozen=True)
class WriterStartupRegistry:
    host_id: str
    records: tuple[OriginalPolicyRecord, ...]
    covered_scopes: tuple[str, ...]
    unclassified_objects: tuple[str, ...] = ()

    def document(self) -> dict:
        require(token(self.host_id), "INVALID_HOST")
        require(type(self.covered_scopes) is tuple and self.covered_scopes == SCOPES,
                "INCOMPLETE_COVERAGE")
        require(type(self.unclassified_objects) is tuple and not self.unclassified_objects,
                "UNCLASSIFIED_OBJECT")
        require(type(self.records) is tuple and 1 <= len(self.records) <= 128,
                "INVALID_INVENTORY")
        require(all(type(record) is OriginalPolicyRecord for record in self.records),
                "TYPED_POLICIES_REQUIRED")
        records = [record.document() for record in self.records]
        keys = [record.object_key for record in self.records]
        require(keys == sorted(set(keys)), "DUPLICATE_OR_UNSORTED_OBJECT")
        native = [(record.kind, record.native_id) for record in self.records]
        names = [(record.kind, record.name) for record in self.records]
        require(len(set(native)) == len(native) and len(set(names)) == len(names),
                "DUPLICATE_NATIVE_OBJECT")
        require(any(record.role == "BUSINESS" for record in self.records)
                and any(record.role == "MANAGEMENT" for record in self.records),
                "MISSING_BUSINESS_OR_MANAGEMENT")
        return {"schema": "sanq.runtime.fence-registry.v1", "hostId": self.host_id,
                "records": records, "coveredScopes": list(self.covered_scopes),
                "unclassifiedObjects": []}

    def sha256(self) -> str:
        return digest(canonical(self.document()))


@dataclass(frozen=True)
class FenceBinding:
    host_id: str
    owner_id: str
    transaction_id: str
    epoch: int
    request_sha256: str
    registry_sha256: str

    def document(self) -> dict:
        require(token(self.host_id) and token(self.owner_id), "INVALID_OWNER_OR_HOST")
        require(type(self.transaction_id) is str and TXID.fullmatch(self.transaction_id) is not None,
                "INVALID_TRANSACTION")
        require(type(self.epoch) is int and 1 <= self.epoch <= 2147483647, "INVALID_EPOCH")
        require(pin(self.request_sha256) and pin(self.registry_sha256), "INVALID_BINDING_PIN")
        return asdict(self)

    def sha256(self) -> str:
        return digest(canonical(self.document()))


@dataclass(frozen=True)
class PersistenceReceipt:
    """A correlated claim from a future adapter, not proof of fsync or custody."""
    location: str
    binding_sha256: str
    state_sha256: str
    revision: int
    previous_sha256: str | None
    evidence_sha256: str


@dataclass(frozen=True)
class FenceObservation:
    """One complete fresh challenge response; missing/unknown values deny."""
    binding_sha256: str
    state_sha256: str
    sequence: int
    boot_id: str
    evidence_sha256: str
    records: tuple[OriginalPolicyRecord, ...]
    covered_scopes: tuple[str, ...]
    unknown_objects: tuple[str, ...] = ()
    credentials: str = "UNKNOWN"
    management_available: bool = False
    business_admission: str = "UNKNOWN"
    external_events: str = "UNKNOWN"


def frozen_policy(record: OriginalPolicyRecord) -> OriginalPolicyRecord:
    """Desired metadata only. It neither stops a service nor installs a guard."""
    record.document()
    if record.disposition == "PRESERVE":
        return record
    if record.kind == "CONTAINER":
        return replace(record, active_state="exited", restart_name="no", restart_max_retry=0)
    return replace(record, active_state="inactive",
                   enabled_state="masked" if record.kind == "SYSTEMD" else "disabled")


def registry_from_document(value: dict) -> WriterStartupRegistry:
    require(type(value) is dict and set(value) == {
        "schema", "hostId", "records", "coveredScopes", "unclassifiedObjects"},
        "INVALID_REGISTRY_DOCUMENT")
    require(value["schema"] == "sanq.runtime.fence-registry.v1"
            and type(value["records"]) is list and 1 <= len(value["records"]) <= 128
            and type(value["coveredScopes"]) is list
            and type(value["unclassifiedObjects"]) is list, "INVALID_REGISTRY_DOCUMENT")
    try:
        records = tuple(OriginalPolicyRecord(**record) for record in value["records"])
        registry = WriterStartupRegistry(value["hostId"], records, tuple(value["coveredScopes"]),
                                         tuple(value["unclassifiedObjects"]))
        require(registry.document() == value, "NONCANONICAL_REGISTRY")
        return registry
    except (TypeError, AttributeError) as exc:
        raise FenceBlocked("INVALID_REGISTRY_DOCUMENT") from exc
