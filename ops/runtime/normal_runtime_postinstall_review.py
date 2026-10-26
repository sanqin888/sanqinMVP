"""F4-B3 fixed-path post-install byte review, never a finalizer.

Uses the ORIGINAL pinned request and original target Archive. The old pinned
preserved observation remains an untrusted historical baseline; matching it
does not authenticate frozen state, live containers, storage mounts or R2.
"""
from __future__ import annotations

import io
import tarfile

from build_bundle import MANIFEST, SOURCE_FILES, MAX_ARCHIVE_BYTES, RUNTIME_PREFIX
from normal_runtime_inputs import parse_pinned_update_inputs, _document
from normal_runtime_launch import digest, SHA256
from normal_runtime_readonly_anchor import _fixed_runtime
from normal_runtime_readonly_review import (
    _installed, _pinned_observation, _preserved_state, _require,
)
from release_contract import github_json
from runtime_trust import verify_runtime_publication
from stage_bundle import validated_archive_files, validate_layout


def _target(request, archive, fetch):
    _require(type(archive) is bytes and 0 < len(archive) <= MAX_ARCHIVE_BYTES,
             "bounded immutable original target bytes required")
    proof = verify_runtime_publication(archive, request["targetRuntimeSha"], fetch=fetch)
    _require(proof.get("verified") is True
             and proof.get("sourceSha") == request["targetRuntimeSha"]
             and proof.get("runtimeArchiveDigest") == request["targetArchiveDigest"]
             == "sha256:" + digest(archive)
             and proof.get("productionActivationAuthorized") is False,
             "target publication differs from original request")
    manifest, files = validated_archive_files(archive, request["targetRuntimeSha"])
    validate_layout(files)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        item = tar.getmember(RUNTIME_PREFIX + "/" + MANIFEST)
        _require(item.isfile() and 0 < item.size <= 16384, "bounded original manifest required")
        stream = tar.extractfile(item)
        _require(stream is not None, "original manifest unavailable")
        with stream:
            raw = stream.read(16385)
    _require(len(raw) == item.size and _document(raw) == manifest
             and type(manifest.get("schemaVersion")) is int,
             "original target manifest differs")
    return proof, files, raw


def review_fixed_installed_target(launch_bytes, request_bytes, *,
                                   expected_launch_sha256, expected_request_sha256,
                                   target_archive, preserved_observation, fetch=github_json):
    """Verify actual target bytes at /opt/sanq/runtime, in this namespace only.

    Does not rewrite currentRuntimeSha, issue a new request, verify freshness of
    the historical preserved observation or claim successful HANDOFF/restore.
    No writes, CLI, Flow completion, ledger/disposition/R2 mutation or permit.
    """
    parsed = parse_pinned_update_inputs(launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256)
    request = parsed.request.document()
    observation = _pinned_observation(preserved_observation, request)
    old_manifest = observation.get("runtimeManifestSha256")
    _require(type(old_manifest) is str and SHA256.fullmatch(old_manifest)
             and old_manifest != "0" * 64, "original manifest baseline missing")
    # Open and hold the finite tree BEFORE network verification: final FD/edge
    # checks cover mutations during GETs as well as the comparison itself.
    with _fixed_runtime() as (root_fd, directories, _):
        with _installed(root_fd) as (files, metadata, _):
            proof, target_files, manifest_raw = _target(request, target_archive, fetch)
            _require(files[MANIFEST] == manifest_raw,
                     "installed manifest differs from original target bytes")
            _require(all(files[name] == target_files[name] for name in SOURCE_FILES),
                     "installed target member bytes differ")
            _preserved_state(files, metadata, request, observation)
            result = {
                "kind": "normal-runtime-postinstall-readonly-review-v1",
                "status": "TARGET_AND_PINNED_PRESERVED_BYTES_MATCH",
                "requestSha256": digest(request_bytes),
                "launchMaterialsSha256": digest(launch_bytes),
                "originalCurrentSourceSha": request["currentRuntimeSha"],
                "originalCurrentArchiveDigest": request["currentArchiveDigest"],
                "targetSourceSha": request["targetRuntimeSha"],
                "targetArchiveDigest": request["targetArchiveDigest"],
                "targetPublication": proof, "targetPolicy": "EXISTING_NEWEST_PUBLICATION",
                "installedManifestSha256": digest(files[MANIFEST]),
                "originalObservationManifestSha256": old_manifest,
                "preservedObservationSha256": digest(preserved_observation),
                "preservedFiles": {name: metadata[name] for name in
                                   (".env", ".sanq-release-state.json",
                                    ".sanq-backup-layout-activated")},
                "memberCount": len(SOURCE_FILES),
                "targetInstalledBytesMatch": True,
                "preservedBytesMatchPinnedObservation": True,
                "applicationIdentityBytesMatch": True,
                "fixedRuntimePathBound": True,
                "runtimePathBinding": {"path": "/opt/sanq/runtime",
                                       "directories": list(directories),
                                       "namespaceAuthenticated": False,
                                       "continuousBindingVerified": False},
                "oldArchiveBytesRequired": False,
                "sourceProvenanceAuthenticated": False,
                "installedRootPathAuthenticated": False,
                "frozenBaselineAuthenticated": False,
                "containerObservationAuthenticated": False,
                "storageMountsAuthenticated": False,
                "continuousMaintenanceVerified": False,
                "actualHandoffVerified": False,
                "originalPoliciesRestoredVerified": False,
                "businessReleaseVerified": False,
                "r2DispositionVerified": False,
                "transactionAdmitted": False, "transactionFinalized": False,
                "flowInvoked": False, "readyToInstall": False,
                "authorizedToMutateProduction": False, "decision": "BLOCKED",
            }
    # Both finite-tree and fixed-ancestor exit rechecks finish before return.
    return result
