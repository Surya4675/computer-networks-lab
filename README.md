# Computer Networks Interactive Lab (NetLab)

A classroom-ready web application combining interactive presentation content and a Python-powered network simulator. The interface features a clean, high-contrast academic technical-lab design with dedicated presentation tools, live topology modeling, protocol event timelines, and diagnostic network commands.

🌐 **Live Deployment:** [https://computer-networks-lab.onrender.com](https://computer-networks-lab.onrender.com)  
📦 **GitHub Repository:** [https://github.com/Surya4675/computer-networks-lab](https://github.com/Surya4675/computer-networks-lab)

---

## Project Structure

```text
computer-networks-lab/
├── app.py                  # Core Flask backend & Python simulation engine
├── requirements.txt        # Python production dependencies (Flask, Gunicorn)
├── Procfile                # WSGI process configuration for Render/cloud deployment
├── render.yaml             # Render infrastructure blueprint (auto-deploy spec)
├── run_windows.bat         # One-click Windows local launcher script
├── README.md               # Project documentation and usage guide
├── .gitignore              # Git ignore rules for virtualenvs, caches, and OS files
├── static/
│   ├── css/
│   │   └── styles.css      # Academic lab styling, presentation layout & themes
│   └── js/
│       └── app.js          # Interactive UI logic, topology rendering & controls
├── templates/
│   └── index.html          # Semantic HTML5 single-page application template
└── tests/
    └── test_simulator.py   # Unit test suite for simulator endpoints & models
```

---

## Features

- **Topic-Led Presentation:** Interactive modules covering network commands, protocols, LAN architecture, server setup, and routing.
- **Dedicated Presentation Mode:** Fullscreen-ready slide navigation with previous/next controls, keyboard navigation (`←`/`→`, `PageUp`/`PageDown`), and side-by-side interactive console.
- **Python-Backed Console:** Secure in-app command runner with allowlisted diagnostic utilities (`ping`, `ipconfig`, `tracert`, `nslookup`, `arp -a`, `route print`, `netstat`, `curl`, `dhcp renew`, and `help`).
- **Interactive LAN Topology:** Click hosts to assign command source, edit IPv4 addresses, and toggle devices online/offline with real-time SVG link highlights.
- **Protocol Flow Demonstrations:** Step-by-step event sequences for TCP (3-way handshake), UDP (datagrams), HTTP (GET request/response), DNS (resolution), DHCP (DORA), and ARP.
- **Server & DNS Service Toggles:** Test realistic client-side failures by toggling web port 8080 or DNS resolution on and off.
- **IPv4 Routing & Trace Route:** Interactive routing table and multi-hop traceroute simulation toward remote destinations.
- **Knowledge Check Quiz:** 4-question interactive recap with immediate feedback, scoring, and explanation.

---

## Requirements

- Python 3.10+
- Dependencies listed in `requirements.txt`:
  - `Flask>=3.0,<4.0`
  - `gunicorn>=21.2.0`

---

## How to Run Locally

### Option A: One-Click Launcher (Windows)
Double-click `run_windows.bat` in the project root folder. It checks dependencies, starts the Flask server, and automatically opens `http://127.0.0.1:5000` in your default browser.

### Option B: PowerShell / Terminal

```powershell
# 1. Navigate to the project directory
cd computer-networks-lab

# 2. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\Activate.ps1    # On Linux/macOS: source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the application
python app.py
```

Open **http://127.0.0.1:5000** in your browser. Press `Ctrl + C` in the terminal to stop the server.

---

## Running Automated Tests

Run the included unit test suite using Python's built-in `unittest` runner:

```bash
python -m unittest discover tests
```

Tests validate command parsing, unreachable host handling, unknown command isolation, duplicate IP rejection, server toggle states, protocol sequence generations, state retrieval, and full system reset.

---

## Classroom Presentation Mode Controls

- **Start / Exit Presentation:** Click the `📺 Start Presentation` button in the top navigation bar or press `P`.
- **Next Topic:** Press `→` (Right Arrow) or `PageDown`.
- **Previous Topic:** Press `←` (Left Arrow) or `PageUp`.
- **Show / Hide Live Console:** Press `C` while presenting to toggle between side-by-side live demonstration and full-slide views.
- **Exit Presentation:** Press `Esc` or click `Exit Presentation ✕`.

---

## Console Command Reference

| Command | Category | Description |
| :--- | :--- | :--- |
| `ping <ip>` | Connectivity | Sends ICMP echo requests and reports reachability and round-trip times. |
| `ipconfig` | Configuration | Displays local IP address, subnet mask, default gateway, and status. |
| `nslookup <domain>` | DNS | Resolves local and sample domain names using the simulated DNS table. |
| `tracert <ip>` | Routing | Simulates router hops and latency toward the destination IP. |
| `arp -a` | Data Link | Displays the local Address Resolution Protocol IP-to-MAC mapping cache. |
| `route print` | Network Layer | Prints the active IPv4 routing table for the selected host. |
| `netstat` | Transport | Displays example active TCP and UDP connection states. |
| `curl <url>` | Application | Issues a simulated HTTP GET request to the local web server on port 8080. |
| `dhcp renew` | Configuration | Simulates the 4-part DORA exchange for dynamic address assignment. |
| `help` | Reference | Lists all supported simulator commands. |
| `clear` | Terminal | Clears the terminal output buffer. |

---

## Deployment Configuration (Render)

This project is configured for one-click continuous deployment on Render:

- **Procfile:** Declares `web: gunicorn app:app` for production WSGI serving.
- **render.yaml:** Declares the Python runtime environment, build command (`pip install -r requirements.txt`), and auto-deploy settings.
- **Port Handling:** `app.py` dynamically binds to `os.environ.get("PORT", 5000)` and listens on `0.0.0.0`.

---

## Important Simulation Note

This application is designed specifically for academic and educational demonstrations. The command parser is written in pure Python and never delegates commands to the operating system shell. Output timings, packet traces, and connection records are deterministic teaching models. No real network packets are transmitted.
