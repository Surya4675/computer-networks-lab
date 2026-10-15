"""Wireshark packet capture models for NetLab protocol simulation.

Provides authentic packet-level captures and dissection trees for:
- TCP (3-way handshake: SYN, SYN-ACK, ACK, ESTABLISHED)
- UDP (connectionless datagram delivery)
- HTTP (DNS lookup, TCP handshake, GET, response)
- DNS (A-record standard query & response)
- DHCP (DORA 4-stage address assignment)
- ARP (IPv4-to-MAC address resolution)
"""

from __future__ import annotations

from datetime import datetime


def get_simulation_data(
    scenario: str,
    server_running: bool = True,
    dns_running: bool = True,
    server_port: int = 80,
) -> dict | None:
    scenario = (scenario or "").lower()
    stamp = datetime.now().strftime("%H:%M:%S")

    generators = {
        "tcp": _build_tcp,
        "udp": _build_udp,
        "http": lambda: _build_http(server_running, server_port),
        "dns": lambda: _build_dns(dns_running),
        "dhcp": _build_dhcp,
        "arp": _build_arp,
    }

    if scenario not in generators:
        return None

    title, lines, stages, packets, ok = generators[scenario]()

    events = [
        {
            "time": stamp,
            "title": stage,
            "detail": line,
            "kind": (
                "error"
                if not ok and i == len(lines) - 1
                else ("success" if i == len(lines) - 1 else "info")
            ),
        }
        for i, (stage, line) in enumerate(zip(stages, lines))
    ]

    ascii_lines = [title] + [f"{i + 1}. {line}" for i, line in enumerate(lines)]

    return {
        "ok": ok,
        "title": title,
        "lines": lines,
        "events": events,
        "packets": packets,
        "output": "\n".join(ascii_lines),
    }


