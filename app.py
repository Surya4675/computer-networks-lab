"""NetLab — interactive computer networks lab.

The command console executes real, allow-listed diagnostics on the machine that
hosts this application (see :mod:`executor`). The LAN / protocol modules remain
deliberate teaching models so learners can explore concepts that cannot safely
be exercised on a shared host.
"""

from __future__ import annotations

import ipaddress
import os
import threading
from datetime import datetime

from flask import Flask, jsonify, render_template, request

import executor

app = Flask(__name__)

# The LAN teaching model is process-local; a single worker (see the Procfile)
# plus this lock keeps concurrent requests consistent.
STATE_LOCK = threading.Lock()


def default_state() -> dict:
    return {
        "hosts": {
            "PC1": {"ip": "192.168.1.10", "mask": "255.255.255.0", "mac": "02:00:00:00:01:10", "online": True, "kind": "workstation"},
            "PC2": {"ip": "192.168.1.11", "mask": "255.255.255.0", "mac": "02:00:00:00:01:11", "online": True, "kind": "workstation"},
            "Router": {"ip": "192.168.1.1", "mask": "255.255.255.0", "mac": "02:00:00:00:01:01", "online": True, "kind": "router"},
            "Server": {"ip": "192.168.1.100", "mask": "255.255.255.0", "mac": "02:00:00:00:01:64", "online": True, "kind": "server"},
        },
        "server_running": True,
        "server_port": 8080,
        "dns_running": True,
        "dhcp_pool_start": "192.168.1.50",
        "leases": {},
    }


STATE = default_state()


@app.after_request
def add_cache_headers(response):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@app.get("/")
def index():
    return render_template("index.html")


# --------------------------------------------------------------------------- #
# Real command execution
# --------------------------------------------------------------------------- #
@app.get("/api/host")
def host_api():
    return jsonify(executor.host_info())


@app.get("/api/commands")
def commands_api():
    return jsonify({"commands": executor.list_commands()})


@app.post("/api/execute")
@app.post("/api/command")
def execute_api():
    payload = request.get_json(silent=True) or {}
    raw = str(payload.get("command", ""))
    try:
        result = executor.run(raw)
    except executor.CommandError as exc:
        return jsonify({"ok": False, "command": raw, "output": str(exc), "error": str(exc), "returncode": None}), 400
    return jsonify(result)


# --------------------------------------------------------------------------- #
# LAN teaching model (conceptual, not executed on the host)
# --------------------------------------------------------------------------- #
@app.get("/api/state")
def get_state():
    with STATE_LOCK:
        return jsonify({key: value for key, value in STATE.items()})


@app.post("/api/device")
def update_device():
    payload = request.get_json(silent=True) or {}
    device = str(payload.get("device", ""))
    field = str(payload.get("field", ""))
    value = payload.get("value")
    with STATE_LOCK:
        if device not in STATE["hosts"]:
            return jsonify({"ok": False, "message": "Unknown device."}), 400
        host = STATE["hosts"][device]
        if field == "ip":
            try:
                parsed = ipaddress.ip_address(str(value))
            except ValueError:
                return jsonify({"ok": False, "message": "Enter a valid IPv4 address."}), 400
            if not isinstance(parsed, ipaddress.IPv4Address):
                return jsonify({"ok": False, "message": "This model currently supports IPv4 only."}), 400
            ip = str(parsed)
            if any(name != device and h["ip"] == ip for name, h in STATE["hosts"].items()):
                return jsonify({"ok": False, "message": "That IP address is already assigned to another device."}), 409
            host["ip"] = ip
        elif field == "online":
            host["online"] = bool(value)
        elif field == "server_running" and device == "Server":
            STATE["server_running"] = bool(value)
        elif field == "dns_running" and device == "Server":
            STATE["dns_running"] = bool(value)
        else:
            return jsonify({"ok": False, "message": "Unsupported device setting."}), 400
        return jsonify({"ok": True, "state": {key: value for key, value in STATE.items()}})


@app.post("/api/reset")
def reset_state():
    global STATE
    with STATE_LOCK:
        STATE = default_state()
    return jsonify({"ok": True})


@app.post("/api/simulate")
def simulate_api():
    payload = request.get_json(silent=True) or {}
    scenario = str(payload.get("scenario", "")).lower()
    stamp = datetime.now().strftime("%H:%M:%S")
    with STATE_LOCK:
        server_running = STATE["server_running"]
        dns_running = STATE["dns_running"]
        server_port = STATE["server_port"]
    scenarios = {
        "tcp": ("TCP connection setup", ["Client selects an ephemeral source port.", "SYN: client requests a connection.", "SYN-ACK: server acknowledges the request.", "ACK: connection is established."], ["SYN", "SYN-ACK", "ACK"]),
        "udp": ("UDP datagram delivery", ["Application creates a datagram.", "UDP adds source and destination ports.", "Datagram is sent without a connection handshake.", "Delivery is not guaranteed by UDP itself."], ["Datagram created", "No handshake", "Best-effort delivery"]),
        "http": ("HTTP request / response", ["DNS resolves server.local to 192.168.1.100.", f"Client opens a TCP connection to port {server_port}.", "Client sends GET / HTTP/1.1.", f"Server responds with {'200 OK' if server_running else 'connection refused'}."], ["DNS lookup", "TCP handshake", "GET /", "HTTP response"]),
        "dns": ("DNS name resolution", ["Client asks the configured DNS service for server.local.", "DNS looks up the A record.", f"Response: {'192.168.1.100' if dns_running else 'SERVFAIL (service stopped)'}"], ["Query sent", "A record lookup", "Response returned"]),
        "dhcp": ("DHCP address assignment", ["DISCOVER: client broadcasts for a DHCP server.", "OFFER: server proposes an address from the pool.", "REQUEST: client requests the offered address.", "ACK: server confirms the lease."], ["DHCP Discover", "DHCP Offer", "DHCP Request", "DHCP ACK"]),
        "arp": ("ARP address resolution", ["PC1 checks its ARP cache for 192.168.1.11.", "No cached entry: ARP request is broadcast on the LAN.", "PC2 replies with its MAC address.", "PC1 caches the IPv4-to-MAC mapping."], ["Cache check", "ARP request", "ARP reply", "Cache updated"]),
    }
    if scenario not in scenarios:
        return jsonify({"ok": False, "message": "Unknown simulation scenario."}), 400
    title, lines, stages = scenarios[scenario]
    if scenario == "http" and not server_running:
        lines[-1] = "Server is stopped: the request fails before an HTTP response."
    if scenario == "dns" and not dns_running:
        lines[-1] = "DNS service is stopped: no A record response is returned."
    events = [{"time": stamp, "title": stage, "detail": line, "kind": "error" if ((scenario == "http" and not server_running and i == len(lines) - 1) or (scenario == "dns" and not dns_running and i == len(lines) - 1)) else ("success" if i == len(lines) - 1 else "info")} for i, (stage, line) in enumerate(zip(stages, lines))]
    return jsonify({"ok": not ((scenario == "http" and not server_running) or (scenario == "dns" and not dns_running)), "title": title, "lines": lines, "events": events, "output": title + "\n" + "\n".join(f"{i + 1}. {line}" for i, line in enumerate(lines))})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # The Werkzeug debugger must never be exposed on a shared network, so it is
    # disabled unless explicitly enabled for local development.
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)
