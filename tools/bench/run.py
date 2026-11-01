import argparse
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
from pathlib import Path

import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / "out"
TEXT = OUT / "text.txt"
WARMUP = 45
PAUSE = 20
SAMPLE_SECONDS = 1
MAC = platform.system() == "Darwin"
MAC_OFFICE_PYTHON = "/Applications/LibreOffice.app/Contents/Resources/python"
LINUX_BATTERY = Path("/sys/class/power_supply/BAT0")
MIN_LINE = 60


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
    TEXT.write_text("\n".join(lines), encoding="utf-8")


def phases(seconds):
    secs = str(seconds)
    text = str(TEXT)
    browser = ["node", str(HERE / "type-browser.mjs")]
    office_python = MAC_OFFICE_PYTHON if MAC else sys.executable
    return {
        "idle": Phase(None),
        "chromium": Phase(browser + ["chromium", secs, text]),
        "firefox": Phase(browser + ["firefox", secs, text]),
        "chromium-blank": Phase(browser + ["chromium", secs, text, "blank"]),
        "firefox-blank": Phase(browser + ["firefox", secs, text, "blank"]),
        "writer": Phase([office_python, str(HERE / "type-writer.py"), secs, text]),
        "word": Phase(
            ["osascript", str(HERE / "type-word.applescript"), secs, text],
            ("Microsoft Word",),
        ),
    }


def signed(value):
    return value - (1 << 64) if value >= 1 << 63 else value


def battery_watts():
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


def on_battery():
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
            return
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
        return {"t": time.time(), "cpu_w": cpu_mw / 1000, "gpu_w": gpu_mw / 1000}

    def stop(self):
        if self.process:
            subprocess.run(["sudo", "-n", "kill", str(self.process.pid)])

    def mean(self, key, since):
        values = [s[key] for s in self.samples if s["t"] >= since]
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
    return found


def record_cpu(processes, seen):
    for process in processes:
        try:
            times = process.cpu_times()
            seen[process.pid] = times.user + times.system
        except psutil.Error:
            continue
    return sum(seen.values())


def memory_mb(processes):
    total = 0
    for process in processes:
        try:
            total += process.memory_full_info().uss
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
    steady = [w for t, w in watts if t >= WARMUP]
    span = cpu_end[0] - cpu_start[0] if cpu_start else 0
    return {
        "phase": name,
        "system_w": round(statistics.mean(steady), 2) if steady else None,
        "cpu_share": round((cpu_end[1] - cpu_start[1]) / span, 3) if span else None,
        "memory_mb": memory,
        "steady_from": started + WARMUP,
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
    metrics.start()
    log = OUT / time.strftime("results-%Y%m%d-%H%M%S.jsonl")
    try:
        for name in args.phases:
            result = measure(name, table[name], args.seconds, args.plugged)
            result["cpu_w"] = metrics.mean("cpu_w", result["steady_from"])
            result["gpu_w"] = metrics.mean("gpu_w", result["steady_from"])
            del result["steady_from"]
            with log.open("a", encoding="utf-8") as out:
                out.write(json.dumps(result, ensure_ascii=False) + "\n")
            print(json.dumps(result, ensure_ascii=False), flush=True)
            time.sleep(PAUSE)
    finally:
        metrics.stop()
    print("saved", log)


main()
