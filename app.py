from __future__ import annotations

from flask import Flask, jsonify, render_template, request
import ipaddress
import os
import shlex
from datetime import datetime

app = Flask(__name__)

# This is a deterministic teaching simulator. It never runs shell commands or
# sends packets over the real network.
STATE = {
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

DNS_RECORDS = {
    "example.com": "93.184.216.34",
    "google.com": "8.8.8.8",
    "dns.google": "8.8.8.8",
    "cloudflare.com": "1.1.1.1",
    "server.local": "192.168.1.100",
    "lab.local": "192.168.1.100",
    "router.local": "192.168.1.1",
}


def host_by_ip(ip: str):
    for name, host in STATE["hosts"].items():
        if host["ip"] == ip:
            return name, host
    return None, None


def same_subnet(ip1: str, ip2: str, mask: str = "255.255.255.0") -> bool:
    try:
        network = ipaddress.ip_network(f"{ip1}/{mask}", strict=False)
        return ipaddress.ip_address(ip2) in network
    except ValueError:
        return False


def default_source(source: str):
    if source not in STATE["hosts"] or STATE["hosts"][source]["kind"] not in ("workstation", "server"):
        source = "PC1"
    return source, STATE["hosts"][source]


def line_block(title: str, lines: list[str]) -> str:
    return "\n".join([title, *lines])


def handle_command(raw_command: str, source: str = "PC1"):
    command = (raw_command or "").strip()
    events: list[dict] = []
    source, src = default_source(source)
    if not command:
        return {"ok": False, "output": "Enter a command. Type 'help' to see supported commands.", "events": []}

    try:
        parts = shlex.split(command)
    except ValueError:
        return {"ok": False, "output": "Could not parse that command. Check the quotation marks.", "events": []}
    if not parts:
        return {"ok": False, "output": "Enter a command.", "events": []}

    name = parts[0].lower()
    args = parts[1:]
    stamp = datetime.now().strftime("%H:%M:%S")

    if name in {"help", "?"}:
        output = "SUPPORTED SIMULATOR COMMANDS\n  ping <IPv4>                 Test reachability\n  ipconfig | ifconfig         Show source IP configuration\n  tracert | traceroute <IPv4> Trace a sample route\n  nslookup <name>             Query the simulated DNS table\n  arp -a                      View the simulated ARP cache\n  route print                 View the routing table\n  netstat                     View sample connection states\n  curl http://server.local    Make a simulated HTTP request\n  dhcp renew                  Request a sample DHCP lease\n  help                        Show this list\n\nSafety: commands are interpreted by this Python simulator; no OS shell is executed."
        return {"ok": True, "output": output, "events": []}

    if name == "ping":
        if len(args) != 1:
            return {"ok": False, "output": "Usage: ping <IPv4 address or domain>\nExamples: ping 192.168.1.11, ping 8.8.8.8, ping google.com", "events": []}
        target_raw = args[0].strip()
        if not src["online"]:
            return {"ok": False, "output": f"Request could not be sent: {source} is offline.", "events": []}

        target = target_raw
        try:
            parsed_target = ipaddress.ip_address(target_raw)
            if not isinstance(parsed_target, ipaddress.IPv4Address):
                return {"ok": False, "output": f"Invalid IPv4 address: {target_raw}", "events": []}
        except ValueError:
            domain_key = target_raw.lower().rstrip(".")
            if not STATE["dns_running"]:
                events.append({"time": stamp, "title": "DNS failure", "detail": f"DNS service is stopped; cannot resolve {domain_key}", "kind": "error"})
                return {"ok": False, "output": f"Ping request could not find host {target_raw}. Please check the name and try again (DNS service is stopped).", "events": events}
            if domain_key in DNS_RECORDS:
                target = DNS_RECORDS[domain_key]
                events.append({"time": stamp, "title": "DNS resolution", "detail": f"Resolved {domain_key} → {target}", "kind": "info"})
            else:
                return {"ok": False, "output": f"Ping request could not find host {target_raw}. Please check the name and try again.", "events": []}

        events.append({"time": stamp, "title": "Echo request created", "detail": f"{source} → {target}", "kind": "info"})
        target_name, host = host_by_ip(target)

        # 1. Local Subnet Check
        if same_subnet(src["ip"], target, src["mask"]):
            if host and host["online"]:
                events.extend([
                    {"time": stamp, "title": "ARP lookup", "detail": f"Resolved {target} to {host['mac']}", "kind": "success"},
                    {"time": stamp, "title": "ICMP echo reply", "detail": f"Reply received from {target_name} ({target})", "kind": "success"},
                ])
                output = f"Pinging {target} from {src['ip']} with 32 bytes of data:\nReply from {target}: bytes=32 time=2ms TTL=64\nReply from {target}: bytes=32 time=1ms TTL=64\nReply from {target}: bytes=32 time=2ms TTL=64\nReply from {target}: bytes=32 time=1ms TTL=64\n\nPing statistics for {target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)\nApproximate round trip times: Minimum = 1ms, Maximum = 2ms, Average = 1ms\n\nSIMULATION: local host is reachable on subnet {src['ip']}/{src['mask']}."
                return {"ok": True, "output": output, "events": events, "highlight": [source, target_name]}
            elif host and not host["online"]:
                events.append({"time": stamp, "title": "Host unreachable", "detail": f"Local host {target_name} ({target}) is powered offline", "kind": "error"})
                output = f"Pinging {target} from {src['ip']} with 32 bytes of data:\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for {target}:\n    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)\n\nSIMULATION: target device ({target_name}) is on local subnet but currently offline."
                return {"ok": False, "output": output, "events": events}
            else:
                events.append({"time": stamp, "title": "ARP timeout", "detail": f"No response to ARP broadcast for {target}", "kind": "error"})
                output = f"Pinging {target} from {src['ip']} with 32 bytes of data:\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for {target}:\n    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)\n\nSIMULATION: no device on local subnet {src['ip']}/{src['mask']} uses this address."
                return {"ok": False, "output": output, "events": events}

        # 2. Remote / WAN Subnet Check (routes via Default Gateway)
        router = STATE["hosts"]["Router"]
        if router["online"]:
            events.extend([
                {"time": stamp, "title": "Default gateway lookup", "detail": f"Route non-local target {target} via {router['ip']} (Router)", "kind": "info"},
                {"time": stamp, "title": "ICMP echo reply", "detail": f"Reply received from {target} (WAN latency ~13ms, TTL 117)", "kind": "success"},
            ])
            output = f"Pinging {target} from {src['ip']} with 32 bytes of data:\nReply from {target}: bytes=32 time=14ms TTL=117\nReply from {target}: bytes=32 time=12ms TTL=117\nReply from {target}: bytes=32 time=15ms TTL=117\nReply from {target}: bytes=32 time=13ms TTL=117\n\nPing statistics for {target}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)\nApproximate round trip times: Minimum = 12ms, Maximum = 15ms, Average = 13ms\n\nSIMULATION: routed via default gateway ({router['ip']}) to external network host."
            return {"ok": True, "output": output, "events": events, "highlight": [source, "Router"]}
        else:
            events.append({"time": stamp, "title": "Gateway unreachable", "detail": f"Default gateway {router['ip']} is offline", "kind": "error"})
            output = f"Pinging {target} from {src['ip']} with 32 bytes of data:\nDestination host unreachable.\nDestination host unreachable.\n\nPing statistics for {target}:\n    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)\n\nSIMULATION: target is outside local subnet, but default gateway ({router['ip']}) is offline."
            return {"ok": False, "output": output, "events": events}

    if name in {"ipconfig", "ifconfig"}:
        output = line_block(f"Ethernet adapter {source}:", [
            f"   IPv4 Address . . . . . . : {src['ip']}",
            f"   Subnet Mask  . . . . . . : {src['mask']}",
            f"   Default Gateway . . . .  : {STATE['hosts']['Router']['ip'] if STATE['hosts']['Router']['online'] else 'none'}",
            f"   Physical Address . . . . : {src['mac']}",
            f"   Adapter Status . . . . . : {'Connected' if src['online'] else 'Disconnected'}",
            "\nSIMULATION: values are read from the lab configuration.",
        ])
        return {"ok": True, "output": output, "events": []}

    if name in {"tracert", "traceroute"}:
        if len(args) != 1:
            return {"ok": False, "output": "Usage: tracert <IPv4 address>\nTry: tracert 203.0.113.25 or tracert 8.8.8.8", "events": []}
        target = args[0]
        try:
            parsed_target = ipaddress.ip_address(target)
            if not isinstance(parsed_target, ipaddress.IPv4Address):
                raise ValueError("IPv4 only")
        except ValueError:
            return {"ok": False, "output": f"Invalid IPv4 address: {target}", "events": []}
        router = STATE["hosts"]["Router"]
        if not router["online"]:
            events.append({"time": stamp, "title": "Gateway unreachable", "detail": f"Default gateway {router['ip']} is offline", "kind": "error"})
            output = f"Tracing route to {target} over a maximum of 8 hops\n\n  1     *        *        *     Request timed out.\n\nTrace stopped: default gateway ({router['ip']}) is offline.\nSIMULATION: packets cannot leave local subnet when router is offline."
            return {"ok": False, "output": output, "events": events}
        events = [
            {"time": stamp, "title": "TTL = 1", "detail": f"First hop: {router['ip']} (Default gateway)", "kind": "success"},
            {"time": stamp, "title": "TTL = 2", "detail": "Sample upstream router: 198.51.100.1", "kind": "info"},
            {"time": stamp, "title": "Destination", "detail": f"Reached simulated destination {target}", "kind": "success"},
        ]
        output = f"Tracing route to {target} over a maximum of 8 hops\n\n  1     1 ms     1 ms     2 ms  {router['ip']}\n  2     8 ms     9 ms     8 ms  198.51.100.1\n  3    18 ms    17 ms    19 ms  {target}\n\nTrace complete.\nSIMULATION: routed across hops via default gateway {router['ip']}."
        return {"ok": True, "output": output, "events": events, "highlight": [source, "Router"]}

    if name == "nslookup":
        if len(args) != 1:
            return {"ok": False, "output": "Usage: nslookup <domain>\nTry: nslookup server.local", "events": []}
        domain = args[0].lower().rstrip(".")
        if not STATE["dns_running"]:
            return {"ok": False, "output": "DNS request timed out. The simulated DNS service is stopped.", "events": [{"time": stamp, "title": "DNS service unavailable", "detail": "Start DNS in Server Setup to retry.", "kind": "error"}]}
        ip = DNS_RECORDS.get(domain)
        if not ip:
            return {"ok": False, "output": f"Server: 192.168.1.100\n*** No simulated DNS record found for {domain}\n\nTip: try server.local, router.local, lab.local or example.com.", "events": [{"time": stamp, "title": "DNS response: NXDOMAIN", "detail": f"No record for {domain}", "kind": "error"}]}
        return {"ok": True, "output": f"Server: 192.168.1.100\nAddress: 192.168.1.100#53\n\nNon-authoritative answer:\nName: {domain}\nAddress: {ip}\n\nSIMULATION: answer was read from the local DNS record table.", "events": [{"time": stamp, "title": "DNS query", "detail": f"A record lookup for {domain}", "kind": "info"}, {"time": stamp, "title": "DNS response", "detail": f"{domain} → {ip}", "kind": "success"}]}

    if name == "arp":
        if args != ["-a"]:
            return {"ok": False, "output": "Usage: arp -a", "events": []}
        rows = ["Interface: " + src["ip"] + " --- 0x6", "  Internet Address      Physical Address      Type"]
        rows.extend([f"  {h['ip']:<22}{h['mac']:<22}dynamic" for h in STATE["hosts"].values() if h["online"]])
        return {"ok": True, "output": "\n".join(rows) + "\n\nSIMULATION: ARP cache entries are generated from online lab devices.", "events": [{"time": stamp, "title": "ARP cache read", "detail": "Listed online devices in the local subnet.", "kind": "success"}]}

    if name == "route":
        if args != ["print"]:
            return {"ok": False, "output": "Usage: route print", "events": []}
        gw = STATE["hosts"]["Router"]["ip"] if STATE["hosts"]["Router"]["online"] else "unavailable"
        output = f"IPv4 Route Table — {source}\n\nNetwork Destination        Netmask          Gateway\n0.0.0.0                    0.0.0.0          {gw}\n192.168.1.0                255.255.255.0    On-link\n{src['ip']:<27}{src['mask']:<17}On-link\n\nSIMULATION: sample routing table for the selected device."
        return {"ok": True, "output": output, "events": []}

    if name == "netstat":
        if args:
            return {"ok": False, "output": "Usage: netstat", "events": []}
        return {"ok": True, "output": "Active Simulated Connections\nProto  Local Address          Foreign Address        State\nTCP    192.168.1.10:53124     192.168.1.100:8080      ESTABLISHED\nTCP    192.168.1.10:53125     93.184.216.34:443       TIME_WAIT\nUDP    192.168.1.10:5353      192.168.1.255:5353      LISTENING\n\nSIMULATION: example connection states; no sockets are opened.", "events": []}

    if name == "curl":
        if len(args) != 1 or not args[0].startswith(("http://", "https://")):
            return {"ok": False, "output": "Usage: curl http://server.local\nOnly the configured lab server is supported.", "events": []}
        if not STATE["server_running"]:
            return {"ok": False, "output": "curl: (7) Failed to connect — lab web server is stopped.", "events": [{"time": stamp, "title": "TCP connection refused", "detail": "Start the server in Server Setup.", "kind": "error"}]}
        if "server.local" not in args[0] and "192.168.1.100" not in args[0]:
            return {"ok": False, "output": "Blocked by simulator: only server.local / 192.168.1.100 is available.", "events": []}
        return {"ok": True, "output": f"HTTP/1.1 200 OK\nContent-Type: text/html; charset=utf-8\nServer: Python-Network-Lab\n\n<html><body><h1>It works!</h1><p>Hello from the simulated lab server.</p></body></html>\n\nSIMULATION: this response is generated locally; no HTTP request was sent.", "events": [{"time": stamp, "title": "TCP handshake", "detail": f"{src['ip']} → 192.168.1.100:{STATE['server_port']}", "kind": "success"}, {"time": stamp, "title": "HTTP 200 OK", "detail": "Simulated server returned a sample page.", "kind": "success"}], "highlight": [source, "Server"]}

    if name == "dhcp":
        if args != ["renew"]:
            return {"ok": False, "output": "Usage: dhcp renew", "events": []}
        if source == "Server":
            return {"ok": False, "output": "Select PC1 or PC2 as the command source to request a client lease.", "events": []}
        if not STATE["hosts"]["Router"]["online"]:
            return {"ok": False, "output": "DHCP request failed: gateway/DHCP relay is offline in this model.", "events": []}
        try:
            start = ipaddress.ip_address(STATE["dhcp_pool_start"])
            candidate = start
            used = {h["ip"] for h in STATE["hosts"].values()}
            while str(candidate) in used:
                candidate += 1
            leased = str(candidate)
            STATE["leases"][source] = leased
            src["ip"] = leased
        except Exception:
            leased = src["ip"]
        return {"ok": True, "output": f"DHCP Discover  → broadcast\nDHCP Offer     → {leased}\nDHCP Request   → accepted\nDHCP ACK       → lease granted\n\nLease for {source}: {leased}\nSubnet mask: 255.255.255.0\nDefault gateway: 192.168.1.1\n\nSIMULATION: a sample lease was assigned from the lab pool.", "events": [{"time": stamp, "title": "DHCP Discover / Offer", "detail": f"Address offered to {source}: {leased}", "kind": "info"}, {"time": stamp, "title": "DHCP ACK", "detail": "Lease accepted by the simulator.", "kind": "success"}]}

    return {"ok": False, "output": f"'{name}' is not supported by this lab console. Type 'help' for available commands.", "events": []}


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def get_state():
    # Return a copy-like JSON view, leaving the process-local simulator state private.
    return jsonify({"hosts": STATE["hosts"], "server_running": STATE["server_running"], "server_port": STATE["server_port"], "dns_running": STATE["dns_running"], "dhcp_pool_start": STATE["dhcp_pool_start"], "leases": STATE["leases"]})


@app.post("/api/command")
def command_api():
    payload = request.get_json(silent=True) or {}
    result = handle_command(str(payload.get("command", "")), str(payload.get("source", "PC1")))
    return jsonify(result)


@app.post("/api/simulate")
def simulate_api():
    payload = request.get_json(silent=True) or {}
    scenario = str(payload.get("scenario", "")).lower()
    stamp = datetime.now().strftime("%H:%M:%S")
    scenarios = {
        "tcp": ("TCP connection setup", ["Client selects an ephemeral source port.", "SYN: client requests a connection.", "SYN-ACK: server acknowledges the request.", "ACK: connection is established."], ["SYN", "SYN-ACK", "ACK"]),
        "udp": ("UDP datagram delivery", ["Application creates a datagram.", "UDP adds source and destination ports.", "Datagram is sent without a connection handshake.", "Delivery is not guaranteed by UDP itself."], ["Datagram created", "No handshake", "Best-effort delivery"]),
        "http": ("HTTP request / response", ["DNS resolves server.local to 192.168.1.100.", f"Client opens a TCP connection to port {STATE['server_port']}.", "Client sends GET / HTTP/1.1.", f"Server responds with {'200 OK' if STATE['server_running'] else 'connection refused'}."], ["DNS lookup", "TCP handshake", "GET /", "HTTP response"]),
        "dns": ("DNS name resolution", ["Client asks the configured DNS service for server.local.", "DNS looks up the A record.", f"Response: {'192.168.1.100' if STATE['dns_running'] else 'SERVFAIL (service stopped)'}"], ["Query sent", "A record lookup", "Response returned"]),
        "dhcp": ("DHCP address assignment", ["DISCOVER: client broadcasts for a DHCP server.", "OFFER: server proposes an address from the pool.", "REQUEST: client requests the offered address.", "ACK: server confirms the lease."], ["DHCP Discover", "DHCP Offer", "DHCP Request", "DHCP ACK"]),
        "arp": ("ARP address resolution", ["PC1 checks its ARP cache for 192.168.1.11.", "No cached entry: ARP request is broadcast on the LAN.", "PC2 replies with its MAC address.", "PC1 caches the IPv4-to-MAC mapping."], ["Cache check", "ARP request", "ARP reply", "Cache updated"]),
    }
    if scenario not in scenarios:
        return jsonify({"ok": False, "message": "Unknown simulation scenario."}), 400
    title, lines, stages = scenarios[scenario]
    if scenario == "http" and not STATE["server_running"]:
        lines[-1] = "Server is stopped: the request fails before an HTTP response."
    if scenario == "dns" and not STATE["dns_running"]:
        lines[-1] = "DNS service is stopped: no A record response is returned."
    events = [{"time": stamp, "title": stage, "detail": line, "kind": "error" if ((scenario == "http" and not STATE["server_running"] and i == len(lines)-1) or (scenario == "dns" and not STATE["dns_running"] and i == len(lines)-1)) else ("success" if i == len(lines)-1 else "info")} for i, (stage, line) in enumerate(zip(stages, lines))]
    return jsonify({"ok": not ((scenario == "http" and not STATE["server_running"]) or (scenario == "dns" and not STATE["dns_running"])), "title": title, "lines": lines, "events": events, "output": title + "\n" + "\n".join(f"{i+1}. {line}" for i, line in enumerate(lines)) + "\n\nSIMULATION: protocol steps are modelled in Python; no real packets are transmitted."})


@app.post("/api/device")
def update_device():
    payload = request.get_json(silent=True) or {}
    device = str(payload.get("device", ""))
    if device not in STATE["hosts"]:
        return jsonify({"ok": False, "message": "Unknown device."}), 400
    host = STATE["hosts"][device]
    field = str(payload.get("field", ""))
    value = payload.get("value")
    if field == "ip":
        try:
            ip = str(ipaddress.ip_address(str(value)))
        except ValueError:
            return jsonify({"ok": False, "message": "Enter a valid IPv4 address."}), 400
        if ":" in ip:
            return jsonify({"ok": False, "message": "This lab currently supports IPv4 only."}), 400
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
    return jsonify({"ok": True, "state": {"hosts": STATE["hosts"], "server_running": STATE["server_running"], "server_port": STATE["server_port"], "dns_running": STATE["dns_running"], "dhcp_pool_start": STATE["dhcp_pool_start"], "leases": STATE["leases"]}})


@app.post("/api/reset")
def reset_state():
    global STATE
    STATE = {
        "hosts": {
            "PC1": {"ip": "192.168.1.10", "mask": "255.255.255.0", "mac": "02:00:00:00:01:10", "online": True, "kind": "workstation"},
            "PC2": {"ip": "192.168.1.11", "mask": "255.255.255.0", "mac": "02:00:00:00:01:11", "online": True, "kind": "workstation"},
            "Router": {"ip": "192.168.1.1", "mask": "255.255.255.0", "mac": "02:00:00:00:01:01", "online": True, "kind": "router"},
            "Server": {"ip": "192.168.1.100", "mask": "255.255.255.0", "mac": "02:00:00:00:01:64", "online": True, "kind": "server"},
        }, "server_running": True, "server_port": 8080, "dns_running": True, "dhcp_pool_start": "192.168.1.50", "leases": {}
    }
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)
