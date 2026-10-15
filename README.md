# NetLab — Computer Networks Interactive Lab

A Material Design (Material 3 / `@material/web`) teaching lab for computer
networks. The command console runs **real, allow-listed diagnostics on the host
that serves the application**, while the LAN, protocol and routing modules
provide guided conceptual models for topics that cannot safely be exercised on a
shared machine.

🌐 **Live Deployment:** [https://computer-networks-lab.onrender.com](https://computer-networks-lab.onrender.com)
📦 **GitHub Repository:** [https://github.com/Surya4675/computer-networks-lab](https://github.com/Surya4675/computer-networks-lab)

---

## How commands work

The console is not a simulator. Typing `ping 1.1.1.1` runs the real `ping`
binary on the server and streams its actual output back to the browser.

### Security model (`executor.py`)

- **Allow-list only.** Only the commands in `executor.REGISTRY` can run. Anything
  else is refused before a process is created.
- **Validated arguments.** Hosts, counts and URLs are checked against strict
  patterns; a host can never start with `-`, so flags cannot be injected.
- **No shell.** Commands are executed with `subprocess.run(argv, shell=False)`,
  so shell metacharacters are inert.
- **Bounded.** Every command has a timeout and its output is size-capped.
- **Cross-platform.** Windows and Linux/macOS map to the appropriate binaries
  (`ipconfig`↔`ip addr`, `tracert`↔`traceroute`, `netstat`↔`ss`, and so on).
- **Deliberately disabled.** `dhcp renew` would reconfigure the host's own
  interface, so it is refused with an explanation.

Real commands: `ping`, `ipconfig`, `tracert`, `nslookup`, `arp -a`,
`route print`, `netstat`, `curl`, `help`.

---

## Project Structure

```text
computer-networks-lab/
├── app.py                    # Flask app: real-exec API + teaching-model API
├── executor.py               # Allow-listed, sandboxed real command engine
├── requirements.txt          # Runtime deps (Flask, gunicorn)
├── requirements-dev.txt      # Dev deps (pytest)
├── pytest.ini                # pytest configuration
├── package.json              # Node test configuration (no runtime deps)
├── conftest.py               # Makes the repo importable for pytest
├── Procfile                  # Render/Heroku WSGI config
├── Dockerfile                # Container with the real diagnostics installed
├── .dockerignore
├── render.yaml               # Render blueprint (Docker runtime)
├── run_windows.bat           # One-click Windows launcher
├── README.md
├── static/
│   ├── css/styles.css        # Material 3 theme tokens + layout
│   └── js/
│       ├── app.js            # UI logic (Material Web Components)
│       └── lib.js            # Pure helpers (unit-tested)
├── templates/index.html      # Material 3 single-page template
└── tests/
    ├── test_api.py           # Flask endpoint tests
    ├── test_executor.py      # Executor tests
    └── js/lib.test.js        # Front-end logic tests (node --test)
```

---

## Features

- **Material 3 interface** built on Google's official `@material/web` components
  (buttons, text fields, selects, switches, tabs, chips, radio, progress,
  snackbar) themed with `--md-sys-color-*` tokens.
- **Real diagnostics console** with command history, quick-command chips, a
  session log and streamed host output.
- **Protocol models** for TCP, UDP, HTTP, DNS, DHCP and ARP.
- **Interactive LAN model** with editable IPv4 addresses, device on/off switches
  and a live SVG topology.
- **Server checks** that run real `curl` and `nslookup` against a URL or name.
- **Routing** that runs the real routing table command and a real traceroute.
- **Knowledge-check quiz** with immediate feedback and scoring.
- **Classroom presentation mode** (Start/Stop, previous/next topic, hide console).

---

## Requirements

- Python 3.10+
- `Flask>=3.0,<4.0` and `gunicorn>=21.2.0` (see `requirements.txt`)
- Node.js 20+ (only for running the front-end tests)

The browser loads `@material/web` from a CDN, so no build step or `npm install`
is required.

---

## Run locally

### Option A — one-click (Windows)
Double-click `run_windows.bat`. It checks dependencies, starts Flask and opens
`http://127.0.0.1:5000`.

### Option B — terminal

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000**.

---

## Tests

Backend (pytest):

```powershell
pip install -r requirements-dev.txt
pytest
```

Front-end logic (Node's built-in runner, no dependencies):

```powershell
npm test          # or: node --test "tests/js/*.test.js"
```

---

## API

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/host` | Host name, OS and Python version of the lab host. |
| `GET` | `/api/commands` | The allow-listed command reference. |
| `POST` | `/api/execute` | Run one allow-listed command for real. |
| `GET` | `/api/state` | The LAN teaching model. |
| `POST` | `/api/device` | Update a device in the LAN model. |
| `POST` | `/api/simulate` | Step a protocol model (TCP/UDP/HTTP/DNS/DHCP/ARP). |
| `POST` | `/api/reset` | Reset the LAN model. |

---

## Presentation mode

- **Start / exit:** the `Start Presentation` button, or press `P` / `Esc`.
- **Next / previous:** `→` / `←`, or `PageDown` / `PageUp`.
- **Show / hide console:** press `C`.

---

## Deployment (Render)

The app is deployed as a **Docker** service, because the real diagnostics
(`ping`, `traceroute`, `ip`/`ifconfig`, `arp`, `route`, `netstat`, `nslookup`,
`curl`) are OS packages that Render's native runtimes do not provide.

- **`Dockerfile`:** `python:3.12-slim-bookworm` plus `iputils-ping`, `traceroute`,
  `iproute2`, `net-tools`, `dnsutils` and `curl`.
- **`render.yaml`:** `runtime: docker` with `dockerfilePath: ./Dockerfile`.
- **Port:** the container binds `gunicorn` to `0.0.0.0:${PORT:-10000}` and Flask
  reads `os.environ.get("PORT", 5000)` locally.
- **Capabilities:** the container runs as root and Docker grants `CAP_NET_RAW`,
  so the raw-socket `ping`/`traceroute` commands work. If a host ever drops that
  capability, NetLab reports the failure instead of hanging.

> Changing an existing Render service from the native Python runtime to Docker is
> not an in-place change — delete the old `cnlab` service (or recreate the
> Blueprint) so it rebuilds from the `Dockerfile`.


---

## Safety note

Only the fixed, read-only diagnostics listed above can run, with validated
arguments, no shell and a timeout. The LAN and protocol modules are conscious
teaching models — they are labelled as such in the interface and never touch the
host network.
