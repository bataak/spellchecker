import argparse
import ctypes
import json
import platform
import plistlib
import re
import statistics
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import timezone
from pathlib import Path

import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / "out"
TEXT = OUT / "text.txt"
WARMUP = 45
PAUSE = 20
SAMPLE_SECONDS = 1
SETTLE_SECONDS = 5
MAC = platform.system() == "Darwin"
WINDOWS = platform.system() == "Windows"
MAC_OFFICE_PYTHON = "/Applications/LibreOffice.app/Contents/Resources/python"
WINDOWS_OFFICE_PYTHON = r"C:\Program Files\LibreOffice\program\python.exe"
LINUX_BATTERY = Path("/sys/class/power_supply/BAT0")
MIN_LINE = 60
LIBPROC = ctypes.CDLL("/usr/lib/libproc.dylib") if MAC else None
RUSAGE_INFO_V0 = 0
RUSAGE_WORDS = 11
PHYS_FOOTPRINT = 9

if WINDOWS:
    import win32com.client

    WMI = win32com.client.GetObject(r"winmgmts:root\wmi")


@dataclass(frozen=True)
class Phase:
    command: list[str] | None
    names: tuple[str, ...] = ()


def build_text():
    lines = []
    for page in sorted((ROOT / "help" / "zaavar").glob("*.md")):
        body = page.read_text(encoding="utf-8").split("---", 2)[2]
        body = re.sub(r"```.*?```", "", body, flags=re.S)
        for raw in body.splitlines():
            line = re.sub(r"!\[[^\]]*\]\([^)]*\)|\{[^}]*\}|`[^`]*`", "", raw)
            line = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)
            line = re.sub(r"^[#>\-\d.\s|*]+", "", line).replace("**", "").strip()
            if len(line) > MIN_LINE and "|" not in line and re.search("[а-яө]", line):
                lines.append(line)
    OUT.mkdir(exist_ok=True)
    TEXT.write_text("\n".join(lines), encoding="utf-8", newline="\n")


def office_python():
    if MAC:
        return MAC_OFFICE_PYTHON
    return WINDOWS_OFFICE_PYTHON if WINDOWS else sys.executable


def word_phase(secs, text):
    if WINDOWS:
        return Phase(
            [sys.executable, str(HERE / "type-word.py"), secs, text],
            ("WINWORD.EXE",),
        )
    return Phase(
        ["osascript", str(HERE / "type-word.applescript"), secs, text],
        ("Microsoft Word",),
    )


def phases(seconds):
    secs = str(seconds)
    text = str(TEXT)
    browser = ["node", str(HERE / "type-browser.mjs")]
    return {
        "idle": Phase(None),
        "chromium": Phase(browser + ["chromium", secs, text]),
        "firefox": Phase(browser + ["firefox", secs, text]),
        "chromium-blank": Phase(browser + ["chromium", secs, text, "blank"]),
        "firefox-blank": Phase(browser + ["firefox", secs, text, "blank"]),
        "writer": Phase(
            [office_python(), str(HERE / "type-writer.py"), secs, text],
            ("soffice.exe", "soffice.bin") if WINDOWS else (),
        ),
        "word": word_phase(secs, text),
    }


def signed(value):
    return value - (1 << 64) if value >= 1 << 63 else value


def battery_watts():
    if WINDOWS:
        return sum(b.DischargeRate for b in WMI.InstancesOf("BatteryStatus")) / 1000
    if MAC:
        info = subprocess.run(
            ["ioreg", "-rw0", "-c", "AppleSmartBattery"],
            capture_output=True,
            text=True,
        ).stdout
        amps = signed(int(re.search(r'"InstantAmperage" = (\d+)', info)[1]))
        volts = int(re.search(r'"Voltage" = (\d+)', info)[1])
        return -amps * volts / 1e6
    power = LINUX_BATTERY / "power_now"
    if power.exists():
        return int(power.read_text()) / 1e6
    amps = int((LINUX_BATTERY / "current_now").read_text())
    return amps * int((LINUX_BATTERY / "voltage_now").read_text()) / 1e12


def has_battery():
    if WINDOWS:
        return psutil.sensors_battery() is not None
    if MAC:
        return "InternalBattery" in subprocess.run(
            ["pmset", "-g", "batt"], capture_output=True, text=True
        ).stdout
    return LINUX_BATTERY.exists()


def on_battery():
    if WINDOWS:
        battery = psutil.sensors_battery()
        return battery is not None and battery.power_plugged is False
    if MAC:
        return "Battery Power" in subprocess.run(
            ["pmset", "-g", "batt"], capture_output=True, text=True
        ).stdout
    return (LINUX_BATTERY / "status").read_text().strip() == "Discharging"


