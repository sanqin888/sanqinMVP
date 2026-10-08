"""C5-B3B2G: non-executable stable Launcher bootstrap *manifest* contract.

A manifest only describes a proposed independently installed artifact. It is
never a substitute for trusted host inspection or an executable authorization.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from root_launcher_preflight import LAUNCHER_ROOT
from versioned_persistence_contract import PersistenceBlocked

HASH = re.compile(r"sha256:[0-9a-f]{64}\Z")
INSTALL_PATH = LAUNCHER_ROOT + "/sanq-runtime-launcher"


class BootstrapBlocked(PersistenceBlocked):
    """Proposed Launcher packaging/identity contract mismatch."""


def validate_inert_bootstrap(manifest: Any, launcher_bytes: Any) -> dict[str, Any]:
    required = {
        "schemaVersion", "kind", "installPath", "ownerUid", "ownerGid",
        "fileMode", "payloadSha256", "packagingAuthority",
        "bootstrapApproved", "productionActivationAuthorized",
    }
    if not isinstance(manifest, dict) or set(manifest) != required:
        raise BootstrapBlocked("unexpected bootstrap manifest")
    if (type(manifest["schemaVersion"]) is not int or manifest["schemaVersion"] != 1
            or manifest["kind"] != "inert-root-launcher-package-v1"
            or manifest["installPath"] != INSTALL_PATH):
        raise BootstrapBlocked("unsupported fixed Launcher identity")
    if (type(manifest["ownerUid"]) is not int or manifest["ownerUid"] != 0
            or type(manifest["ownerGid"]) is not int or manifest["ownerGid"] != 0
            or manifest["fileMode"] != "0500"):
        raise BootstrapBlocked("privileged owner/mode contract drift")
    if manifest["packagingAuthority"] != "independent-root-operator-review-required":
        raise BootstrapBlocked("packaging authority is not frozen")
    if manifest["bootstrapApproved"] is not False or manifest["productionActivationAuthorized"] is not False:
        raise BootstrapBlocked("inert manifest cannot claim installation authority")
    if (not isinstance(launcher_bytes, bytes) or not launcher_bytes
            or len(launcher_bytes) > 4 * 1024 * 1024):
        raise BootstrapBlocked("missing/oversized candidate bytes")
    digest = manifest["payloadSha256"]
    if not isinstance(digest, str) or HASH.fullmatch(digest) is None:
        raise BootstrapBlocked("malformed artifact hash")
    if digest != "sha256:" + hashlib.sha256(launcher_bytes).hexdigest():
        raise BootstrapBlocked("candidate artifact bytes mismatch")
    return {
        "schemaVersion": 1,
        "kind": "inert-launcher-bootstrap-preview-v1",
        "candidateArtifactMatchesManifest": True,
        "independentRootInstallationVerified": False,
        "authenticPublisherVerified": False,
        "trustedHostVerified": False,
        "rootPrivilegeProvisioned": False,
        "readyToInstall": False,
        "authorizedToMutateProduction": False,
    }
