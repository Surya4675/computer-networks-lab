"""Allow-listed, cross-platform execution of real diagnostic commands.

Only the commands registered in :data:`REGISTRY` can ever run. Arguments are
validated with strict patterns, the operating system is invoked through
``subprocess.run`` **without** a shell, and every call is bounded by a timeout.
Nothing outside this module is reachable from the web API, which keeps the
host safe while still returning genuine output from the machine NetLab runs on.
"""

from __future__ import annotations

import platform
import re
import shlex
import shutil
import socket
import subprocess
from dataclasses import dataclass
from typing import Callable, Iterable, Optional
from urllib.parse import urlparse

IS_WINDOWS = platform.system().lower().startswith("win")

DEFAULT_TIMEOUT = 20
MAX_OUTPUT = 20000

_HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$")


class CommandError(Exception):
    """Raised when a command is unknown or its arguments are invalid."""


# --------------------------------------------------------------------------- #
# Argument validation helpers
# --------------------------------------------------------------------------- #
def _host(value: str) -> str:
    """Return a validated host name or IP address."""
    value = (value or "").strip()
    if not _HOST_RE.match(value):
        raise CommandError("Enter a valid host name or IP address.")
    return value


def _count(value: str, low: int = 1, high: int = 10, default: int = 4) -> int:
    if value is None or value == "":
        return default
    if not value.isdigit():
        raise CommandError(f"Count must be a whole number between {low} and {high}.")
    number = int(value)
    if not low <= number <= high:
        raise CommandError(f"Count must be between {low} and {high}.")
    return number


def _url(value: str) -> str:
    value = (value or "").strip()
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise CommandError("Only absolute http:// or https:// URLs are allowed.")
    if parsed.username or parsed.password:
        raise CommandError("Credentials in the URL are not allowed.")
    return value


def _first_available(candidates: Iterable[str]) -> Optional[str]:
    for candidate in candidates:
        if shutil.which(candidate):
            return candidate
    return None


# --------------------------------------------------------------------------- #
# Per-command argument builders (validate first, then return an argv list)
# --------------------------------------------------------------------------- #
def _build_ping(args: list[str]) -> list[str]:
    if not args or len(args) > 2:
        raise CommandError("Usage: ping <host> [count]")
    host = _host(args[0])
    count = _count(args[1] if len(args) > 1 else "")
    if IS_WINDOWS:
        return ["ping", "-n", str(count), host]
    return ["ping", "-c", str(count), "-W", "2", host]


def _build_ipconfig(args: list[str]) -> list[str]:
    if args:
        raise CommandError("Usage: ipconfig")
    if IS_WINDOWS:
        return ["ipconfig", "/all"]
    exe = _first_available(["ip", "ifconfig"])
    if not exe:
        raise CommandError("Neither 'ip' nor 'ifconfig' is available on this server.")
    return [exe, "addr"] if exe == "ip" else [exe, "-a"]


def _build_tracert(args: list[str]) -> list[str]:
    if not args or len(args) > 2:
        raise CommandError("Usage: tracert <host> [max-hops]")
    host = _host(args[0])
    hops = _count(args[1] if len(args) > 1 else "", low=1, high=30, default=8)
    if IS_WINDOWS:
        return ["tracert", "-d", "-h", str(hops), host]
    exe = _first_available(["traceroute", "tracepath"])
    if not exe:
        raise CommandError("'traceroute' is not installed on this server.")
    if exe == "traceroute":
        return [exe, "-n", "-m", str(hops), host]
    return [exe, "-m", str(hops), host]


def _build_nslookup(args: list[str]) -> list[str]:
    if len(args) != 1:
        raise CommandError("Usage: nslookup <domain>")
    host = _host(args[0])
    exe = _first_available(["nslookup", "host", "dig"])
    if not exe:
        raise CommandError("No DNS lookup tool is available on this server.")
    if exe == "dig":
        return ["dig", "+short", host]
    return [exe, host]


def _build_arp(args: list[str]) -> list[str]:
    if args != ["-a"]:
        raise CommandError("Usage: arp -a")
    if IS_WINDOWS:
        return ["arp", "-a"]
    exe = _first_available(["arp", "ip"])
    if not exe:
        raise CommandError("No ARP tool is available on this server.")
    return [exe, "-a"] if exe == "arp" else [exe, "neigh"]


def _build_route(args: list[str]) -> list[str]:
    if args != ["print"]:
        raise CommandError("Usage: route print")
    if IS_WINDOWS:
        return ["route", "print"]
    exe = _first_available(["ip", "route"])
    if not exe:
        raise CommandError("No route tool is available on this server.")
    return [exe, "route"] if exe == "ip" else [exe, "-n"]


def _build_netstat(args: list[str]) -> list[str]:
    if args:
        raise CommandError("Usage: netstat")
    if IS_WINDOWS:
        return ["netstat", "-an"]
    exe = _first_available(["ss", "netstat"])
    if not exe:
        raise CommandError("No socket listing tool is available on this server.")
    return [exe, "-tuna"] if exe == "ss" else [exe, "-an"]


