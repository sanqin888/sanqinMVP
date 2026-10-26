"""F4-B11 protected inputs + held source/ancestor writer assembly, no effects."""
from contextlib import contextmanager
from dataclasses import dataclass

import normal_runtime_bootstrap as bootstrap
from normal_runtime_inputs import parse_pinned_update_inputs
from normal_runtime_launch import SHA256
from normal_runtime_process_check import require_current_launch_process
from normal_runtime_source_anchor import capture_anchored_candidate_sources
from normal_runtime_writer_loader import load_pinned_writer_candidate

_SOURCE_OWNER = (0, 0)


@dataclass(frozen=True)
class ProtectedWriterAssembly:
    sources: object
    loaded: object
    launch_sha256: str
    request_sha256: str


@contextmanager
def assemble_protected_writer(transaction_id, *, expected_launch_sha256,
                              expected_request_sha256):
    """Hold approved input/source/module scopes until consumer exit.

    Fixed stores, no path/owner/callback override. Outer executed code, stdlib,
    platform and independent pins need prior authentication. Not the old CLI,
    source attestation, transaction consumption or permission to run effects.
    """
    bootstrap._require(type(transaction_id) is str
        and bootstrap.TXID.fullmatch(transaction_id), "invalid writer transaction")
    for pin in (expected_launch_sha256, expected_request_sha256):
        bootstrap._require(type(pin) is str and SHA256.fullmatch(pin)
                           and pin != "0" * 64, "invalid independent writer pin")
    with bootstrap._capture_private_tree(
            bootstrap.APPROVAL_ROOT + "/" + transaction_id, bootstrap.INPUT_LIMITS) as inputs:
        pins = bootstrap._document(inputs["pins.json"])
        bootstrap._require(pins == {
            "schema": "sanq.runtime.normal-update-bootstrap-pins.v1",
            "transactionId": transaction_id, "launchSha256": expected_launch_sha256,
            "requestSha256": expected_request_sha256},
            "installed approvals differ from independent writer pins")
        parsed = parse_pinned_update_inputs(inputs["launch.json"], inputs["request.json"],
            expected_launch_sha256=expected_launch_sha256,
            expected_request_sha256=expected_request_sha256)
        materials = parsed.request.launch
        bootstrap._require(materials.transaction_id == transaction_id
            and materials.bootstrap_source == bootstrap.BOOTSTRAP_SOURCE,
            "writer input transaction or bootstrap differs")
        require_current_launch_process(materials, expected_launch_sha256=expected_launch_sha256)
        with capture_anchored_candidate_sources(materials,
                expected_launch_sha256=expected_launch_sha256,
                expected_owner_uid=_SOURCE_OWNER[0], expected_owner_gid=_SOURCE_OWNER[1]) as sources:
            with load_pinned_writer_candidate(
                    sources.source_snapshot, parsed.launch_bytes, parsed.request_bytes,
                    expected_launch_sha256=expected_launch_sha256,
                    expected_request_sha256=expected_request_sha256) as loaded:
                yield ProtectedWriterAssembly(sources, loaded,
                    expected_launch_sha256, expected_request_sha256)
    # Exit-check failures propagate; this library emits no success report or permit.
