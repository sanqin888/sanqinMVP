#!/usr/bin/env python3
"""R2-A2-3: expendable GitHub-hosted Runner KVM/QEMU/systemd guest capability probe.

NEVER a SanQ maintenance-fence verification. No production connections, secrets,
Docker Engine mutation, persistence contracts, or P0-01 fault injection.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

IMAGE_BASE = "https://cloud-images.ubuntu.com/releases/noble/release/"
IMAGE_NAME = "ubuntu-24.04-server-cloudimg-amd64.img"
IMAGE_MAX_BYTES = 1100 * 1024 * 1024
CHECKSUM_MAX_BYTES = 64 * 1024
BOOT_MARKER = re.compile(r"^SANQ_PROBE_GUEST_BOOT=(\d+) PID1=systemd BOOT_ID=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\r?$", re.M)
EXPECTED_PHASES = ("RUNNER", "KVM", "QEMU", "GUEST_SYSTEMD", "GUEST_RESET")
# This is a capability probe, never a production or A2-3 attestation.
NOT_P0_01 = "NOT_RUN"


class ProbeUnavailable(Exception):
    """Environmental limitation, reported as BLOCKED rather than PASS."""


def read_mem_kib() -> int:
    for line in Path("/proc/meminfo").read_text().splitlines():
        if line.startswith("MemAvailable:"):
            return int(line.split()[1])
    raise ProbeUnavailable("MEMAVAILABLE_UNKNOWN")


def kvm_status(path: str = "/dev/kvm") -> str:
    try:
        metadata = os.stat(path)
        if not stat.S_ISCHR(metadata.st_mode):
            return "NOT_CHAR_DEVICE"
        fd = os.open(path, os.O_RDWR | os.O_CLOEXEC)
        os.close(fd)
        return "ACCESSIBLE"
    except (FileNotFoundError, PermissionError, OSError) as exc:
        return type(exc).__name__.upper()


def checksum_for(checksums: str, filename: str) -> str:
    matches = []
    for line in checksums.splitlines():
        m = re.fullmatch(r"([0-9a-fA-F]{64})\s+\*?(\S+)", line.strip())
        if m and m.group(2).removeprefix("./") == filename:
            matches.append(m.group(1).lower())
    if len(matches) != 1:
        raise ProbeUnavailable("IMAGE_CHECKSUM_MISSING_OR_AMBIGUOUS")
    return matches[0]


def marker_counts(serial: str) -> tuple[int, ...]:
    return tuple(int(count) for count, _ in BOOT_MARKER.findall(serial))


def distinct_guest_boots(serial: str) -> bool:
    events = [(int(count), boot_id) for count, boot_id in BOOT_MARKER.findall(serial)]
    return any(a_count == 1 and b_count == 2 and a_id != b_id
               for a_count, a_id in events for b_count, b_id in events)


def classify_guest(first: bool, second: bool, pid1: bool, *, reset_sent: bool) -> str:
    return "PASS" if (first and second and pid1 and reset_sent) else "BLOCKED"


def restricted_download(url: str, destination: Path, max_bytes: int) -> None:
    if not url.startswith(IMAGE_BASE):
        raise ValueError("UNEXPECTED_DOWNLOAD_ORIGIN")
    try:
        with urllib.request.urlopen(url, timeout=45) as response:
            if response.geturl() != url:
                raise ProbeUnavailable("IMAGE_REDIRECT_UNEXPECTED")
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > max_bytes:
                raise ProbeUnavailable("IMAGE_TOO_LARGE")
            total = 0
            with destination.open("xb") as output:
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        raise ProbeUnavailable("IMAGE_TOO_LARGE")
                    output.write(chunk)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ProbeUnavailable("IMAGE_DOWNLOAD_UNAVAILABLE") from exc


def command(argv: list[str], *, timeout: int = 150) -> str:
    try:
        result = subprocess.run(argv, capture_output=True, text=True, check=False,
                                timeout=timeout, env={**os.environ, "DEBIAN_FRONTEND": "noninteractive"})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProbeUnavailable("COMMAND_UNAVAILABLE_OR_TIMEOUT") from exc
    if result.returncode != 0:
        raise ProbeUnavailable("COMMAND_FAILED:" + Path(argv[0]).name)
    return result.stdout.strip()


def runner_inventory(directory: Path) -> dict:
    system = os.uname()
    stat_disk = shutil.disk_usage(directory)
    data = {
        "runner_os": os.environ.get("RUNNER_OS") == "Linux",
        "arch": system.machine,
        "kernel": system.release,
        "pid1": Path("/proc/1/comm").read_text().strip(),
        "mem_available_kib": read_mem_kib(),
        "free_disk_bytes": stat_disk.free,
        "kvm": kvm_status(),
        "qemu_binary_present": shutil.which("qemu-system-x86_64") is not None,
        "cloud_localds_present": shutil.which("cloud-localds") is not None,
    }
    return data


def write_guest_seed(directory: Path) -> Path:
    # Synthetic only; it creates a serial marker and a guest-only counter.
    init_script = """#!/bin/sh