def _build_curl(args: list[str]) -> list[str]:
    if len(args) != 1:
        raise CommandError("Usage: curl <http(s)://url>")
    url = _url(args[0])
    exe = _first_available(["curl"])
    if not exe:
        raise CommandError("'curl' is not installed on this server.")
    return [exe, "-sS", "--max-time", "20", "--", url]


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Command:
    name: str
    usage: str
    summary: str
    category: str
    builder: Callable[[list[str]], list[str]]
    timeout: int = DEFAULT_TIMEOUT


REGISTRY: dict[str, Command] = {
    command.name: command
    for command in (
        Command("ping", "ping <host> [count]", "Send ICMP echo requests to a host.", "Connectivity", _build_ping, 25),
        Command("ipconfig", "ipconfig", "Show this server's IP configuration.", "Configuration", _build_ipconfig),
        Command("tracert", "tracert <host> [max-hops]", "Trace the route to a host.", "Routing", _build_tracert, 40),
        Command("nslookup", "nslookup <domain>", "Resolve a domain name with DNS.", "DNS", _build_nslookup),
        Command("arp", "arp -a", "Show the ARP / neighbour cache.", "Data link", _build_arp),
        Command("route", "route print", "Print the kernel routing table.", "Routing", _build_route),
        Command("netstat", "netstat", "List active socket connections.", "Transport", _build_netstat),
        Command("curl", "curl <http(s)://url>", "Fetch a URL over HTTP(S).", "Application", _build_curl, 30),
    )
}

DISABLED: dict[str, str] = {
    "dhcp": (
        "'dhcp renew' would reconfigure this server's own network interface; it is "
        "disabled so a shared host is never disrupted. Use your operating system's "
        "network settings to renew a real lease."
    ),
}


def _render(argv: list[str]) -> str:
    try:
        return shlex.join(argv)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return " ".join(argv)


def parse(raw: str) -> list[str]:
    """Split a raw command line, raising :class:`CommandError` on bad quoting."""
    try:
        return shlex.split(raw or "")
    except ValueError:
        raise CommandError("Could not parse the command; check the quotation marks.")


def help_text() -> str:
    lines = ["REAL DIAGNOSTIC COMMANDS (executed on the NetLab host)", ""]
    for command in REGISTRY.values():
        lines.append(f"  {command.usage:<34}{command.summary}")
    lines.extend(
        [
            "  help                              Show this list",
            "",
            "Commands run for real on the machine hosting NetLab. Output, timing and",
            "reachability reflect this host's network — not a simulation.",
        ]
    )
    return "\n".join(lines)


def list_commands() -> list[dict]:
    """Describe the allow-list for the user interface."""
    return [
        {
            "name": command.name,
            "usage": command.usage,
            "summary": command.summary,
            "category": command.category,
        }
        for command in REGISTRY.values()
    ]


def host_info() -> dict:
    return {
        "hostname": socket.gethostname(),
        "os": platform.system(),
        "release": platform.release(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "shell": "powershell" if IS_WINDOWS else "posix",
    }


def execute(name: str, args: list[str]) -> dict:
    """Run one allow-listed command and capture its real output."""
    key = (name or "").strip().lower()
    command = REGISTRY.get(key)
    if command is None:
        if key in DISABLED:
            raise CommandError(DISABLED[key])
        raise CommandError(f"'{name}' is not an allowed command. Type 'help' to see the list.")
    argv = command.builder(list(args or []))
    if shutil.which(argv[0]) is None:
        return {
            "ok": False,
            "command": _render(argv),
            "output": "",
            "error": f"'{argv[0]}' is not available on this server.",
            "returncode": None,
        }
    try:
        completed = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=command.timeout,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "command": _render(argv),
            "output": "",
            "error": f"Command exceeded the {command.timeout}s time limit.",
            "returncode": None,
        }
    except OSError as exc:
        return {
            "ok": False,
            "command": _render(argv),
            "output": "",
            "error": str(exc),
            "returncode": None,
        }
    output = ((completed.stdout or "") + (completed.stderr or "")).strip()
    if len(output) > MAX_OUTPUT:
        output = output[:MAX_OUTPUT] + "\n… output truncated …"
    return {
        "ok": completed.returncode == 0,
        "command": _render(argv),
        "output": output,
        "error": "" if completed.returncode == 0 else f"Command exited with code {completed.returncode}.",
        "returncode": completed.returncode,
    }


def run(raw: str) -> dict:
    """Parse and execute a raw command line, returning a JSON-ready result."""
    parts = parse(raw)
    if not parts:
        raise CommandError("Enter a command.")
    name = parts[0].lower()
    if name in ("help", "?"):
        return {"ok": True, "command": "help", "output": help_text(), "error": "", "returncode": 0}
    return execute(name, parts[1:])
