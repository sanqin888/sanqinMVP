"""C1-PREP-05: decode independently pinned normal-update input bytes.

Pure, bounded JSON-to-existing-v1-types boundary. No file reads, source loader,
platform authentication, effect adapters or launch/production authority.
Expected digests must be fixed through a trusted external path; a caller's
self-supplied matching digest authenticates no source or execution permission.
"""
from __future__ import annotations

from dataclasses import dataclass
import json

from normal_runtime_launch import (
    LaunchMaterials, LaunchMaterialsBlocked, SourcePin, SHA256, canonical, digest,
)
from normal_runtime_update import NormalUpdateBlocked, UpdateRequest

# Covers the existing v1 maximum, including escaped printable subprocess args.
MAX_LAUNCH_BYTES = 1_100_000
MAX_REQUEST_BYTES = 4096


class PinnedInputsBlocked(ValueError):
    pass


def _require(ok: bool, reason: str) -> None:
    if not ok:
        raise PinnedInputsBlocked(reason)


@dataclass(frozen=True)
class PinnedUpdateInputs:
    """Immutable decoded inputs; no evidence-authentication or permit fields."""

    request: UpdateRequest
    launch_bytes: bytes
    request_bytes: bytes


def _check_pin(raw: bytes, expected: str, limit: int) -> None:
    _require(type(raw) is bytes and 0 < len(raw) <= limit,
             "input must be bounded immutable bytes")
    _require(type(expected) is str and SHA256.fullmatch(expected) is not None
             and expected != "0" * 64,
             "invalid independently pinned input digest")
    _require(digest(raw) == expected, "input differs from independently pinned digest")


def _object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        _require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def _integer(token: str) -> int:
    _require(len(token) <= 20, "excessive JSON integer")
    return int(token)


def _reject_number(token: str) -> None:
    raise PinnedInputsBlocked("floating or non-finite JSON number is unsupported")


def _document(raw: bytes) -> dict:
    document = json.loads(
        raw.decode("ascii"), object_pairs_hook=_object,
        parse_int=_integer, parse_float=_reject_number,
        parse_constant=_reject_number,
    )
    _require(type(document) is dict, "input must be one JSON object")
    return document


def _launch(document: dict, raw: bytes) -> LaunchMaterials:
    pins = document["sourceFiles"]
    argvs = document["subprocessArgvs"]
    _require(type(pins) is dict and 3 <= len(pins) <= 64
             and all(type(pin) is dict and set(pin) == {"sha256", "bytes"}
                     for pin in pins.values()),
             "invalid v1 source pin objects")
    _require(type(argvs) is list and len(argvs) <= 16
             and all(type(argv) is list and 1 <= len(argv) <= 32
                     for argv in argvs),
             "invalid v1 subprocess arrays")
    materials = LaunchMaterials(
        document["sourceCommit"], document["transactionId"],
        document["bootstrapSource"],
        tuple(SourcePin(name, pin["sha256"], pin["bytes"])
              for name, pin in sorted(pins.items())),
        tuple(tuple(argv) for argv in argvs),
    )
    # Round-trip ALL existing fields, including derived constants and false flags.
    # Raw canonical equality also distinguishes false/0 and true/1.
    _require(canonical(materials.document()) == raw,
             "launch bytes differ from exact v1 serialization")
    return materials


def _request(document: dict, raw: bytes,
             materials: LaunchMaterials) -> UpdateRequest:
    request = UpdateRequest(
        document["transactionId"],
        document["currentRuntimeSha"], document["targetRuntimeSha"],
        document["currentArchiveDigest"], document["targetArchiveDigest"],
        document["currentAppSha"], document["previousAppSha"],
        document["preservedStateSha256"], materials,
    )
    _require(canonical(request.document()) == raw,
             "request bytes differ from exact v1 serialization or launch binding")
    return request


def parse_pinned_update_inputs(
    launch_bytes: bytes,
    request_bytes: bytes,
    *,
    expected_launch_sha256: str,
    expected_request_sha256: str,
) -> PinnedUpdateInputs:
    """Decode exact canonical v1 bytes after checking BOTH external digests.

    Does not fetch/verify Archive bytes, a publish proof or installed state.
    A valid old Archive digest is still required by UpdateRequest; possession
    of old Archive bytes is not introduced as a prerequisite. No repair,
    fallback/default population, transaction consumption or NormalUpdateFlow run.
    """
    _check_pin(launch_bytes, expected_launch_sha256, MAX_LAUNCH_BYTES)
    _check_pin(request_bytes, expected_request_sha256, MAX_REQUEST_BYTES)
    try:
        materials = _launch(_document(launch_bytes), launch_bytes)
        request = _request(_document(request_bytes), request_bytes, materials)
        return PinnedUpdateInputs(request, launch_bytes, request_bytes)
    except PinnedInputsBlocked:
        raise
    except (LaunchMaterialsBlocked, NormalUpdateBlocked, KeyError,
            ValueError, TypeError, OverflowError, RecursionError) as exc:
        # Fixed public reason; no raw input is interpolated into this message.
        raise PinnedInputsBlocked("invalid pinned v1 update inputs") from exc