set -eu
install -d -m 0700 /var/lib/sanq-vm-probe
count=0
if test -f /var/lib/sanq-vm-probe/count; then
  count=$(cat /var/lib/sanq-vm-probe/count)
fi
count=$((count + 1))
printf '%s\\n' "$count" > /var/lib/sanq-vm-probe/count
sync /var/lib/sanq-vm-probe/count
if test "$(cat /proc/1/comm)" = systemd; then
  printf 'SANQ_PROBE_GUEST_BOOT=%s PID1=systemd BOOT_ID=%s\\n' "$count" "$(cat /proc/sys/kernel/random/boot_id)" >/dev/ttyS0
else
  printf 'SANQ_PROBE_GUEST_PID1_UNEXPECTED\\n' >/dev/ttyS0
fi
"""
    unit = """[Unit]
Description=SanQ disposable QEMU capability marker
After=local-fs.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/sanq-vm-probe-boot
[Install]
WantedBy=multi-user.target
"""
    def cloud_indent(value: str) -> str:
        return "\n".join("      " + line for line in value.splitlines())

    userdata = (
        "#cloud-config\n"
        "write_files:\n"
        "  - path: /usr/local/sbin/sanq-vm-probe-boot\n"
        "    owner: root:root\n"
        "    permissions: '0755'\n"
        "    content: |\n" + cloud_indent(init_script) + "\n"
        "  - path: /etc/systemd/system/sanq-vm-probe-boot.service\n"
        "    owner: root:root\n"
        "    permissions: '0644'\n"
        "    content: |\n" + cloud_indent(unit) + "\n"
        "runcmd:\n"
        "  - [systemctl, daemon-reload]\n"
        "  - [systemctl, enable, sanq-vm-probe-boot.service]\n"
        "  - [systemctl, start, sanq-vm-probe-boot.service]\n"
    )
    user = directory / "user-data"
    meta = directory / "meta-data"
    user.write_text(userdata, encoding="utf-8")
    meta.write_text("instance-id: sanq-capability-probe-01\nlocal-hostname: sanq-capability-probe\n",
                    encoding="utf-8")
    seed = directory / "seed.img"
    command(["cloud-localds", str(seed), str(user), str(meta)], timeout=45)
    return seed


def reset_guest(monitor_path: Path) -> None:
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
        conn.settimeout(5)
        conn.connect(str(monitor_path))
        conn.sendall(b"system_reset\n")


def run_guest(directory: Path, deadline_s: int) -> dict:
    image = directory / IMAGE_NAME
    sums = directory / "SHA256SUMS"
    restricted_download(IMAGE_BASE + "SHA256SUMS", sums, CHECKSUM_MAX_BYTES)
    try:
        expected = checksum_for(sums.read_text(encoding="ascii"), IMAGE_NAME)
    except UnicodeError as exc:
        raise ProbeUnavailable("IMAGE_CHECKSUM_ENCODING_INVALID") from exc
    restricted_download(IMAGE_BASE + IMAGE_NAME, image, IMAGE_MAX_BYTES)
    hasher = hashlib.sha256()
    with image.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            hasher.update(chunk)
    if hasher.hexdigest() != expected:
        raise ProbeUnavailable("IMAGE_HASH_MISMATCH")
    image_format = json.loads(command(["qemu-img", "info", "--output=json", str(image)]))
    if image_format.get("format") != "qcow2":
        raise ProbeUnavailable("IMAGE_NOT_QCOW2")
    overlay = directory / "guest-overlay.qcow2"
    command(["qemu-img", "create", "-f", "qcow2", "-F", "qcow2",
             "-b", str(image), str(overlay), "8G"], timeout=30)
    seed = write_guest_seed(directory)
    monitor = directory / "qemu-monitor.sock"
    serial = directory / "guest-serial.log"
    firmware = Path("/usr/share/OVMF/OVMF_CODE_4M.fd")
    vars_template = Path("/usr/share/OVMF/OVMF_VARS_4M.fd")
    if not firmware.is_file() or not vars_template.is_file():
        raise ProbeUnavailable("OVMF_UEFI_FIRMWARE_UNAVAILABLE")
    vars_file = directory / "uefi-vars.fd"
    shutil.copyfile(vars_template, vars_file)
    qemu = [
        "qemu-system-x86_64", "-enable-kvm",
        "-machine", "q35", "-cpu", "host", "-smp", "2", "-m", "2048",
        "-display", "none",
        "-drive", f"if=pflash,format=raw,readonly=on,file={firmware}",
        "-drive", f"if=pflash,format=raw,file={vars_file}",
        "-drive", f"if=virtio,format=qcow2,file={overlay}",
        "-drive", f"if=virtio,format=raw,file={seed},readonly=on",
        "-nic", "none",
        "-serial", f"file:{serial}",
        "-monitor", f"unix:{monitor},server,nowait",
    ]
    try:
        error_log = directory / "qemu-stderr.log"
        with error_log.open("w", encoding="utf-8") as stderr_stream:
            proc = subprocess.Popen(qemu, stdout=subprocess.DEVNULL, stderr=stderr_stream)
    except OSError as exc:
        raise ProbeUnavailable("QEMU_START_UNAVAILABLE") from exc
    start = time.monotonic()
    reset_sent = False
    first_seen = False
    second_seen = False
    try:
        while time.monotonic() - start < deadline_s:
            if proc.poll() is not None:
                raise ProbeUnavailable("QEMU_EXITED_BEFORE_SECOND_BOOT")
            log = serial.read_text(encoding="utf-8", errors="replace") if serial.exists() else ""
            counts = marker_counts(log)
            if 1 in counts:
                first_seen = True
            if first_seen and not reset_sent:
                if monitor.exists():
                    try:
                        reset_guest(monitor)
                    except OSError as exc:
                        raise ProbeUnavailable("QEMU_MONITOR_UNAVAILABLE") from exc
                    reset_sent = True
            if reset_sent and 2 in counts and distinct_guest_boots(log):
                second_seen = True
                break
            time.sleep(2)
        if not second_seen:
            raise ProbeUnavailable("GUEST_SYSTEMD_REBOOT_TIMEOUT")
        return {
            "result": classify_guest(first_seen, second_seen, True, reset_sent=reset_sent),
            "guest_boot_count": 2,
            "reset_sent": reset_sent,
            "image_sha256": expected,
            "image_source": IMAGE_BASE + IMAGE_NAME,
            "guest_network": "none",
            "guest_systemd": True,
        }
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)


def run_probe(directory: Path, deadline_s: int) -> dict:
    report = {
        "schema": "sanq.runtime.github-runner-capability.v1",
        "p0_01": NOT_P0_01,
        "same_version_as_production": "NOT_VERIFIED",
        "capability": "BLOCKED",
        "phases": {phase: "NOT_RUN" for phase in EXPECTED_PHASES},
    }
    try:
        if (os.environ.get("GITHUB_ACTIONS") != "true"
                or os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted"
                or os.environ.get("GITHUB_EVENT_NAME") != "pull_request"
                or os.environ.get("GITHUB_REPOSITORY") != "sanqin888/sanqinMVP"):
            raise ProbeUnavailable("GITHUB_HOSTED_SAME_REPO_PR_REQUIRED")
        report["runner"] = runner_inventory(directory)
        report["phases"]["RUNNER"] = "PASS"
        if report["runner"]["kvm"] != "ACCESSIBLE":
            raise ProbeUnavailable("KVM_UNAVAILABLE")
        if report["runner"]["arch"] != "x86_64":
            raise ProbeUnavailable("ARCH_UNSUPPORTED")
        if report["runner"]["mem_available_kib"] < 4 * 1024 * 1024:
            raise ProbeUnavailable("INSUFFICIENT_MEMORY")
        if report["runner"]["free_disk_bytes"] < 5 * 1024 ** 3:
            raise ProbeUnavailable("INSUFFICIENT_DISK")
        report["phases"]["KVM"] = "PASS"

        if (shutil.which("qemu-system-x86_64") is None or shutil.which("cloud-localds") is None
                or not Path("/usr/share/OVMF/OVMF_CODE_4M.fd").exists()
                or not Path("/usr/share/OVMF/OVMF_VARS_4M.fd").exists()):
            command(["sudo", "-n", "apt-get", "update", "-qq"], timeout=180)
            command(["sudo", "-n", "apt-get", "install", "-y", "-qq",
                     "--no-install-recommends", "qemu-system-x86", "qemu-utils",
                     "cloud-image-utils", "ovmf"], timeout=280)
        report["qemu_version"] = command(["qemu-system-x86_64", "--version"], timeout=15).splitlines()[0]
        report["phases"]["QEMU"] = "PASS"
        report["phases"]["GUEST_SYSTEMD"] = "ATTEMPTED"
        guest = run_guest(directory, deadline_s)
        if (guest.get("result") != "PASS" or guest.get("guest_network") != "none"
                or guest.get("guest_systemd") is not True
                or guest.get("reset_sent") is not True):
            raise ProbeUnavailable("GUEST_EVIDENCE_INCOMPLETE")
        report["guest"] = guest
        report["phases"]["GUEST_SYSTEMD"] = "PASS"
        report["phases"]["GUEST_RESET"] = "PASS"
        report["capability"] = "GUEST_RESET_PASS_SCOPE_ONLY"
    except ProbeUnavailable as exc:
        report["reason"] = str(exc)
        if report["phases"]["GUEST_SYSTEMD"] == "ATTEMPTED":
            report["phases"]["GUEST_SYSTEMD"] = "BLOCKED"
    return report


def write_summary(report: dict) -> None:
    summary = [
        "### R2-A2-3 GitHub Runner capability probe",
        "",
        f"- Capability verdict: **{report['capability']}**",
        "- P0-01 real Docker boot barrier: **NOT_RUN**",
        "- Production Docker/systemd version match: **NOT_VERIFIED**",
    ]
    for name, value in report["phases"].items():
        summary.append(f"- {name}: {value}")
    if reason := report.get("reason"):
        summary.append(f"- Blocker: {reason}")
    summary.append("- Guest isolated from network; synthetic serial marker only; no SanQ production data.")
    summary.append("- Job success is NOT a claim that the VM capability or S03 passed.")
    rendered = "\n".join(summary) + "\n"
    print(rendered)
    if dest := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(dest, "a", encoding="utf-8") as out:
            out.write(rendered)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--guest-timeout", type=int, default=460)
    args = parser.parse_args()
    if not 30 <= args.guest_timeout <= 600:
        parser.error("guest timeout outside 30..600 seconds")
    directory = args.output_dir.resolve()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    report_path = directory / "report.json"
    report = run_probe(directory, args.guest_timeout)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_summary(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