# --------------------------------------------------------------------------- #
# TCP Scenario: 3-Way Handshake
# --------------------------------------------------------------------------- #
def _build_tcp() -> tuple[str, list[str], list[str], list[dict], bool]:
    title = "TCP three-way handshake"
    stages = ["SYN", "SYN-ACK", "ACK", "ESTABLISHED"]
    lines = [
        "Client sends SYN: selects ephemeral port 54321 and initial sequence number (Seq=0).",
        "Server replies SYN-ACK: acknowledges client ISN (Ack=1) and chooses server ISN (Seq=0).",
        "Client sends ACK: confirms server ISN (Ack=1). TCP handshake completed.",
        "Connection ESTABLISHED: socket state transitions to ESTABLISHED; application data flows.",
    ]

    packets = [
        {
            "no": 1,
            "time": "0.000000",
            "source": "192.168.1.10",
            "destination": "192.168.1.100",
            "protocol": "TCP",
            "length": 74,
            "info": "54321 → 80 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM TSval=1002345 TSecr=0 WS=128",
            "stage": "SYN",
            "summary": "Packet 1 (SYN): Client initiates connection to server port 80. Sets SYN flag and chooses random ISN=2849182301 (relative 0).",
            "layers": [
                {
                    "name": "Frame 1: 74 bytes on wire (592 bits), 74 bytes captured (592 bits)",
                    "fields": [
                        "Interface id: 0 (eth0)",
                        "Encapsulation type: Ethernet (1)",
                        "Arrival Time: Oct 15, 2026 22:20:00.000000000",
                        "Frame Number: 1",
                        "Frame Length: 74 bytes (592 bits)",
                        "Capture Length: 74 bytes (592 bits)",
                    ],
                },
                {
                    "name": "Ethernet II, Src: PC1 (00:1a:2b:3c:4d:01), Dst: Server (00:1a:2b:3c:4d:fe)",
                    "fields": [
                        "Destination: Server (00:1a:2b:3c:4d:fe)",
                        "Source: PC1 (00:1a:2b:3c:4d:01)",
                        "Type: IPv4 (0x0800)",
                    ],
                },
                {
                    "name": "Internet Protocol Version 4, Src: 192.168.1.10, Dst: 192.168.1.100",
                    "fields": [
                        "0100 .... = Version: 4",
                        ".... 0101 = Header Length: 20 bytes (5)",
                        "Differentiated Services Field: 0x00 (DSCP: CS0, ECN: Not-ECT)",
                        "Total Length: 60",
                        "Identification: 0x1a4b (6731)",
                        "010. .... = Flags: 0x2, Don't fragment",
                        "Time to Live: 64",
                        "Protocol: TCP (6)",
                        "Header Checksum: 0x7c4f [validation disabled]",
                        "Source Address: 192.168.1.10",
                        "Destination Address: 192.168.1.100",
                    ],
                },
                {
                    "name": "Transmission Control Protocol, Src Port: 54321, Dst Port: 80, Seq: 0, Len: 0",
                    "fields": [
                        "Source Port: 54321",
                        "Destination Port: 80 (http)",
                        "[Stream index: 0]",
                        "[TCP Segment Len: 0]",
                        "Sequence Number: 0    (relative sequence number)",
                        "Sequence Number (raw): 2849182301",
                        "[Next Sequence Number: 1]",
                        "Acknowledgment Number: 0",
                        "1000 .... = Header Length: 32 bytes (8)",
                        "Flags: 0x0002 (SYN)",
                        "    0... .... .... = Reserved: Not set",
                        "    .... 0... .... = Nonce: Not set",
                        "    .... .0.. .... = Congestion Window Reduced (CWR): Not set",
                        "    .... ..0. .... = ECN-Echo: Not set",
                        "    .... ...0 .... = Urgent: Not set",
                        "    .... .... 0... = Acknowledgment: Not set",
                        "    .... .... .0.. = Push: Not set",
                        "    .... .... ..0. = Reset: Not set",
                        "    .... .... ...1 = Syn: Set (1)",
                        "    .... .... .... 0 = Fin: Not set",
                        "    [Conversation completeness: Incomplete (1)]",
                        "Window: 64240 (calculated buffer capacity)",
                        "Checksum: 0x2b4a [unverified]",
                        "Options: (12 bytes), Maximum segment size, SACK permitted, Timestamps",
                        "    TCP Option - Maximum segment size: 1460 bytes",
                        "    TCP Option - SACK permitted",
                        "    TCP Option - Timestamps: TSval 1002345, TSecr 0",
                        "    TCP Option - Window scale: 7 (multiply by 128)",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d0108004500003c1a4b400040067c4fc0a8010ac0a80164d4310050a9d570dd00000000a002faf02b4a0000020405b40402080a000f4b890000000001030307",
        },
        {
            "no": 2,
            "time": "0.001420",
            "source": "192.168.1.100",
            "destination": "192.168.1.10",
            "protocol": "TCP",
            "length": 74,
            "info": "80 → 54321 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460 SACK_PERM TSval=3891240 TSecr=1002345 WS=512",
            "stage": "SYN-ACK",
            "summary": "Packet 2 (SYN-ACK): Server receives SYN, allocates transmission control block, replies with SYN and acknowledges client ISN with Ack=1.",
            "layers": [
                {
                    "name": "Frame 2: 74 bytes on wire (592 bits), 74 bytes captured (592 bits)",
                    "fields": [
                        "Arrival Time: Oct 15, 2026 22:20:00.001420000",
                        "Frame Number: 2",
                        "Frame Length: 74 bytes",
                    ],
                },
                {
                    "name": "Ethernet II, Src: Server (00:1a:2b:3c:4d:fe), Dst: PC1 (00:1a:2b:3c:4d:01)",
                    "fields": [
                        "Destination: PC1 (00:1a:2b:3c:4d:01)",
                        "Source: Server (00:1a:2b:3c:4d:fe)",
                        "Type: IPv4 (0x0800)",
                    ],
                },
                {
                    "name": "Internet Protocol Version 4, Src: 192.168.1.100, Dst: 192.168.1.10",
                    "fields": [
                        "Total Length: 60",
                        "Identification: 0x4d12 (19730)",
                        "Time to Live: 64",
                        "Protocol: TCP (6)",
                        "Header Checksum: 0x4988",
                        "Source Address: 192.168.1.100",
                        "Destination Address: 192.168.1.10",
                    ],
                },
                {
                    "name": "Transmission Control Protocol, Src Port: 80, Dst Port: 54321, Seq: 0, Ack: 1, Len: 0",
                    "fields": [
                        "Source Port: 80 (http)",
                        "Destination Port: 54321",
                        "[Stream index: 0]",
                        "Sequence Number: 0    (relative sequence number)",
                        "Sequence Number (raw): 1420953112",
                        "[Next Sequence Number: 1]",
                        "Acknowledgment Number: 1    (relative ack number)",
                        "Acknowledgment Number (raw): 2849182302",
                        "1000 .... = Header Length: 32 bytes (8)",
                        "Flags: 0x0012 (SYN, ACK)",
                        "    0... .... .... = Reserved: Not set",
                        "    .... .... 1... = Acknowledgment: Set (1)",
                        "    .... .... ...1 = Syn: Set (1)",
                        "    [Expert Info: Connection acknowledge and accept]",
                        "Window: 65160",
                        "Checksum: 0x6e1b [unverified]",
                        "Options: (12 bytes), Maximum segment size, SACK permitted, Timestamps",
                        "    TCP Option - Maximum segment size: 1460 bytes",
                        "    TCP Option - SACK permitted",
                        "    TCP Option - Timestamps: TSval 3891240, TSecr 1002345",
                        "    TCP Option - Window scale: 9 (multiply by 512)",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe08004500003c4d12400040064988c0a80164c0a8010a0050d43154b21978a9d570dea012fe886e1b0000020405b40402080a003b5f68000f4b8901030309",
        },
        {
            "no": 3,
            "time": "0.002150",
            "source": "192.168.1.10",
            "destination": "192.168.1.100",
            "protocol": "TCP",
            "length": 54,
            "info": "54321 → 80 [ACK] Seq=1 Ack=1 Win=64240 Len=0 TSval=1002348 TSecr=3891240",
            "stage": "ACK",
            "summary": "Packet 3 (ACK): Client acknowledges server's SYN. 3-way handshake is successfully completed; connection is now established.",
            "layers": [
                {
                    "name": "Frame 3: 54 bytes on wire (432 bits), 54 bytes captured (432 bits)",
                    "fields": [
                        "Arrival Time: Oct 15, 2026 22:20:00.002150000",
                        "Frame Number: 3",
                        "Frame Length: 54 bytes",
                    ],
                },
                {
                    "name": "Ethernet II, Src: PC1 (00:1a:2b:3c:4d:01), Dst: Server (00:1a:2b:3c:4d:fe)",
                    "fields": [
                        "Destination: Server (00:1a:2b:3c:4d:fe)",
                        "Source: PC1 (00:1a:2b:3c:4d:01)",
                        "Type: IPv4 (0x0800)",
                    ],
                },
                {
                    "name": "Internet Protocol Version 4, Src: 192.168.1.10, Dst: 192.168.1.100",
                    "fields": [
                        "Total Length: 40",
                        "Identification: 0x1a4c (6732)",
                        "Time to Live: 64",
                        "Protocol: TCP (6)",
                        "Header Checksum: 0x7c62",
                        "Source Address: 192.168.1.10",
                        "Destination Address: 192.168.1.100",
                    ],
                },
                {
                    "name": "Transmission Control Protocol, Src Port: 54321, Dst Port: 80, Seq: 1, Ack: 1, Len: 0",
                    "fields": [
                        "Source Port: 54321",
                        "Destination Port: 80 (http)",
                        "[Stream index: 0]",
                        "Sequence Number: 1    (relative sequence number)",
                        "Acknowledgment Number: 1    (relative ack number)",
                        "0101 .... = Header Length: 20 bytes (5)",
                        "Flags: 0x0010 (ACK)",
                        "    0... .... .... = Reserved: Not set",
                        "    .... .... 1... = Acknowledgment: Set (1)",
                        "    .... .... ...0 = Syn: Not set (0)",
                        "    [Conversation completeness: Complete (3-way handshake established)]",
                        "Window: 64240",
                        "Checksum: 0x3f91 [unverified]",
                        "[TCP Connection State: ESTABLISHED]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000281a4c400040067c62c0a8010ac0a80164d4310050a9d570de54b219795010faf03f910000",
        },
        {
            "no": 4,
            "time": "0.002840",
            "source": "192.168.1.10",
            "destination": "192.168.1.100",
            "protocol": "TCP",
            "length": 78,
            "info": "54321 → 80 [PSH, ACK] Seq=1 Ack=1 Len=24 [Connection ESTABLISHED - Stream ready]",
            "stage": "ESTABLISHED",
            "summary": "Packet 4 (Data stream): Connection is fully open. Application layer can now exchange bidirectional payload bytes.",
            "layers": [
                {
                    "name": "Frame 4: 78 bytes on wire, 78 bytes captured",
                    "fields": ["Frame Number: 4", "Frame Length: 78 bytes"],
                },
                {
                    "name": "Ethernet II, Src: PC1 (00:1a:2b:3c:4d:01), Dst: Server (00:1a:2b:3c:4d:fe)",
                    "fields": ["Type: IPv4 (0x0800)"],
                },
                {
                    "name": "Internet Protocol Version 4, Src: 192.168.1.10, Dst: 192.168.1.100",
                    "fields": ["Protocol: TCP (6)", "Total Length: 64"],
                },
                {
                    "name": "Transmission Control Protocol, Src Port: 54321, Dst Port: 80, Seq: 1, Ack: 1, Len: 24",
                    "fields": [
                        "Flags: 0x0018 (PSH, ACK)",
                        "    .... .... 1... = Acknowledgment: Set (1)",
                        "    .... ...1 .... = Push: Set (1)",
                        "Window: 64240",
                        "[Payload (24 bytes): NetLab TCP Data Stream]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000401a4d400040067c49c0a8010ac0a80164d4310050a9d570de54b219795018faf08a1c00004e65744c6162205443502053657373696f6e",
        },
    ]

    return title, lines, stages, packets, True


# --------------------------------------------------------------------------- #
# UDP Scenario: Datagram Delivery
# --------------------------------------------------------------------------- #
def _build_udp() -> tuple[str, list[str], list[str], list[dict], bool]:
    title = "UDP datagram delivery"
    stages = ["Datagram sent", "Best-effort delivery"]
    lines = [
        "Application creates datagram: UDP attaches source port 51234 and destination port 9999.",
        "Datagram sent without handshake: host transmits packet; delivery is best effort with minimal overhead.",
    ]

    packets = [
        {
            "no": 1,
            "time": "0.000000",
            "source": "192.168.1.10",
            "destination": "192.168.1.100",
            "protocol": "UDP",
            "length": 62,
            "info": "51234 → 9999 Len=20 [Datagram sent without handshake]",
            "stage": "Datagram sent",
            "summary": "Packet 1: Client transmits a standalone UDP datagram directly to destination port 9999 without opening a prior connection.",
            "layers": [
                {
                    "name": "Frame 1: 62 bytes on wire (496 bits), 62 bytes captured",
                    "fields": [
                        "Arrival Time: Oct 15, 2026 22:20:00.000000000",
                        "Frame Number: 1",
                        "Frame Length: 62 bytes",
                    ],
                },
                {
                    "name": "Ethernet II, Src: PC1 (00:1a:2b:3c:4d:01), Dst: Server (00:1a:2b:3c:4d:fe)",
                    "fields": [
                        "Destination: Server (00:1a:2b:3c:4d:fe)",
                        "Source: PC1 (00:1a:2b:3c:4d:01)",
                        "Type: IPv4 (0x0800)",
                    ],
                },
                {
                    "name": "Internet Protocol Version 4, Src: 192.168.1.10, Dst: 192.168.1.100",
                    "fields": [
                        "Total Length: 48",
                        "Protocol: UDP (17)",
                        "Time to Live: 64",
                        "Source Address: 192.168.1.10",
                        "Destination Address: 192.168.1.100",
                    ],
                },
                {
                    "name": "User Datagram Protocol, Src Port: 51234, Dst Port: 9999",
                    "fields": [
                        "Source Port: 51234",
                        "Destination Port: 9999",
                        "Length: 28 (8 bytes header + 20 bytes data)",
                        "Checksum: 0x8a31 [unverified]",
                        "[UDP payload (20 bytes)]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000302b11400040116b80c0a8010ac0a80164c822270f001c8a314e65744c6162205544502054657374205061636b",
        },
        {
            "no": 2,
            "time": "0.001850",
            "source": "192.168.1.100",
            "destination": "192.168.1.10",
            "protocol": "UDP",
            "length": 58,
            "info": "9999 → 51234 Len=16 [Best-effort datagram response]",
            "stage": "Best-effort delivery",
            "summary": "Packet 2: Server handles the datagram and returns a response payload without maintaining any persistent connection state.",
            "layers": [
                {
                    "name": "Frame 2: 58 bytes on wire, 58 bytes captured",
                    "fields": ["Frame Number: 2", "Frame Length: 58 bytes"],
                },
                {
                    "name": "Ethernet II, Src: Server (00:1a:2b:3c:4d:fe), Dst: PC1 (00:1a:2b:3c:4d:01)",
                    "fields": ["Type: IPv4 (0x0800)"],
                },
                {
                    "name": "Internet Protocol Version 4, Src: 192.168.1.100, Dst: 192.168.1.10",
                    "fields": ["Protocol: UDP (17)", "Total Length: 44"],
                },
                {
                    "name": "User Datagram Protocol, Src Port: 9999, Dst Port: 51234",
                    "fields": [
                        "Source Port: 9999",
                        "Destination Port: 51234",
                        "Length: 24",
                        "Checksum: 0x3d1b",
                        "[UDP payload (16 bytes)]",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe08004500002c3c22400040115a77c0a80164c0a8010a270fc82200183d1b5265636569766564204f4b2121212121",
        },
    ]

    return title, lines, stages, packets, True


# --------------------------------------------------------------------------- #
# HTTP Scenario: Request / Response Lifecycle
# --------------------------------------------------------------------------- #
def _build_http(server_running: bool, server_port: int) -> tuple[str, list[str], list[str], list[dict], bool]:
    title = "HTTP request / response"
    stages = ["DNS lookup", "TCP handshake", "GET /", "HTTP response"]
    lines = [
        "DNS resolves server.local to 192.168.1.100.",
        f"Client opens a TCP connection to port {server_port}.",
        "Client sends GET / HTTP/1.1.",
        (
            f"Server responds with 200 OK (port {server_port})."
            if server_running
            else "Server is stopped: connection refused by host."
        ),
    ]

    packets = [
        {
            "no": 1,
            "time": "0.000000",
            "source": "192.168.1.10",
            "destination": "192.168.1.1",
            "protocol": "DNS",
            "length": 74,
            "info": "Standard query 0x1f2c A server.local",
            "stage": "DNS lookup",
            "summary": "DNS query for server.local hostname resolution.",
            "layers": [
                {"name": "Ethernet II, Src: PC1, Dst: Router", "fields": ["Type: IPv4 (0x0800)"]},
                {"name": "Domain Name System (query)", "fields": ["Transaction ID: 0x1f2c", "Queries: server.local: type A, class IN"]},
            ],
            "hex": "001a2b3c4d02001a2b3c4d0108004500003c000100004011b88ec0a8010ac0a80101ea600035002812341f2c0100000100000000000006736572766572056c6f63616c0000010001",
        },
        {
            "no": 2,
            "time": "0.001120",
            "source": "192.168.1.1",
            "destination": "192.168.1.10",
            "protocol": "DNS",
            "length": 90,
            "info": "Standard query response 0x1f2c A server.local A 192.168.1.100",
            "stage": "DNS lookup",
            "summary": "DNS answer: server.local is mapped to 192.168.1.100.",
            "layers": [
                {"name": "Domain Name System (response)", "fields": ["Answers: server.local: type A, class IN, addr 192.168.1.100"]},
            ],
            "hex": "001a2b3c4d01001a2b3c4d0208004500004c000200004011b87ec0a80101c0a8010a0035ea60003856781f2c8180000100010000000006736572766572056c6f63616c0000010001c00c0001000100000e100004c0a80164",
        },
        {
            "no": 3,
            "time": "0.002240",
            "source": "192.168.1.10",
            "destination": "192.168.1.100",
            "protocol": "TCP",
            "length": 74,
            "info": f"54322 → {server_port} [SYN] Seq=0 Win=64240 Len=0 MSS=1460",
            "stage": "TCP handshake",
            "summary": "Client starts TCP 3-way handshake to HTTP service port.",
            "layers": [
                {"name": f"Transmission Control Protocol, Src Port: 54322, Dst Port: {server_port}, Seq: 0", "fields": ["Flags: 0x0002 (SYN)", "Syn: Set"]},
            ],
            "hex": "001a2b3c4dfe001a2b3c4d0108004500003c2a11400040066c89c0a8010ac0a80164d43200501a2b3c4d00000000a002faf01a2b0000020405b40402080a000f4b890000000001030307",
        },
        {
            "no": 4,
            "time": "0.003310",
            "source": "192.168.1.100",
            "destination": "192.168.1.10",
            "protocol": "TCP",
            "length": 74,
            "info": (
                f"{server_port} → 54322 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0"
                if server_running
                else f"{server_port} → 54322 [RST, ACK] Seq=0 Ack=1 Len=0 (Connection Refused)"
            ),
            "stage": "TCP handshake",
            "summary": "Server acknowledges connection request (or resets if stopped).",
            "layers": [
                {
                    "name": f"Transmission Control Protocol, Src Port: {server_port}, Dst Port: 54322",
                    "fields": [
                        "Flags: 0x0012 (SYN, ACK)" if server_running else "Flags: 0x0014 (RST, ACK)",
                        "Acknowledgment: Set",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe08004500003c3b12400040065b88c0a80164c0a8010a0050d43254b219781a2b3c4ea012fe88561b0000020405b40402080a003b5f68000f4b8901030309",
        },
        {
            "no": 5,
            "time": "0.004110",
            "source": "192.168.1.10",
            "destination": "192.168.1.100",
            "protocol": "HTTP",
            "length": 142,
            "info": "GET / HTTP/1.1 (Host: server.local, User-Agent: NetLab/2.0)",
            "stage": "GET /",
            "summary": "HTTP Client requests the root document /.",
            "layers": [
                {
                    "name": "Hypertext Transfer Protocol",
                    "fields": [
                        "GET / HTTP/1.1\\r\\n",
                        "Host: server.local\\r\\n",
                        "User-Agent: NetLab/2.0\\r\\n",
                        "Accept: text/html\\r\\n\\r\\n",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000804c11400040064a45c0a8010ac0a80164d43200501a2b3c4e54b219795018faf07a120000474554202f20485454502f312e310d0a486f73743a207365727665722e6c6f63616c0d0a0d0a",
        },
        {
            "no": 6,
            "time": "0.005420",
            "source": "192.168.1.100",
            "destination": "192.168.1.10",
            "protocol": "HTTP",
            "length": 218,
            "info": (
                "HTTP/1.1 200 OK (text/html)"
                if server_running
                else "HTTP/1.1 503 Service Unavailable"
            ),
            "stage": "HTTP response",
            "summary": "Server sends HTTP response status line, headers, and body.",
            "layers": [
                {
                    "name": "Hypertext Transfer Protocol",
                    "fields": [
                        "HTTP/1.1 200 OK\\r\\n" if server_running else "HTTP/1.1 503 Service Unavailable\\r\\n",
                        "Content-Type: text/html; charset=utf-8\\r\\n",
                        "Content-Length: 64\\r\\n\\r\\n",
                        "<html><body><h1>NetLab Web Server</h1></body></html>",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe0800450000cc5d12400040063934c0a80164c0a8010a0050d43254b219791a2b3c8a5018fe888b120000485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a20746578742f68746d6c0d0a0d0a",
        },
    ]

    return title, lines, stages, packets, server_running


# --------------------------------------------------------------------------- #
# DNS Scenario: Name Resolution
# --------------------------------------------------------------------------- #
def _build_dns(dns_running: bool) -> tuple[str, list[str], list[str], list[dict], bool]:
    title = "DNS name resolution"
    stages = ["Query sent", "A record lookup", "Response returned"]
    lines = [
        "Client sends DNS query: asks configured DNS server (192.168.1.1:53) for server.local.",
        "DNS server inspects local zone database for matching A record.",
        (
            "Response returned: server.local is 192.168.1.100 (TTL: 3600s)."
            if dns_running
            else "DNS service is stopped: SERVFAIL / timeout, no address returned."
        ),
    ]

    packets = [
        {
            "no": 1,
            "time": "0.000000",
            "source": "192.168.1.10",
            "destination": "192.168.1.1",
            "protocol": "DNS",
            "length": 74,
            "info": "Standard query 0x2e8f A server.local",
            "stage": "Query sent",
            "summary": "DNS Client sends UDP datagram with A-record question for server.local.",
            "layers": [
                {"name": "Domain Name System (query)", "fields": ["Transaction ID: 0x2e8f", "Questions: 1", "server.local: type A, class IN"]},
            ],
            "hex": "001a2b3c4d02001a2b3c4d0108004500003c112200004011a77ec0a8010ac0a80101d1200035002891232e8f0100000100000000000006736572766572056c6f63616c0000010001",
        },
        {
            "no": 2,
            "time": "0.001640",
            "source": "192.168.1.1",
            "destination": "192.168.1.10",
            "protocol": "DNS",
            "length": 90,
            "info": (
                "Standard query response 0x2e8f A server.local A 192.168.1.100"
                if dns_running
                else "Standard query response 0x2e8f Server failure (SERVFAIL)"
            ),
            "stage": "Response returned",
            "summary": "DNS Server resolves hostname to IPv4 address 192.168.1.100.",
            "layers": [
                {
                    "name": "Domain Name System (response)",
                    "fields": [
                        "Transaction ID: 0x2e8f",
                        "Flags: 0x8180 (Standard query response, No error)" if dns_running else "Flags: 0x8182 (Server failure)",
                        "Answers: 1" if dns_running else "Answers: 0",
                        "server.local: type A, class IN, addr 192.168.1.100" if dns_running else "RCODE: 2 (Server failure)",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4d0208004500004c223300004011966ec0a80101c0a8010a0035d120003882342e8f8180000100010000000006736572766572056c6f63616c0000010001c00c0001000100000e100004c0a80164",
        },
    ]

    return title, lines, stages, packets, dns_running


# --------------------------------------------------------------------------- #
# DHCP Scenario: DORA Exchange
# --------------------------------------------------------------------------- #
def _build_dhcp() -> tuple[str, list[str], list[str], list[dict], bool]:
    title = "DHCP address assignment"
    stages = ["DHCP Discover", "DHCP Offer", "DHCP Request", "DHCP ACK"]
    lines = [
        "DISCOVER: unconfigured client broadcasts on 255.255.255.255 searching for DHCP servers.",
        "OFFER: DHCP server offers available lease 192.168.1.10 from its pool.",
        "REQUEST: client formally requests the offered IP address.",
        "ACK: DHCP server commits the lease and transmits subnet mask, gateway, and DNS.",
    ]

    packets = [
        {
            "no": 1,
            "time": "0.000000",
            "source": "0.0.0.0",
            "destination": "255.255.255.255",
            "protocol": "DHCP",
            "length": 342,
            "info": "DHCP Discover - Transaction ID 0x3912a7 (Broadcast)",
            "stage": "DHCP Discover",
            "summary": "Client broadcasts DHCP Discover message on local link (0.0.0.0:68 → 255.255.255.255:67).",
            "layers": [
                {"name": "Dynamic Host Configuration Protocol (Discover)", "fields": ["Message type: Boot Request (1)", "Transaction ID: 0x3912a7", "Client MAC: 00:1a:2b:3c:4d:01", "Option 53: DHCP Discover"]},
            ],
            "hex": "ffffffffffff001a2b3c4d0108004500014800004000401139a000000000ffffffff0044004301340000010106003912a70000000000000000000000000000000000000000001a2b3c4d01000000000000000000000000",
        },
        {
            "no": 2,
            "time": "0.002410",
            "source": "192.168.1.1",
            "destination": "255.255.255.255",
            "protocol": "DHCP",
            "length": 342,
            "info": "DHCP Offer - IP: 192.168.1.10, Server: 192.168.1.1",
            "stage": "DHCP Offer",
            "summary": "Router/Server offers IP address 192.168.1.10 with lease time 86400s.",
            "layers": [
                {"name": "Dynamic Host Configuration Protocol (Offer)", "fields": ["Your (client) IP address: 192.168.1.10", "Option 53: DHCP Offer", "Option 1: Subnet Mask (255.255.255.0)", "Option 3: Router (192.168.1.1)"]},
            ],
            "hex": "ffffffffffff001a2b3c4d02080045000148000140004011399fc0a80101ffffffff0043004401340000020106003912a70000000000000000c0a8010ac0a8010100000000001a2b3c4d01000000000000000000000000",
        },
        {
            "no": 3,
            "time": "0.004120",
            "source": "0.0.0.0",
            "destination": "255.255.255.255",
            "protocol": "DHCP",
            "length": 342,
            "info": "DHCP Request - Requested IP: 192.168.1.10",
            "stage": "DHCP Request",
            "summary": "Client requests the offered 192.168.1.10 IP configuration.",
            "layers": [
                {"name": "Dynamic Host Configuration Protocol (Request)", "fields": ["Option 53: DHCP Request", "Option 50: Requested IP Address (192.168.1.10)", "Option 54: DHCP Server Identifier (192.168.1.1)"]},
            ],
            "hex": "ffffffffffff001a2b3c4d01080045000148000240004011399e00000000ffffffff0044004301340000010106003912a70000000000000000000000000000000000000000001a2b3c4d01000000000000000000000000",
        },
        {
            "no": 4,
            "time": "0.006240",
            "source": "192.168.1.1",
            "destination": "255.255.255.255",
            "protocol": "DHCP",
            "length": 342,
            "info": "DHCP ACK - Lease: 86400s, Mask: 255.255.255.0, Gateway: 192.168.1.1",
            "stage": "DHCP ACK",
            "summary": "Server binds the lease and confirms client network settings.",
            "layers": [
                {"name": "Dynamic Host Configuration Protocol (ACK)", "fields": ["Your (client) IP address: 192.168.1.10", "Option 53: DHCP ACK", "Option 51: IP Address Lease Time (1 day)", "Option 6: DNS Server (192.168.1.1)"]},
            ],
            "hex": "ffffffffffff001a2b3c4d02080045000148000340004011399dc0a80101ffffffff0043004401340000020106003912a70000000000000000c0a8010ac0a8010100000000001a2b3c4d01000000000000000000000000",
        },
    ]

    return title, lines, stages, packets, True


# --------------------------------------------------------------------------- #
# ARP Scenario: Address Resolution Protocol
# --------------------------------------------------------------------------- #
def _build_arp() -> tuple[str, list[str], list[str], list[dict], bool]:
    title = "ARP address resolution"
    stages = ["ARP Request", "ARP Reply"]
    lines = [
        "ARP Request: PC1 broadcasts 'Who has 192.168.1.11? Tell 192.168.1.10'.",
        "ARP Reply: PC2 replies unicast '192.168.1.11 is at 00:1a:2b:3c:4d:02'.",
    ]

    packets = [
        {
            "no": 1,
            "time": "0.000000",
            "source": "00:1a:2b:3c:4d:01",
            "destination": "Broadcast",
            "protocol": "ARP",
            "length": 42,
            "info": "Who has 192.168.1.11? Tell 192.168.1.10",
            "stage": "ARP Request",
            "summary": "PC1 broadcasts an Ethernet ARP frame asking the device with IP 192.168.1.11 to declare its MAC address.",
            "layers": [
                {"name": "Ethernet II, Src: PC1 (00:1a:2b:3c:4d:01), Dst: Broadcast (ff:ff:ff:ff:ff:ff)", "fields": ["Type: ARP (0x0806)"]},
                {
                    "name": "Address Resolution Protocol (request)",
                    "fields": [
                        "Hardware type: Ethernet (1)",
                        "Protocol type: IPv4 (0x0800)",
                        "Opcode: request (1)",
                        "Sender MAC: 00:1a:2b:3c:4d:01",
                        "Sender IP: 192.168.1.10",
                        "Target MAC: 00:00:00:00:00:00",
                        "Target IP: 192.168.1.11",
                    ],
                },
            ],
            "hex": "ffffffffffff001a2b3c4d0108060001080006040001001a2b3c4d01c0a8010a000000000000c0a8010b",
        },
        {
            "no": 2,
            "time": "0.000910",
            "source": "00:1a:2b:3c:4d:02",
            "destination": "00:1a:2b:3c:4d:01",
            "protocol": "ARP",
            "length": 42,
            "info": "192.168.1.11 is at 00:1a:2b:3c:4d:02",
            "stage": "ARP Reply",
            "summary": "PC2 responds directly to PC1 with its MAC address 00:1a:2b:3c:4d:02, which PC1 caches in its ARP table.",
            "layers": [
                {"name": "Ethernet II, Src: PC2 (00:1a:2b:3c:4d:02), Dst: PC1 (00:1a:2b:3c:4d:01)", "fields": ["Type: ARP (0x0806)"]},
                {
                    "name": "Address Resolution Protocol (reply)",
                    "fields": [
                        "Opcode: reply (2)",
                        "Sender MAC: 00:1a:2b:3c:4d:02",
                        "Sender IP: 192.168.1.11",
                        "Target MAC: 00:1a:2b:3c:4d:01",
                        "Target IP: 192.168.1.10",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4d0208060001080006040002001a2b3c4d02c0a8010b001a2b3c4d01c0a8010a",
        },
    ]

    return title, lines, stages, packets, True


# --------------------------------------------------------------------------- #
# Real-Time Interactive Action Packet Generator
# --------------------------------------------------------------------------- #
def create_action_packet(
    action: str,
    params: dict | None = None,
    server_running: bool = True,
    server_port: int = 80,
) -> dict:
    params = params or {}
    act = (action or "").lower().strip()

    src_ip = str(params.get("src_ip", "192.168.1.10"))
    dst_ip = str(params.get("dst_ip", "192.168.1.100"))
    client_port = int(params.get("client_port", 54321))
    target_port = int(params.get("server_port", server_port))
    packet_no = int(params.get("no", 1))
    t_str = str(params.get("time", "0.000000"))
    client_seq = int(params.get("client_seq", 0))
    server_seq = int(params.get("server_seq", 0))
    payload = str(params.get("data", "GET / HTTP/1.1"))

    if act == "syn":
        info = f"{client_port} → {target_port} [SYN] Seq={client_seq} Win=64240 Len=0 MSS=1460 SACK_PERM TSval=1002345 WS=128"
        summary = f"Step 1 (SYN Action): Client ({src_ip}:{client_port}) transmits TCP SYN with initial sequence number (ISN={client_seq}) to Server ({dst_ip}:{target_port})."
        flags_field = [
            "Flags: 0x0002 (SYN)",
            "  .... .... 0... = Acknowledgment: Not set",
            "  .... .... ...1 = Syn: Set (1)",
            "  [Client State: SYN_SENT]",
            "  [Server Transition: SYN_RCVD]",
        ]
        hex_data = (
            "001a2b3c4dfe001a2b3c4d0108004500003c1a4b400040067c4fc0a8010ac0a80164"
            + f"{client_port:04x}{target_port:04x}"
            + "a9d570dd00000000a002faf02b4a0000020405b40402080a000f4b890000000001030307"
        )
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": 74,
            "info": info,
            "stage": "SYN",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 74 bytes on wire (592 bits), 74 bytes captured", "fields": [f"Frame Number: {packet_no}", "Frame Length: 74 bytes"]},
                {"name": "Ethernet II, Src: PC1 (00:1a:2b:3c:4d:01), Dst: Server (00:1a:2b:3c:4d:fe)", "fields": ["Type: IPv4 (0x0800)"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)", f"Source Address: {src_ip}", f"Destination Address: {dst_ip}"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}, Seq: {client_seq}, Len: 0",
                    "fields": [
                        f"Source Port: {client_port}",
                        f"Destination Port: {target_port}",
                        f"Sequence Number: {client_seq}",
                        "Header Length: 32 bytes (8)",
                        *flags_field,
                        "Window: 64240",
                        "Options: (12 bytes) MSS=1460, SACK permitted, Timestamps",
                    ],
                },
            ],
            "hex": hex_data,
        }

    if act == "synack":
        if not server_running:
            info = f"{target_port} → {client_port} [RST, ACK] Seq=0 Ack={client_seq + 1} Win=0 Len=0 (Connection Refused)"
            summary = f"Server ({dst_ip}) is stopped: TCP stack sends RST-ACK immediately rejecting the connection attempt."
            return {
                "no": packet_no,
                "time": t_str,
                "source": dst_ip,
                "destination": src_ip,
                "protocol": "TCP",
                "length": 54,
                "info": info,
                "stage": "RST-ACK",
                "summary": summary,
                "layers": [
                    {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                    {"name": "Ethernet II, Src: Server, Dst: PC1", "fields": ["Type: IPv4 (0x0800)"]},
                    {"name": f"Internet Protocol Version 4, Src: {dst_ip}, Dst: {src_ip}", "fields": ["Protocol: TCP (6)"]},
                    {
                        "name": f"Transmission Control Protocol, Src Port: {target_port}, Dst Port: {client_port}",
                        "fields": [
                            "Flags: 0x0014 (RST, ACK)",
                            "  .... .... 1... = Acknowledgment: Set",
                            "  .... .1.. .... = Reset: Set",
                            f"Acknowledgment Number: {client_seq + 1}",
                            "[Connection Refused: Server is not running]",
                        ],
                    },
                ],
                "hex": "001a2b3c4d01001a2b3c4dfe0800450000284d12400040064998c0a80164c0a8010a" + f"{target_port:04x}{client_port:04x}" + "0000000000000001501400002b4a0000",
            }

        info = f"{target_port} → {client_port} [SYN, ACK] Seq={server_seq} Ack={client_seq + 1} Win=65160 Len=0 MSS=1460 SACK_PERM TSval=3891240 WS=512"
        summary = f"Step 2 (SYN-ACK Action): Server ({dst_ip}:{target_port}) accepts connection. Confirms client sequence (Ack={client_seq + 1}) and sends server ISN={server_seq}."
        flags_field = [
            "Flags: 0x0012 (SYN, ACK)",
            "  .... .... 1... = Acknowledgment: Set (1)",
            "  .... .... ...1 = Syn: Set (1)",
            f"  Acknowledgment Number: {client_seq + 1} (confirms client ISN + 1)",
            "  [Server State: SYN_RCVD]",
        ]
        hex_data = (
            "001a2b3c4d01001a2b3c4dfe08004500003c4d12400040064988c0a80164c0a8010a"
            + f"{target_port:04x}{client_port:04x}"
            + "54b21978a9d570dea012fe886e1b0000020405b40402080a003b5f68000f4b8901030309"
        )
        return {
            "no": packet_no,
            "time": t_str,
            "source": dst_ip,
            "destination": src_ip,
            "protocol": "TCP",
            "length": 74,
            "info": info,
            "stage": "SYN-ACK",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 74 bytes on wire", "fields": ["Frame Length: 74 bytes"]},
                {"name": "Ethernet II, Src: Server (00:1a:2b:3c:4d:fe), Dst: PC1 (00:1a:2b:3c:4d:01)", "fields": ["Type: IPv4 (0x0800)"]},
                {"name": f"Internet Protocol Version 4, Src: {dst_ip}, Dst: {src_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {target_port}, Dst Port: {client_port}, Seq: {server_seq}, Ack: {client_seq + 1}, Len: 0",
                    "fields": [
                        f"Source Port: {target_port}",
                        f"Destination Port: {client_port}",
                        f"Sequence Number: {server_seq}",
                        f"Acknowledgment Number: {client_seq + 1}",
                        "Header Length: 32 bytes (8)",
                        *flags_field,
                        "Window: 65160",
                        "Options: (12 bytes) MSS=1460, SACK permitted, Timestamps",
                    ],
                },
            ],
            "hex": hex_data,
        }

    if act == "ack":
        info = f"{client_port} → {target_port} [ACK] Seq={client_seq + 1} Ack={server_seq + 1} Win=64240 Len=0"
        summary = f"Step 3 (ACK Action): Client acknowledges server's SYN (Ack={server_seq + 1}). Handshake completed; TCP connection is ESTABLISHED!"
        flags_field = [
            "Flags: 0x0010 (ACK)",
            "  .... .... 1... = Acknowledgment: Set (1)",
            "  .... .... ...0 = Syn: Not set (0)",
            "  [Connection State: ESTABLISHED]",
        ]
        hex_data = (
            "001a2b3c4dfe001a2b3c4d010800450000281a4c400040067c62c0a8010ac0a80164"
            + f"{client_port:04x}{target_port:04x}"
            + "a9d570de54b219795010faf03f910000"
        )
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": 54,
            "info": info,
            "stage": "ACK",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                {"name": "Ethernet II, Src: PC1, Dst: Server", "fields": ["Type: IPv4 (0x0800)"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}, Seq: {client_seq + 1}, Ack: {server_seq + 1}, Len: 0",
                    "fields": [
                        f"Source Port: {client_port}",
                        f"Destination Port: {target_port}",
                        f"Sequence Number: {client_seq + 1}",
                        f"Acknowledgment Number: {server_seq + 1}",
                        "Header Length: 20 bytes (5)",
                        *flags_field,
                        "Window: 64240",
                        "[TCP Connection State: ESTABLISHED]",
                    ],
                },
            ],
            "hex": hex_data,
        }

    if act == "data":
        encoded = payload.encode("utf-8")
        payload_hex = encoded.hex()
        data_len = len(encoded)
        total_len = 54 + data_len
        info = f"{client_port} → {target_port} [PSH, ACK] Seq={client_seq + 1} Ack={server_seq + 1} Len={data_len} [Data: \"{payload}\"]"
        summary = f"Step 4 (DATA Action): Client transmits {data_len} bytes of application payload to Server over the ESTABLISHED connection."
        hex_data = (
            "001a2b3c4dfe001a2b3c4d0108004500"
            + f"{40 + data_len:04x}"
            + "1a4d400040067c49c0a8010ac0a80164"
            + f"{client_port:04x}{target_port:04x}"
            + "a9d570de54b219795018faf08a1c0000"
            + payload_hex
        )
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": total_len,
            "info": info,
            "stage": "DATA",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: {total_len} bytes on wire", "fields": [f"Frame Length: {total_len} bytes"]},
                {"name": "Ethernet II, Src: PC1, Dst: Server", "fields": ["Type: IPv4 (0x0800)"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)", f"Total Length: {40 + data_len}"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}, Seq: {client_seq + 1}, Ack: {server_seq + 1}, Len: {data_len}",
                    "fields": [
                        "Flags: 0x0018 (PSH, ACK)",
                        "  .... .... 1... = Acknowledgment: Set",
                        "  .... ...1 .... = Push: Set",
                        f"[TCP Payload ({data_len} bytes): \"{payload}\"]",
                    ],
                },
            ],
            "hex": hex_data,
        }

    if act == "fin":
        info = f"{client_port} → {target_port} [FIN, ACK] Seq={client_seq + 1} Ack={server_seq + 1} Win=64240 Len=0"
        summary = f"Teardown Action: Client sends FIN to terminate bidirectional connection (Client moves to FIN_WAIT_1)."
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": 54,
            "info": info,
            "stage": "FIN",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}",
                    "fields": [
                        "Flags: 0x0011 (FIN, ACK)",
                        "  .... .... 1... = Acknowledgment: Set",
                        "  .... .... .... 1 = Fin: Set (1)",
                        "[Client State: FIN_WAIT_1]",
                        "[Teardown Initiated]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000281a4e400040067c60c0a8010ac0a80164" + f"{client_port:04x}{target_port:04x}" + "a9d570df54b219795011faf03f900000",
        }

    if act == "server_ack":
        data_len = int(params.get("data_len", 0))
        next_ack = client_seq + 1 + data_len
        info = f"{target_port} → {client_port} [ACK] Seq={server_seq + 1} Ack={next_ack} Win=65160 Len=0"
        summary = f"Server acknowledges {data_len} bytes of application payload received from client (Ack={next_ack})."
        return {
            "no": packet_no,
            "time": t_str,
            "source": dst_ip,
            "destination": src_ip,
            "protocol": "TCP",
            "length": 54,
            "info": info,
            "stage": "SERVER-ACK",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: {dst_ip}, Dst: {src_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {target_port}, Dst Port: {client_port}",
                    "fields": [
                        "Flags: 0x0010 (ACK)",
                        "  .... .... 1... = Acknowledgment: Set",
                        f"Sequence Number: {server_seq + 1}",
                        f"Acknowledgment Number: {next_ack} (Acknowledges payload)",
                        "[TCP Connection State: ESTABLISHED]",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe0800450000284d14400040064996c0a80164c0a8010a" + f"{target_port:04x}{client_port:04x}" + "54b21979a9d570ef5010fe884a210000",
        }

    if act == "server_fin":
        info = f"{target_port} → {client_port} [FIN, ACK] Seq={server_seq + 1} Ack={client_seq + 2} Win=65160 Len=0"
        summary = "Teardown Action: Server acknowledges client FIN and sends its own FIN to close server half of socket."
        return {
            "no": packet_no,
            "time": t_str,
            "source": dst_ip,
            "destination": src_ip,
            "protocol": "TCP",
            "length": 54,
            "info": info,
            "stage": "SERVER-FIN",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: {dst_ip}, Dst: {src_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {target_port}, Dst Port: {client_port}",
                    "fields": [
                        "Flags: 0x0011 (FIN, ACK)",
                        "  .... .... 1... = Acknowledgment: Set",
                        "  .... .... .... 1 = Fin: Set (1)",
                        "[Server State: LAST_ACK]",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe0800450000284d15400040064995c0a80164c0a8010a" + f"{target_port:04x}{client_port:04x}" + "54b21979a9d570e05011fe883f8f0000",
        }

    if act == "client_fin_ack":
        info = f"{client_port} → {target_port} [ACK] Seq={client_seq + 2} Ack={server_seq + 2} Win=64240 Len=0"
        summary = "Teardown Complete: Client acknowledges server FIN. Sockets gracefully CLOSED."
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": 54,
            "info": info,
            "stage": "CLOSED",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}",
                    "fields": [
                        "Flags: 0x0010 (ACK)",
                        "  .... .... 1... = Acknowledgment: Set",
                        "[Connection State: CLOSED]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000281a50400040067c5ec0a8010ac0a80164" + f"{client_port:04x}{target_port:04x}" + "a9d570e054b2197a5010faf03f8f0000",
        }

    if act == "udp":
        u_payload = str(params.get("payload", payload or "NetLab UDP datagram"))
        encoded = u_payload.encode("utf-8")
        data_len = len(encoded)
        u_len = 8 + data_len
        info = f"{client_port} → {target_port} Len={data_len} [UDP Datagram: \"{u_payload}\"]"
        summary = f"Interactive UDP Action: Client sends {data_len}-byte connectionless datagram with zero handshake overhead."
        hex_data = (
            "001a2b3c4dfe001a2b3c4d0108004500"
            + f"{28 + data_len:04x}"
            + "1f2a400040117b4ec0a8010ac0a80164"
            + f"{client_port:04x}{target_port:04x}"
            + f"{u_len:04x}"
            + "0000"
            + encoded.hex()
        )
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "UDP",
            "length": 42 + data_len,
            "info": info,
            "stage": "UDP-SEND",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: {42 + data_len} bytes on wire", "fields": [f"Frame Length: {42 + data_len} bytes"]},
                {"name": "Ethernet II, Src: PC1, Dst: Server", "fields": ["Type: IPv4 (0x0800)"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: UDP (17)"]},
                {
                    "name": f"User Datagram Protocol, Src Port: {client_port}, Dst Port: {target_port}",
                    "fields": [
                        f"Source Port: {client_port}",
                        f"Destination Port: {target_port}",
                        f"Length: {u_len}",
                        "Checksum: 0x0000 (none)",
                        f"[UDP Payload ({data_len} bytes): \"{u_payload}\"]",
                    ],
                },
            ],
            "hex": hex_data,
        }

    if act == "dns_query":
        query_name = str(params.get("name", "example.com")).strip() or "example.com"
        info = f"Standard query 0x1a2b A {query_name}"
        summary = f"Interactive DNS Action: Client queries DNS resolver for IPv4 Address (Type A) of {query_name}."
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": "192.168.1.1",
            "protocol": "DNS",
            "length": 74,
            "info": info,
            "stage": "DNS-QUERY",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 74 bytes on wire", "fields": ["Frame Length: 74 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: 192.168.1.1", "fields": ["Protocol: UDP (17)"]},
                {"name": "User Datagram Protocol, Src Port: 53210, Dst Port: 53", "fields": ["Length: 40"]},
                {
                    "name": f"Domain Name System (query)",
                    "fields": [
                        "Transaction ID: 0x1a2b",
                        "Flags: 0x0100 Standard query",
                        "Questions: 1",
                        f"Queries: {query_name}: type A, class IN",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe08004500003c0001400040117cc0c0a8010ac0a80101cfda0035002800001a2b01000001000000000000076578616d706c6503636f6d0000010001",
        }

    if act == "dns_response":
        query_name = str(params.get("name", "example.com")).strip() or "example.com"
        info = f"Standard query response 0x1a2b A {query_name} A 93.184.216.34"
        summary = f"Interactive DNS Action: Resolver replies with resolved IPv4 address 93.184.216.34 (TTL 300s)."
        return {
            "no": packet_no,
            "time": t_str,
            "source": "192.168.1.1",
            "destination": src_ip,
            "protocol": "DNS",
            "length": 90,
            "info": info,
            "stage": "DNS-RESP",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 90 bytes on wire", "fields": ["Frame Length: 90 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: 192.168.1.1, Dst: {src_ip}", "fields": ["Protocol: UDP (17)"]},
                {"name": "User Datagram Protocol, Src Port: 53, Dst Port: 53210", "fields": ["Length: 56"]},
                {
                    "name": f"Domain Name System (response)",
                    "fields": [
                        "Transaction ID: 0x1a2b",
                        "Flags: 0x8180 Standard query response, No error",
                        f"Queries: {query_name}: type A, class IN",
                        f"Answers: {query_name}: type A, class IN, addr 93.184.216.34",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d0108004500004c0002400040117cb0c0a80101c0a8010a0035cfda003800001a2b81800001000100000000076578616d706c6503636f6d0000010001c00c000100010000012c00045db8d822",
        }

    if act == "arp_request":
        target = str(params.get("target_ip", "192.168.1.50"))
        info = f"Who has {target}? Tell {src_ip}"
        summary = f"Interactive ARP Action: PC1 broadcasts ARP request on Ethernet to resolve MAC address for {target}."
        return {
            "no": packet_no,
            "time": t_str,
            "source": "00:1a:2b:3c:4d:01",
            "destination": "ff:ff:ff:ff:ff:ff",
            "protocol": "ARP",
            "length": 42,
            "info": info,
            "stage": "ARP-REQ",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 42 bytes on wire", "fields": ["Frame Length: 42 bytes"]},
                {"name": "Ethernet II, Src: 00:1a:2b:3c:4d:01, Dst: Broadcast (ff:ff:ff:ff:ff:ff)", "fields": ["Type: ARP (0x0806)"]},
                {
                    "name": "Address Resolution Protocol (request)",
                    "fields": [
                        "Hardware type: Ethernet (1)",
                        "Protocol type: IPv4 (0x0800)",
                        "Opcode: request (1)",
                        f"Sender IP: {src_ip}",
                        f"Target IP: {target}",
                    ],
                },
            ],
            "hex": "ffffffffffff001a2b3c4d0108060001080006040001001a2b3c4d01c0a8010a000000000000c0a80132",
        }

    if act == "arp_reply":
        target = str(params.get("target_ip", "192.168.1.50"))
        info = f"{target} is at 00:1a:2b:3c:4d:fe"
        summary = f"Interactive ARP Action: Server unicasts ARP reply to PC1: MAC address is 00:1a:2b:3c:4d:fe."
        return {
            "no": packet_no,
            "time": t_str,
            "source": "00:1a:2b:3c:4d:fe",
            "destination": "00:1a:2b:3c:4d:01",
            "protocol": "ARP",
            "length": 42,
            "info": info,
            "stage": "ARP-REP",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 42 bytes on wire", "fields": ["Frame Length: 42 bytes"]},
                {"name": "Ethernet II, Src: 00:1a:2b:3c:4d:fe, Dst: 00:1a:2b:3c:4d:01", "fields": ["Type: ARP (0x0806)"]},
                {
                    "name": "Address Resolution Protocol (reply)",
                    "fields": [
                        "Opcode: reply (2)",
                        f"Sender IP: {target}",
                        "Sender MAC: 00:1a:2b:3c:4d:fe",
                        f"Target IP: {src_ip}",
                        "Target MAC: 00:1a:2b:3c:4d:01",
                    ],
                },
            ],
            "hex": "001a2b3c4d01001a2b3c4dfe08060001080006040002001a2b3c4dfec0a80132001a2b3c4d01c0a8010a",
        }

    if act == "rst":
        info = f"{client_port} → {target_port} [RST] Seq={client_seq + 1} Win=0 Len=0"
        summary = "Connection Abort Action: TCP RST transmitted to immediately teardown socket without waiting for normal close."
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": 54,
            "info": info,
            "stage": "RST",
            "summary": summary,
            "layers": [
                {"name": f"Frame {packet_no}: 54 bytes on wire", "fields": ["Frame Length: 54 bytes"]},
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}",
                    "fields": [
                        "Flags: 0x0004 (RST)",
                        "  .... .... ..1. = Reset: Set (1)",
                        "[Connection Aborted: Sockets moved to CLOSED immediately]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d010800450000281a4f400040067c5fc0a8010ac0a80164" + f"{client_port:04x}{target_port:04x}" + "a9d570e000000000500400001e3b0000",
        }

    if act == "retransmit":
        info = f"{client_port} → {target_port} [TCP Retransmission] [SYN] Seq={client_seq} Win=64240 Len=0"
        summary = "Packet Loss Simulation: ACK was dropped on the wire. Retransmission Timer (RTO 1.0s) expired; client retransmits packet."
        return {
            "no": packet_no,
            "time": t_str,
            "source": src_ip,
            "destination": dst_ip,
            "protocol": "TCP",
            "length": 74,
            "info": info,
            "stage": "Retransmit",
            "summary": summary,
            "layers": [
                {
                    "name": f"Frame {packet_no}: 74 bytes on wire",
                    "fields": [
                        "Frame Length: 74 bytes",
                        "[Expert Info (Warning/Sequence): This frame is a suspected retransmission]",
                    ],
                },
                {"name": f"Internet Protocol Version 4, Src: {src_ip}, Dst: {dst_ip}", "fields": ["Protocol: TCP (6)"]},
                {
                    "name": f"Transmission Control Protocol, Src Port: {client_port}, Dst Port: {target_port}",
                    "fields": [
                        "Flags: 0x0002 (SYN)",
                        "[TCP Retransmission: RTO Timer Expired]",
                        "[Suspected packet drop simulated by user action]",
                    ],
                },
            ],
            "hex": "001a2b3c4dfe001a2b3c4d0108004500003c1a4b400040067c4fc0a8010ac0a80164" + f"{client_port:04x}{target_port:04x}" + "a9d570dd00000000a002faf02b4a0000020405b40402080a000f4e900000000001030307",
        }

    # Fallback
    return {
        "no": packet_no,
        "time": t_str,
        "source": src_ip,
        "destination": dst_ip,
        "protocol": "TCP",
        "length": 60,
        "info": f"{client_port} → {target_port} [{act.upper()}]",
        "stage": act.upper(),
        "summary": f"Executed action {act}",
        "layers": [],
        "hex": "00" * 60,
    }

