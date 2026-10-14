# Computer Networks Interactive Lab

A small classroom-ready web app that combines presentation content and an interactive Python-powered network simulator. The interface uses a restrained navy, slate, off-white, and blue palette (no full-screen gradients).

## Features

- Topic-led presentation content for commands, protocols, LAN setup, server setup, and routing.
- Dedicated Classroom Presentation Mode with fullscreen support, Previous/Next slide controls, and keyboard navigation (`←`/`→`, `PageUp`/`PageDown`, `P` to toggle, `C` to show/hide console, `Esc` to exit).
- Projector-first academic technical-lab typography: large headings (36–44px), section titles (28–32px), body explanations (21–24px), navigation (18–20px), and console text (19–21px) with high foreground/background contrast.
- Python-backed command console with a strict allowlist (`ping`, `ipconfig`, `tracert`, `nslookup`, `arp -a`, `route print`, `netstat`, `curl`, `dhcp renew`, and `help`).
- Interactive topology: edit lab IP addresses and bring devices online/offline; test reachability from the console.
- Protocol walkthroughs for TCP, UDP, HTTP, DNS, DHCP, and ARP with event timelines.
- Server and DNS service toggles to demonstrate success and failure cases.
- Routing table explanation and trace-route example.
- Short knowledge-check quiz, responsive layout, keyboard-friendly controls, reset lab button.

## Requirements

- Python 3.10+
- Flask (installed with `pip install -r requirements.txt`)

## Run locally (Windows PowerShell)

```powershell
cd computer-networks-lab
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** in your browser. Stop the server with `Ctrl+C`.

## Console examples

```text
help
ipconfig
ping 192.168.1.11
ping 192.168.1.222
nslookup server.local
tracert 203.0.113.25
arp -a
route print
curl http://server.local
dhcp renew
```

## Classroom presentation controls

- **Start / Exit Presentation:** Click the `Start Presentation` / `Exit Presentation` button in the top navigation bar, or press `P`.
- **Next Topic:** Press `→` (Right Arrow) or `PageDown`.
- **Previous Topic:** Press `←` (Left Arrow) or `PageUp`.
- **Show / Hide Live Console:** Press `C` while in presentation mode to toggle between side-by-side demonstration and full-slide views.
- **Exit Presentation:** Press `Esc` or click `Exit Presentation ✕`.

## Important simulation note

This is a teaching simulator. The command parser is implemented in Python and never passes input to a system shell. Outputs, packet steps, hop timings, DNS answers, and connection states are illustrative model results; they do not represent real network traffic. IP and service toggles affect the in-app model only. The app is designed for localhost classroom demos, not as a production network management service.

## Functional requirements covered

1. Present topic-specific explanations and examples.
2. Accept supported console commands and return clear output.
3. Show a LAN topology and current IP/status configuration.
4. Validate IP addresses and reject duplicate IP assignments.
5. Demonstrate protocol sequences and event-level explanations.
6. Demonstrate server/DNS success and failure by switching services.
7. Show a routing table and a simulated trace route.
8. Allow a quiz interaction and reset the lab to default state.

## Non-functional requirements covered

- **Usability:** clear navigation, presets, copyable terminal text, direct feedback, keyboard support.
- **Reliability:** deterministic examples, input validation, explicit errors, reset control.
- **Safety:** allowlisted simulator commands only; no arbitrary shell execution or real packet transmission.
- **Performance:** lightweight HTML/CSS/JS and small Flask JSON endpoints.
- **Maintainability:** separate Flask logic, template, stylesheet, and front-end JavaScript.
- **Portability:** runs with Python and Flask on Windows, macOS, and Linux.
- **Responsiveness:** layout adapts to laptop, tablet, and mobile widths.
- **Accessibility:** semantic controls, visible focus styles, status labels, and reduced-motion support.
