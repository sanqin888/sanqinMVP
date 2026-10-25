"""C1-PREP-07: one ordered, root-owned source assembly boundary.

Inputs are pinned before filesystem access. Ancestor/source exit checks finish
before caller entry; only the fixed-byte module scope remains open afterwards.
No Flow call, CLI, platform/source authentication or real-effect authority.
"""
from __future__ import annotations

from contextlib import contextmanager, ExitStack
from dataclasses import dataclass
from typing import Iterator

from normal_runtime_inputs import parse_pinned_update_inputs
from normal_runtime_process_check import require_current_launch_process
from normal_runtime_source_anchor import (
    AnchoredSourceSnapshot, capture_anchored_candidate_sources,
)
from normal_runtime_source_loader import (
    LoadedNormalCandidate, load_pinned_normal_candidate,
)


@dataclass(frozen=True)
class NormalCandidateAssembly:
    """Completed path/byte observations plus loaded types; not a live FD lease."""

    sources: AnchoredSourceSnapshot
    loaded: LoadedNormalCandidate


@contextmanager
def assemble_pinned_normal_candidate(
    launch_bytes: bytes,
    request_bytes: bytes,
    *,
    expected_launch_sha256: str,
    expected_request_sha256: str,
) -> Iterator[NormalCandidateAssembly]:
    """Complete source capture/load/recheck before handing code to a caller.

    No public snapshot, owner, alternate-root, loader or callback override.
    Already executed outer modules/interpreter and independent pins still need
    prior trusted launch. No transaction admission or protection of effect inputs.
    """
    parsed = parse_pinned_update_inputs(
        launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256)
    require_current_launch_process(
        parsed.request.launch, expected_launch_sha256=expected_launch_sha256)
    with ExitStack() as loaded_modules:
        with capture_anchored_candidate_sources(
            parsed.request.launch,
            expected_launch_sha256=expected_launch_sha256,
            expected_owner_uid=0,
            expected_owner_gid=0,
        ) as sources:
            loaded = loaded_modules.enter_context(load_pinned_normal_candidate(
                sources.source_snapshot, parsed.launch_bytes, parsed.request_bytes,
                expected_launch_sha256=expected_launch_sha256,
                expected_request_sha256=expected_request_sha256))
        # All source/ancestor exit checks and FD cleanup precede caller entry.
        # Later calls use the already-loaded fixed bytes, never reopened sources.
        yield NormalCandidateAssembly(sources, loaded)
