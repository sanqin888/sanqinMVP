"""F4-B8 first local v2 consumption and owned abort; never a finalizer."""
from contextlib import contextmanager
import os
import secrets
import threading

import normal_runtime_history_review as history
import normal_runtime_local_admission as local
from normal_runtime_inputs import parse_pinned_update_inputs
from normal_runtime_launch import canonical, digest


class _Attempt:
    def __init__(self, legacy, tree, device, edges, stack, claim):
        self.legacy, self.tree, self.device = legacy, tree, device
        self.edges, self.stack, self.claim = edges, stack, claim
        self.owner = (os.getpid(), threading.get_ident())
        self.legacy_key = local._key(os.fstat(legacy))
        self.rows = {}
        self.live, self.abort_attempted = True, False

    def __reduce_ex__(self, protocol):
        raise TypeError("v2 attempt cannot be serialized")

    def _check(self):
        local._require(self.live and self.owner == (os.getpid(), threading.get_ident()),
                       "v2 handle closed or owned by another process/thread")
        self.edges()
        local._require(local._key(os.fstat(self.legacy)) == self.legacy_key
                       and not history._names(self.legacy, 3), "legacy ledger changed")
        local._require(history._names(self.tree, history._MAX_EVENTS) == set(self.rows),
                       "unexpected v2 history contents")
        for name, (fd, key, raw) in self.rows.items():
            local._entry(self.tree, name, fd, key, self.device)
            local._require(os.pread(fd, history._MAX_BYTES + 1, 0) == raw,
                           "held v2 bytes changed")

    def _append(self, kind, payload):
        self._check()
        raws = [row[2] for row in self.rows.values()]
        local._require((kind == "CLAIM" and not raws)
                       or (kind == "ABORT_OBSERVATION" and len(raws) == 1),
                       "restricted writer cannot append this event")
        event = {"schema": history._SCHEMA, "sequence": len(raws) + 1,
                 "previousSha256": digest(raws[-1]) if raws else "0" * 64,
                 "kind": kind, "transactionId": self.claim["transactionId"],
                 "attemptId": self.claim["attemptId"],
                 "requestSha256": self.claim["requestSha256"],
                 "launchMaterialsSha256": self.claim["launchMaterialsSha256"],
                 "claimSha256": digest(canonical(self.claim)), "payload": payload}
        raw = canonical(event)
        local._require(0 < len(raw) <= history._MAX_BYTES and len(raws) < 2,
                       "restricted v2 event budget exceeded")
        history._interpret(raws + [raw])
        name = f"{len(raws) + 1:08d}.json"
        self.rows[name] = local._write(self.tree, name, raw, self.device, self.stack)
        self._check()
        return digest(raw)

    def observation(self):
        self._check()
        return history._report(status="LOCAL_V2_ATTEMPT_HELD_UNRESOLVED",
            transactionId=self.claim["transactionId"], attemptId=self.claim["attemptId"],
            requestSha256=self.claim["requestSha256"], localConsumptionRecorded=True)

    def record_abort(self, receipt_bytes, *, attempt_id):
        self._check()
        local._require(type(attempt_id) is str and attempt_id == self.claim["attemptId"],
                       "abort belongs to another v2 attempt")
        receipt = local._abort_receipt(receipt_bytes, self.claim)
        local._require(not self.abort_attempted, "v2 abort already attempted")
        self.abort_attempted = True
        return self._append("ABORT_OBSERVATION",
                            {"receipt": receipt, "receiptSha256": digest(receipt_bytes)})


@contextmanager
def consume_v2_local_attempt(launch_bytes, request_bytes, *,
                             expected_launch_sha256, expected_request_sha256):
    """Consume EMPTY layouts once and hold lock through caller scope.

    No source/platform/current/target/R2 authentication, Flow, disposition,
    next-tx, replay, arbitrary public append or caller permit API.
    """
    parsed = parse_pinned_update_inputs(launch_bytes, request_bytes,
        expected_launch_sha256=expected_launch_sha256,
        expected_request_sha256=expected_request_sha256)
    request = parsed.request.document()
    with history._layout_scope() as (legacy, tree, device, edges, stack):
        local._require(not history._names(legacy, 3)
                       and not history._names(tree, history._MAX_EVENTS),
                       "v1 or v2 history already consumed or unresolved")
        claim = {"schema": local._CLAIM_SCHEMA, "phase": "UNRESOLVED_LOCAL_CONSUMPTION",
                 "transactionId": request["transactionId"], "attemptId": secrets.token_hex(32),
                 "requestSha256": digest(request_bytes),
                 "launchMaterialsSha256": digest(launch_bytes),
                 **{name: request[name] for name in local._BINDINGS}}
        handle = _Attempt(legacy, tree, device, edges, stack, claim)
        try:
            handle._append("CLAIM", claim)
            yield handle
            handle._check()
        finally:
            handle.live = False
        # Every created event survives; no cleanup/restore/finalize.
