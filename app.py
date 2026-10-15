"""NetLab — interactive computer networks lab.

The command console executes real, allow-listed diagnostics on the machine that
hosts this application (see :mod:`executor`). The LAN / protocol modules remain
deliberate teaching models so learners can explore concepts that cannot safely
be exercised on a shared host.
"""

from __future__ import annotations

import ipaddress
import os
import socket
import threading
import time
from datetime import datetime

from flask import Flask, jsonify, render_template, request

import executor
import simulation_packets

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
    with STATE_LOCK:
        server_running = STATE["server_running"]
        dns_running = STATE["dns_running"]
        server_port = STATE["server_port"]
    data = simulation_packets.get_simulation_data(
        scenario,
        server_running=server_running,
        dns_running=dns_running,
        server_port=server_port,
    )
    if not data:
        return jsonify({"ok": False, "message": "Unknown simulation scenario."}), 400
    return jsonify(data)


@app.post("/api/packet_action")
def packet_action_api():
    payload = request.get_json(silent=True) or {}
    action = str(payload.get("action", "")).strip().lower()
    params = payload.get("params", {})
    with STATE_LOCK:
        server_running = STATE["server_running"]
        server_port = STATE["server_port"]
        if "src_ip" not in params and "PC1" in STATE["hosts"]:
            params["src_ip"] = STATE["hosts"]["PC1"]["ip"]
        if "dst_ip" not in params and "Server" in STATE["hosts"]:
            params["dst_ip"] = STATE["hosts"]["Server"]["ip"]
        if "server_port" not in params:
            params["server_port"] = server_port

    pkt = simulation_packets.create_action_packet(
        action,
        params=params,
        server_running=server_running,
        server_port=server_port,
    )
    return jsonify({"ok": True, "action": action, "packet": pkt})


@app.post("/api/probe_tcp")
def probe_tcp():
    payload = request.get_json(silent=True) or {}
    target_host = str(payload.get("host", "127.0.0.1")).strip()
    target_port = int(payload.get("port", 5000))
    if not (1 <= target_port <= 65535):
        return jsonify({"ok": False, "error": "Invalid port number."}), 400
    if target_host not in ("127.0.0.1", "localhost", "1.1.1.1", "8.8.8.8"):
        target_host = "127.0.0.1"

    t0 = time.perf_counter()
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2.5)
    try:
        sock.connect((target_host, target_port))
        rtt_ms = (time.perf_counter() - t0) * 1000
        client_ip, client_port = sock.getsockname()
        server_ip, server_port = sock.getpeername()
        sock.close()
        return jsonify({
            "ok": True,
            "host": target_host,
            "port": target_port,
            "client_ip": client_ip,
            "client_port": client_port,
            "server_ip": server_ip,
            "server_port": server_port,
            "rtt_ms": round(rtt_ms, 2),
            "real_handshake": True,
        })
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # The Werkzeug debugger must never be exposed on a shared network, so it is
    # disabled unless explicitly enabled for local development.
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug, host="0.0.0.0", port=port)
