"""VB-04D1 synthetic Unit + installation manifest validation, NEVER an installer.

No host reads/writes, systemctl, socket, Docker, subprocess, network, privilege,
unit text rendering or P1 permission decisions. Caller-supplied evidence is
not an attestation of systemd 249 behavior or file provenance.
"""
from __future__ import annotations

from dataclasses import dataclass

from maintenance_boot_guard_contract import BootGuardBlocked, identity, require, sha
from normal_runtime_launch import canonical, digest

SCHEMA = "sanq.runtime.vb04d1-unit-install-manifest.v1"
LAB_ONLY = "OFFLINE_STATIC_CANDIDATE_ONLY"
UNRESOLVED = (
    "DIRECT_DOCKERD_UNCONTROLLED",
    "EXISTING_WRITERS_UNVERIFIED",
    "OFF_HOST_AUTHORITY_NOT_VERIFIED",
    "G06_RESCUE_NOT_VERIFIED",
    "SYSTEMD_249_RUNTIME_NOT_TESTED",
)
UNIT_NAMES = ("docker.service", "docker.socket", "containerd.service")
UNIT_FILES = {
    "docker.service": "/lib/systemd/system/docker.service",
    "docker.socket": "/lib/systemd/system/docker.socket",
    "containerd.service": "/lib/systemd/system/containerd.service",
}
DOCKER_COMMAND = (
    "/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock"
)
GUARD_BINARY = "/usr/local/libexec/sanq-maintenance/boot_guard"
PATH_LAYOUT = {
    # role: (kind, absolute path, root-owned mode)
    "verifier-directory": ("dir", "/usr/local/libexec/sanq-maintenance", 0o700),
    "config-directory": ("dir", "/etc/sanq-maintenance", 0o700),
    "state-directory": ("dir", "/var/lib/sanq-maintenance", 0o700),
    "service-dropin-directory": ("dir", "/etc/systemd/system/docker.service.d", 0o755),
    "socket-dropin-directory": ("dir", "/etc/systemd/system/docker.socket.d", 0o755),
    "verifier-file": ("file", GUARD_BINARY, 0o700),
    "anchor-file": ("file", "/etc/sanq-maintenance/installation-anchor.json", 0o600),
    "service-dropin-file": (
        "file", "/etc/systemd/system/docker.service.d/50-sanq-boot-guard.conf", 0o644
    ),
    "socket-dropin-file": (
        "file", "/etc/systemd/system/docker.socket.d/50-sanq-boot-guard.conf", 0o644
    ),
}
GATE_PHASES = {
    "docker.service": "SERVICE_PRE_EXEC",
    "docker.socket": "SOCKET_PRE_BIND",
}


def _units(value: tuple[str, ...]) -> bool:
    return (type(value) is tuple
            and len(value) <= 40
            and all(type(x) is str and 0 < len(x) <= 128
                    and x == x.strip() and "\n" not in x for x in value)
            and len(set(value)) == len(value))