@dataclass
class PowerMetrics:
    samples: list[dict] = field(default_factory=list)
    process: subprocess.Popen | None = None

    def start(self):
        if not MAC or subprocess.run(["sudo", "-n", "true"]).returncode:
            return False
        self.process = subprocess.Popen(
            [
                "sudo",
                "-n",
                "powermetrics",
                "-i",
                str(SAMPLE_SECONDS * 1000),
                "--samplers",
                "cpu_power,gpu_power",
                "-f",
                "plist",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        threading.Thread(target=self.read, daemon=True).start()
        return True

    def read(self):
        buffer = b""
        for chunk in iter(lambda: self.process.stdout.read(4096), b""):
            buffer += chunk
            *done, buffer = buffer.split(b"\0")
            for block in done:
                if block.strip():
                    self.samples.append(self.parse(plistlib.loads(block.strip())))

    @staticmethod
    def parse(plist):
        cpu = plist.get("processor", {})
        gpu = plist.get("gpu", {})
        cpu_mw = cpu.get("cpu_power", cpu.get("package_watts", 0) * 1000)
        gpu_mw = cpu.get("gpu_power", gpu.get("gpu_energy", 0))
        combined_mw = cpu.get("combined_power", cpu_mw + gpu_mw)
        taken = plist["timestamp"].replace(tzinfo=timezone.utc).timestamp()
        return {
            "t": taken,
            "cpu_w": cpu_mw / 1000,
            "gpu_w": gpu_mw / 1000,
            "combined_w": combined_mw / 1000,
        }

    def stop(self):
        if self.process:
            subprocess.run(["sudo", "-n", "kill", str(self.process.pid)])

    def settle(self, until):
        deadline = time.time() + SETTLE_SECONDS
        while self.process and time.time() < deadline:
            if self.samples and self.samples[-1]["t"] >= until:
                return
            time.sleep(SAMPLE_SECONDS)

    def between(self, since, until):
        return [s for s in self.samples if since <= s["t"] <= until]

    def mean(self, key, since, until):
        values = [s[key] for s in self.between(since, until)]
        return round(statistics.mean(values), 2) if values else None


def tracked(root, names):
    found = []
    if root is not None:
        try:
            found = psutil.Process(root.pid).children(recursive=True)
        except psutil.NoSuchProcess:
            found = []
    if names:
        found += [p for p in psutil.process_iter(["name"]) if p.info["name"] in names]
    return list({p.pid: p for p in found}.values())


def record_cpu(processes, seen):
    for process in processes:
        try:
            times = process.cpu_times()
            seen[process.pid] = times.user + times.system
        except psutil.Error:
            continue
    return sum(seen.values())


def process_memory(process):
    if not MAC:
        return process.memory_full_info().uss
    info = (ctypes.c_uint64 * RUSAGE_WORDS)()
    if LIBPROC.proc_pid_rusage(process.pid, RUSAGE_INFO_V0, info):
        raise psutil.NoSuchProcess(process.pid)
    return info[PHYS_FOOTPRINT]


def memory_mb(processes):
    total = 0
    for process in processes:
        try:
            total += process_memory(process)
        except psutil.Error:
            continue
    return round(total / 2**20)


def measure(name, phase, seconds, plugged):
    child = (
        subprocess.Popen(phase.command, stdout=subprocess.PIPE, text=True)
        if phase.command
        else None
    )
    started = time.time()
    end = started + seconds + 12
    watts = []
    cpu_start = None
    cpu_end = None
    seen = {}
    memory = 0
    while (child.poll() is None) if child else time.time() < end:
        if not plugged and not on_battery():
            raise SystemExit("stopped: the laptop is not on battery")
        elapsed = time.time() - started
        if not plugged:
            watts.append((elapsed, battery_watts()))
        processes = tracked(child, phase.names)
        total = record_cpu(processes, seen)
        if elapsed >= WARMUP and cpu_start is None:
            cpu_start = (time.time(), total)
        memory = max(memory, memory_mb(processes))
        cpu_end = (time.time(), total)
        time.sleep(SAMPLE_SECONDS)
    if child and child.returncode:
        raise SystemExit(f"stopped: {name} exited with {child.returncode}")
    steady = [w for t, w in watts if t >= WARMUP]
    span = cpu_end[0] - cpu_start[0] if cpu_start else 0
    return {
        "phase": name,
        "system_w": round(statistics.mean(steady), 2) if steady else None,
        "cpu_share": round((cpu_end[1] - cpu_start[1]) / span, 3) if span else None,
        "memory_mb": memory,
        "steady_from": started + WARMUP,
        "steady_to": time.time(),
        "output": child.stdout.read().strip() if child else "",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seconds", type=int, default=240)
    parser.add_argument("--plugged", action="store_true")
    parser.add_argument("phases", nargs="+")
    args = parser.parse_args()
    table = phases(args.seconds)
    unknown = [p for p in args.phases if p not in table]
    if unknown:
        raise SystemExit("unknown phases: " + ", ".join(unknown))
    build_text()
    metrics = PowerMetrics()
    measured = metrics.start()
    plugged = args.plugged or not has_battery()
    if plugged and not measured and not args.plugged:
        raise SystemExit("no battery: run `sudo -v` so powermetrics can measure power")
    log = OUT / time.strftime("results-%Y%m%d-%H%M%S.jsonl")
    try:
        for name in args.phases:
            result = measure(name, table[name], args.seconds, plugged)
            since = result.pop("steady_from")
            until = result.pop("steady_to")
            metrics.settle(until)
            for key in ("cpu_w", "gpu_w", "combined_w"):
                result[key] = metrics.mean(key, since, until)
            result["power_samples"] = len(metrics.between(since, until))
            with log.open("a", encoding="utf-8") as out:
                out.write(json.dumps(result, ensure_ascii=False) + "\n")
            print(json.dumps(result, ensure_ascii=False), flush=True)
            time.sleep(PAUSE)
    finally:
        metrics.stop()
    print("saved", log)


main()