@dataclass(frozen=True)
class ObservedUnit:
    name: str
    fragment: str
    exec_start: str
    listen: str
    requires: tuple[str, ...]
    wants: tuple[str, ...]
    after: tuple[str, ...]
    before: tuple[str, ...]
    triggers: tuple[str, ...]
    triggered_by: tuple[str, ...]
    drop_ins: tuple[str, ...]
    load_state: str
    active_state: str
    unit_file_state: str

    def document(self) -> dict:
        require(type(self.name) is str and self.name in UNIT_NAMES,
                "UNEXPECTED_UNIT")
        require(self.fragment == UNIT_FILES[self.name] and type(self.fragment) is str,
                "UNTRUSTED_UNIT_FRAGMENT")
        require(type(self.exec_start) is str and type(self.listen) is str,
                "INVALID_UNIT_COMMAND")
        require(all(_units(getattr(self, key)) for key in (
            "requires", "wants", "after", "before", "triggers",
            "triggered_by", "drop_ins")), "INVALID_UNIT_EDGES")
        require(self.drop_ins == (), "UNREVIEWED_EXISTING_DROPIN")
        require((self.load_state, self.active_state, self.unit_file_state)
                == ("loaded", "inactive", "disabled"), "BASELINE_STATE_DRIFT")
        if self.name == "docker.service":
            require(self.exec_start == DOCKER_COMMAND and self.listen == ""
                    and "docker.socket" in self.requires
                    and "docker.socket" in self.after
                    and "containerd.service" in self.wants
                    and self.triggered_by == ("docker.socket",),
                    "DOCKER_SERVICE_ENTRY_DRIFT")
        elif self.name == "docker.socket":
            require(self.exec_start == "" and self.listen == "/run/docker.sock (Stream)"
                    and self.triggers == ("docker.service",),
                    "DOCKER_SOCKET_ENTRY_DRIFT")
        else:
            require(self.exec_start == "/usr/bin/containerd" and self.listen == "",
                    "CONTAINERD_ENTRY_DRIFT")
        return {
            "name": self.name, "fragment": self.fragment,
            "execStart": self.exec_start, "listen": self.listen,
            "requires": self.requires, "wants": self.wants,
            "after": self.after, "before": self.before,
            "triggers": self.triggers, "triggeredBy": self.triggered_by,
            "dropIns": self.drop_ins, "loadState": self.load_state,
            "activeState": self.active_state, "unitFileState": self.unit_file_state,
        }


@dataclass(frozen=True)
class UnitBaseline:
    host_id: str
    installation_id: str
    systemd_major: int
    units: tuple[ObservedUnit, ...]

    def document(self) -> dict:
        require(identity(self.host_id) and identity(self.installation_id),
                "INVALID_INSTALLATION_IDENTITY")
        require(type(self.systemd_major) is int and self.systemd_major == 249,
                "SYSTEMD_VERSION_NOT_SCOPED")
        require(type(self.units) is tuple and len(self.units) == 3
                and all(type(x) is ObservedUnit for x in self.units),
                "MISSING_UNIT_EVIDENCE")
        names = [item.name for item in self.units]
        require(names == list(UNIT_NAMES), "MISSING_OR_REORDERED_UNIT")
        units = [unit.document() for unit in self.units]
        _check_order_graph(self.units)
        return {
            "schema": "sanq.runtime.vb04d1-observed-baseline.v1",
            "hostId": self.host_id, "installationId": self.installation_id,
            "systemdMajor": self.systemd_major, "units": units,
        }

    def sha256(self) -> str:
        return digest(canonical(self.document()))


def _check_order_graph(units: tuple[ObservedUnit, ...]) -> None:
    """Only declared ordering edges; not a complete systemd dependency solver."""
    graph = {name: set() for name in UNIT_NAMES}
    for unit in units:
        for name in unit.after:
            if name in graph:
                graph[unit.name].add(name)
        for name in unit.before:
            if name in graph:
                graph[name].add(unit.name)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> None:
        require(node not in visiting, "UNIT_ORDER_CYCLE")
        if node in visited:
            return
        visiting.add(node)
        for neighbor in sorted(graph[node]):
            visit(neighbor)
        visiting.remove(node)
        visited.add(node)

    for node in UNIT_NAMES:
        visit(node)


@dataclass(frozen=True)
class PathIntent:
    role: str
    kind: str
    path: str
    owner: str
    mode: int
    content_sha256: str | None

    def document(self) -> dict:
        require(type(self.role) is str and self.role in PATH_LAYOUT,
                "UNREVIEWED_INSTALL_PATH")
        kind, path, mode = PATH_LAYOUT[self.role]
        require(self.kind == kind and self.path == path and self.owner == "root"
                and type(self.mode) is int and self.mode == mode,
                "UNSAFE_INSTALL_PATH_INTENT")
        require(sha(self.content_sha256) if kind == "file"
                else self.content_sha256 is None,
                "MISSING_OR_INVALID_FILE_PIN")
        return {
            "role": self.role, "kind": self.kind, "path": self.path,
            "owner": self.owner, "mode": self.mode,
            "contentSha256": self.content_sha256,
        }


@dataclass(frozen=True)
class HookIntent:
    unit: str
    phase: str
    verifier: str
    check_each_attempt: bool
    deny_on_unknown: bool

    def document(self) -> dict:
        require(type(self.unit) is str and self.unit in GATE_PHASES
                and self.phase == GATE_PHASES[self.unit],
                "UNSAFE_HOOK_LOCATION")
        require(self.verifier == GUARD_BINARY
                and self.check_each_attempt is True
                and self.deny_on_unknown is True,
                "HOOK_FAIL_OPEN")
        return {
            "unit": self.unit, "phase": self.phase, "verifier": self.verifier,
            "checkEachAttempt": True, "denyOnUnknown": True,
        }


@dataclass(frozen=True)
class InstallManifest:
    baseline: UnitBaseline
    baseline_sha256: str
    paths: tuple[PathIntent, ...]
    hooks: tuple[HookIntent, ...]
    unresolved: tuple[str, ...]
    classification: str = LAB_ONLY

    def document(self) -> dict:
        require(type(self.baseline) is UnitBaseline, "MISSING_BASELINE")
        baseline = self.baseline.document()
        require(sha(self.baseline_sha256)
                and self.baseline_sha256 == digest(canonical(baseline)),
                "BASELINE_PIN_MISMATCH")
        require(type(self.paths) is tuple and len(self.paths) == len(PATH_LAYOUT)
                and all(type(x) is PathIntent for x in self.paths),
                "MISSING_INSTALL_FILES")
        require(tuple(p.role for p in self.paths) == tuple(PATH_LAYOUT),
                "INSTALL_PATH_SET_DRIFT")
        files = [p.document() for p in self.paths]
        require(type(self.hooks) is tuple and len(self.hooks) == 2
                and all(type(h) is HookIntent for h in self.hooks),
                "MISSING_DOUBLE_ENTRY_GATES")
        require(tuple(h.unit for h in self.hooks) == tuple(GATE_PHASES),
                "MISSING_DOUBLE_ENTRY_GATES")
        gates = [g.document() for g in self.hooks]
        require(type(self.unresolved) is tuple and self.unresolved == UNRESOLVED
                and self.classification == LAB_ONLY,
                "FALSE_SAFETY_CLAIM")
        return {
            "schema": SCHEMA, "classification": LAB_ONLY,
            "baseline": baseline, "baselineSha256": self.baseline_sha256,
            "paths": files, "hooks": gates, "unresolved": self.unresolved,
            "permissionToInstall": False, "permissionToStartDocker": False,
        }

    def encode(self) -> bytes:
        return canonical(self.document())

    def sha256(self) -> str:
        return digest(self.encode())


@dataclass(frozen=True)
class OfflineManifestVerdict:
    classification: str
    candidate: str
    reason: str
    decision: str = "DENY"
    authorized_to_install: bool = False
    authorized_to_start_docker: bool = False
    authenticated_off_host: bool = False
    runtime_guard_tested: bool = False
    can_arm: bool = False


def evaluate_offline_manifest(manifest: InstallManifest | None) -> OfflineManifestVerdict:
    """Valid structure is ONLY an untrusted candidate, never an install permit."""
    try:
        require(type(manifest) is InstallManifest, "MISSING_MANIFEST")
        manifest.document()
    except (BootGuardBlocked, ValueError, TypeError, RecursionError) as exc:
        reason = str(exc) if isinstance(exc, BootGuardBlocked) else "INVALID_MANIFEST"
        return OfflineManifestVerdict(LAB_ONLY, "REJECT", reason)
    return OfflineManifestVerdict(
        LAB_ONLY, "STATIC_STRUCTURE_VALID", "SYSTEMD_AND_AUTHORITY_NOT_VERIFIED"
    )
