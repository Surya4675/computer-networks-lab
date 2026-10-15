'use strict';

import {
  escapeHtml,
  tokenize,
  pushHistory,
  navigateHistory,
  formatResultText,
  kindClass,
  quizFeedback,
  summarizeHosts,
  formatHexDump,
  filterPackets,
  formatWiresharkAsciiTable,
  getProtocolColorClass,
} from './lib.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VIEWS = [
  { id: 'overview', title: 'Overview' },
  { id: 'commands', title: 'Commands' },
  { id: 'protocols', title: 'Protocols' },
  { id: 'lan', title: 'LAN model' },
  { id: 'server', title: 'Server' },
  { id: 'routing', title: 'Routing' },
  { id: 'quiz', title: 'Quiz' },
];

const PROTOCOL_KEYS = ['tcp', 'udp', 'http', 'dns', 'dhcp', 'arp'];

const protocolData = {
  tcp: { name: 'Transmission Control Protocol', badge: 'TCP', summary: 'TCP provides a reliable, ordered byte stream and establishes a connection before application data is exchanged.', facts: [['Connection', 'Connection-oriented'], ['Delivery', 'Reliable & ordered'], ['Common uses', 'Web, email, file transfer']], title: 'TCP three-way handshake', description: 'How a TCP connection is established before data flows.', scenario: 'tcp' },
  udp: { name: 'User Datagram Protocol', badge: 'UDP', summary: 'UDP sends independent datagrams without a handshake. Overhead is low, but delivery and order are not guaranteed.', facts: [['Connection', 'Connectionless'], ['Delivery', 'Best effort'], ['Common uses', 'DNS, live media, games']], title: 'UDP datagram delivery', description: 'Follow a datagram from sender to receiver.', scenario: 'udp' },
  http: { name: 'Hypertext Transfer Protocol', badge: 'HTTP', summary: 'HTTP defines the request and response messages used by web clients and servers.', facts: [['Purpose', 'Web request / response'], ['Typical port', '80 (HTTP)'], ['Secure variant', 'HTTPS uses TLS']], title: 'HTTP request / response', description: 'Trace a request from client to server.', scenario: 'http' },
  dns: { name: 'Domain Name System', badge: 'DNS', summary: 'DNS maps human-readable names to records such as IP addresses so clients can reach the right server.', facts: [['Purpose', 'Name resolution'], ['Typical port', '53'], ['Record used here', 'A record → IPv4']], title: 'DNS name resolution', description: 'Look up a name and observe the A-record response.', scenario: 'dns' },
  dhcp: { name: 'Dynamic Host Configuration Protocol', badge: 'DHCP', summary: 'DHCP automatically provides hosts with an IP address and related settings using the DORA exchange.', facts: [['Purpose', 'Automatic IP setup'], ['Ports', 'UDP 67 / 68'], ['Sequence', 'DORA']], title: 'DHCP address assignment', description: 'Step through the four-part DORA exchange.', scenario: 'dhcp' },
  arp: { name: 'Address Resolution Protocol', badge: 'ARP', summary: 'On an IPv4 Ethernet LAN, ARP discovers the MAC address that belongs to a local IPv4 address.', facts: [['Purpose', 'IPv4 → MAC mapping'], ['Scope', 'Local link'], ['Messages', 'Request / reply']], title: 'ARP address resolution', description: 'Watch a host resolve a MAC address on the LAN.', scenario: 'arp' },
};

const quizQuestions = [
  { q: 'Which command is commonly used to test whether an IP host is reachable?', options: ['ipconfig', 'ping', 'arp -a', 'netstat'], answer: 1, explain: 'Ping tests reachability using echo request and echo reply messages.' },
  { q: 'Which protocol translates a domain name such as example.com into an IP address?', options: ['DHCP', 'ARP', 'DNS', 'TCP'], answer: 2, explain: 'DNS retrieves records that associate names with addresses.' },
  { q: 'Which device forwards packets between different IP networks?', options: ['Switch', 'Router', 'Repeater', 'Hub'], answer: 1, explain: 'Routers use IP addresses and routing tables to choose the next hop.' },
  { q: 'What does DHCP commonly provide to a client?', options: ['An automatic IP configuration', 'A guaranteed TCP connection', 'A MAC address for every host', 'A web page'], answer: 0, explain: 'DHCP can assign an IP address, subnet mask, gateway and DNS settings.' },
];

const NODE_META = {
  Router: { icon: 'router', label: 'Router / Switch', pos: { left: '50%', top: '16%' } },
  PC1: { icon: 'computer', label: 'PC 1', pos: { left: '15%', top: '80%' } },
  PC2: { icon: 'computer', label: 'PC 2', pos: { left: '50%', top: '80%' } },
  Server: { icon: 'dns', label: 'Server', pos: { left: '85%', top: '80%' } },
};

let labState = null;
let hostInfo = null;
let currentViewIndex = 0;
let currentProtocol = 'tcp';
let commandHistory = [];
let historyIndex = 0;
let sessionLog = [];
let quizIndex = 0;
let quizScore = 0;
let quizSelection = null;
let quizChecked = false;
let terminalBuffer = 'NETLAB REAL CONSOLE\nType “help” to list the allow-listed commands.\nCommands execute on the host that runs this application.\n';
let suppressTabEvent = false;
let snackbarBusy = false;

// --------------------------------------------------------------------------- //
// Backend communication
// --------------------------------------------------------------------------- //
function setBackendStatus(mode) {
  const chip = $('#backend-status');
  const dot = $('#backend-status-dot');
  const label = $('#backend-status-label');
  const consoleDot = $('#console-status-dot');
  const consoleLabel = $('#console-status-label');
  const text = mode === 'online' ? 'Backend online' : mode === 'waking' ? 'Waking backend…' : 'Backend offline';
  if (label) label.textContent = mode === 'online' ? 'Python host' : text;
  if (consoleLabel) consoleLabel.textContent = mode === 'online' ? 'Ready' : text;
  [dot, consoleDot].forEach((node) => {
    if (!node) return;
    node.classList.toggle('offline', mode === 'offline');
    node.classList.toggle('waking', mode === 'waking');
  });
  if (chip) chip.classList.toggle('offline', mode === 'offline');
}

async function api(path, payload, retries = 1) {
  const options = payload === undefined
    ? {}
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  try {
    const response = await fetch(path, options);
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      const message = (data && (data.error || data.message)) || `Request failed (${response.status}).`;
      const error = new Error(message);
      error.data = data;
      error.status = response.status;
      throw error;
    }
    setBackendStatus('online');
    return data;
  } catch (err) {
    const network = !err.data && (err.name === 'TypeError' || String(err.message).toLowerCase().includes('fetch'));
    if (network && retries > 0) {
      setBackendStatus('waking');
      await delay(1500);
      return api(path, payload, retries - 1);
    }
    if (network) setBackendStatus('offline');
    throw err;
  }
}

function toast(message) {
  const snackbar = $('#snackbar');
  if (!snackbar || typeof snackbar.show !== 'function') {
    console.warn(message);
    return;
  }
  snackbar.textContent = message;
  if (snackbarBusy) return;
  snackbarBusy = true;
  Promise.resolve(snackbar.show()).catch(() => {}).finally(() => { snackbarBusy = false; });
}

// --------------------------------------------------------------------------- //
// Views and presentation mode
// --------------------------------------------------------------------------- //
function switchView(index) {
  if (index < 0 || index >= VIEWS.length) return;
  currentViewIndex = index;
  const view = VIEWS[index];
  $$('.view').forEach((section) => section.classList.toggle('active', section.id === `view-${view.id}`));
  const tabs = $('#module-tabs');
  if (tabs && tabs.activeTabIndex !== index) {
    suppressTabEvent = true;
    tabs.activeTabIndex = index;
    suppressTabEvent = false;
  }
  updatePresentationNav();
  $('#main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (view.id === 'protocols') renderProtocol();
  if (view.id === 'lan') { renderDeviceConfigs(); renderTopology('#lan-topology'); }
}

function updatePresentationNav() {
  const indicator = $('#pres-topic-indicator');
  if (indicator) indicator.textContent = `${currentViewIndex + 1} of ${VIEWS.length} · ${VIEWS[currentViewIndex].title}`;
  const prev = $('#pres-prev-btn');
  const next = $('#pres-next-btn');
  if (prev) prev.disabled = currentViewIndex <= 0;
  if (next) next.disabled = currentViewIndex >= VIEWS.length - 1;
}

function prevTopic() { if (currentViewIndex > 0) switchView(currentViewIndex - 1); }
function nextTopic() { if (currentViewIndex < VIEWS.length - 1) switchView(currentViewIndex + 1); }

function togglePresentationConsole() {
  const hidden = document.body.classList.toggle('pres-hide-console');
  const label = $('#pres-console-label');
  if (label) label.textContent = hidden ? 'Console: hidden' : 'Console: visible';
}

function togglePresentationMode(force) {
  const isOn = document.body.classList.contains('presenter-mode');
  const enable = force !== undefined ? Boolean(force) : !isOn;
  if (enable) {
    document.body.classList.add('presenter-mode');
    document.body.classList.remove('pres-hide-console');
    const label = $('#presentation-label');
    if (label) label.textContent = 'Exit Presentation';
    $('#presentation-mode').setAttribute('aria-pressed', 'true');
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    document.body.classList.remove('presenter-mode');
    document.body.classList.remove('pres-hide-console');
    const label = $('#presentation-label');
    if (label) label.textContent = 'Start Presentation';
    $('#presentation-mode').setAttribute('aria-pressed', 'false');
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
  const consoleLabel = $('#pres-console-label');
  if (consoleLabel) consoleLabel.textContent = 'Console: visible';
  updatePresentationNav();
}

// --------------------------------------------------------------------------- //
// Console
// --------------------------------------------------------------------------- //
function writeTerminal(text) {
  terminalBuffer += text;
  const lines = terminalBuffer.split('\n');
  if (lines.length > 400) terminalBuffer = lines.slice(-400).join('\n');
  const output = $('#terminal-output');
  output.textContent = terminalBuffer;
  output.scrollTop = output.scrollHeight;
}

function clearTerminal() {
  terminalBuffer = 'NETLAB REAL CONSOLE\nConsole cleared. Type “help” for the allow-list.\n';
  $('#terminal-output').textContent = terminalBuffer;
}

function addSession(command, ok) {
  sessionLog.unshift({ command, ok, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  sessionLog = sessionLog.slice(0, 20);
  renderSession();
}

function renderSession() {
  const list = $('#session-list');
  if (!sessionLog.length) {
    list.innerHTML = '<p class="empty">Nothing yet. Run a command to begin.</p>';
    return;
  }
  list.innerHTML = sessionLog.map((entry) => `
    <div class="session-item ${entry.ok ? 'ok' : 'fail'}">
      <md-icon>${entry.ok ? 'check_circle' : 'error'}</md-icon>
      <div><code>${escapeHtml(entry.command)}</code><small>${escapeHtml(entry.time)}</small></div>
    </div>`).join('');
}

async function runCommand(raw) {
  const command = String(raw ?? '').trim();
  if (!command) return null;
  if (command.toLowerCase() === 'clear') { clearTerminal(); return null; }

  const lower = command.toLowerCase();
  if (lower.startsWith('model tcp ') && lower.replace('model tcp ', '').trim().length) {
    const act = lower.replace('model tcp ', '').trim();
    currentProtocol = 'tcp';
    renderProtocol();
    commandHistory = pushHistory(commandHistory, command);
    historyIndex = commandHistory.length;
    if ($('#terminal-input')) $('#terminal-input').value = '';
    addSession(command, true);
    if (act === 'syn') triggerPacketAction('syn');
    else if (act === 'synack' || act === 'syn-ack') triggerPacketAction('synack');
    else if (act === 'ack') triggerPacketAction('ack');
    else if (act.startsWith('data')) {
      const payload = command.slice(command.indexOf('data') + 4).trim() || 'GET / HTTP/1.1';
      triggerPacketAction('data', { data: payload });
    } else if (act === 'fin') triggerPacketAction('fin');
    else if (act === 'rst') triggerPacketAction('rst');
    else if (act === 'probe') runRealProbe();
    else if (act === 'loss' || act === 'retransmit') triggerPacketAction('retransmit');
    else triggerPacketAction(act);
    return { ok: true, output: `Executed interactive TCP action: ${act}` };
  }

  if (lower.startsWith('model ') || lower === 'wireshark' || lower.startsWith('wireshark ')) {
    let target = 'tcp';
    if (lower.startsWith('model ')) {
      target = lower.replace('model ', '').trim();
    } else if (lower.startsWith('wireshark ')) {
      target = lower.replace('wireshark ', '').trim();
    }
    if (protocolData[target]) {
      currentProtocol = target;
      const protocolTabs = $('#protocol-tabs');
      if (protocolTabs) {
        protocolTabs.activeTabIndex = PROTOCOL_KEYS.indexOf(target);
      }
      renderProtocol();
      commandHistory = pushHistory(commandHistory, command);
      historyIndex = commandHistory.length;
      const input = $('#terminal-input');
      if (input) input.value = '';
      addSession(command, true);
      runProtocolSequence();
      return { ok: true, output: `Starting Wireshark capture for ${target.toUpperCase()}…` };
    }
  }

  if (tokenize(command) === null) {
    writeTerminal('\nUnbalanced quotation marks in that command.\n');
    toast('Unbalanced quotation marks.');
    return null;
  }
  commandHistory = pushHistory(commandHistory, command);
  historyIndex = commandHistory.length;
  const input = $('#terminal-input');
  if (input) input.value = '';
  writeTerminal(`\n$ ${command}\n`);
  try {
    const result = await api('/api/execute', { command });
    writeTerminal(`${formatResultText(result)}\n`);
    addSession(command, Boolean(result.ok));
    if (!result.ok) toast(result.error || 'Command exited with an error.');
    return result;
  } catch (error) {
    if (error.data) {
      writeTerminal(`${formatResultText(error.data)}\n`);
      addSession(command, false);
      toast(error.data.error || 'Command rejected.');
      return error.data;
    }
    writeTerminal(`Backend unreachable: ${error.message}\n`);
    toast('Backend unreachable.');
    return null;
  }
}

// --------------------------------------------------------------------------- //
// Host info and command reference
// --------------------------------------------------------------------------- //
async function loadHostInfo() {
  try {
    hostInfo = await api('/api/host', undefined, 0);
    const card = $('#host-info');
    if (card) {
      card.innerHTML = `
        <p class="eyebrow">LAB HOST</p>
        <p class="host-line"><md-icon>dns</md-icon><span>${escapeHtml(hostInfo.hostname)}</span></p>
        <p class="host-meta">${escapeHtml(hostInfo.os)} · ${escapeHtml(hostInfo.release)}</p>
        <p class="host-meta">Python ${escapeHtml(hostInfo.python)}</p>`;
    }
  } catch { /* status already reflected by api() */ }
}

async function loadCommands() {
  try {
    const data = await api('/api/commands', undefined, 0);
    renderCommands(data.commands || []);
  } catch { /* ignore */ }
}

function renderCommands(commands) {
  const root = $('#command-reference');
  if (!root) return;
  if (!commands.length) {
    root.innerHTML = '<p class="empty">No commands available.</p>';
    return;
  }
  root.innerHTML = commands.map((command) => `
    <div class="command-row">
      <code>${escapeHtml(command.usage)}</code>
      <div><strong>${escapeHtml(command.category)}</strong><p>${escapeHtml(command.summary)}</p></div>
      <md-filled-tonal-button data-command="${escapeHtml(command.name)}" data-run="true">
        <md-icon slot="icon">play_arrow</md-icon>Run in console
      </md-filled-tonal-button>
    </div>`).join('');
  $$('[data-run="true"]', root).forEach((button) => {
    button.addEventListener('click', () => {
      const command = button.dataset.command;
      const input = $('#terminal-input');
      if (input) input.value = command;
      switchView(1);
      runCommand(command);
    });
  });
}

function renderModuleGrid() {
  const grid = $('#module-grid');
  if (!grid) return;
  grid.innerHTML = VIEWS.slice(1).map((view, offset) => `
    <button class="module-card" data-index="${offset + 1}">
      <span class="module-card-title">${escapeHtml(view.title)}</span>
      <span class="module-card-link">Open<md-icon>arrow_forward</md-icon></span>
    </button>`).join('');
  $$('.module-card', grid).forEach((card) => card.addEventListener('click', () => switchView(Number(card.dataset.index))));
}

function renderPresetChips() {
  const set = $('#preset-chips');
  if (!set) return;
  const presets = ['ping 1.1.1.1', 'ipconfig', 'nslookup example.com', 'tracert 1.1.1.1', 'arp -a', 'route print', 'netstat', 'curl https://example.com', 'help'];
  set.innerHTML = presets.map((preset) => `<md-assist-chip label="${escapeHtml(preset)}" data-command="${escapeHtml(preset)}"></md-assist-chip>`).join('');
  $$('md-assist-chip', set).forEach((chip) => chip.addEventListener('click', () => runCommand(chip.dataset.command)));
}

// --------------------------------------------------------------------------- //
// LAN model
// --------------------------------------------------------------------------- //
function nodeMarkup(name, host) {
  const meta = NODE_META[name];
  const selectable = ['PC1', 'PC2', 'Server'].includes(name);
  return `<button class="device-node ${host.online ? '' : 'offline'}" style="left:${meta.pos.left};top:${meta.pos.top}" ${selectable ? `data-source="${name}"` : ''} title="${meta.label}">
    <md-icon>${meta.icon}</md-icon>
    <strong>${escapeHtml(meta.label)}</strong>
    <small>${escapeHtml(host.ip)}</small>
    <span class="node-state"><i></i>${host.online ? 'Online' : 'Offline'}</span>
  </button>`;
}

function topologyMarkup() {
  const nodes = Object.entries(labState.hosts).map(([name, host]) => nodeMarkup(name, host)).join('');
  return `<svg class="network-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line class="link-line" id="line-pc1" x1="15" y1="80" x2="50" y2="16"/>
      <line class="link-line" id="line-pc2" x1="50" y1="80" x2="50" y2="16"/>
      <line class="link-line" id="line-server" x1="85" y1="80" x2="50" y2="16"/>
    </svg>${nodes}`;
}

function renderTopology(selector) {
  const container = $(selector);
  if (!container || !labState) return;
  container.innerHTML = topologyMarkup();
}

function summarizeTopology() {
  if (!labState) return;
  const summary = summarizeHosts(labState.hosts);
  const lan = $('#lan-online-summary');
  if (lan) lan.textContent = summary.label;
}

function renderDeviceConfigs() {
  if (!labState) return;
  const grid = $('#device-config-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(labState.hosts).map(([name, host]) => `
    <div class="card device-config-card">
      <div class="device-config-head">
        <div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(host.kind)}</small></div>
        <md-switch data-device="${name}" ${host.online ? 'selected' : ''} aria-label="${name} online"></md-switch>
      </div>
      <md-outlined-text-field label="IPv4 address" value="${escapeHtml(host.ip)}" data-device="${name}" class="ip-field"></md-outlined-text-field>
      <md-filled-tonal-button data-save="${name}"><md-icon slot="icon">save</md-icon>Save IP</md-filled-tonal-button>
    </div>`).join('');
  $$('.ip-field', grid).forEach((field) => field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') updateDevice(field.dataset.device, 'ip', field.value.trim());
  }));
  $$('md-switch[data-device]', grid).forEach((toggle) => toggle.addEventListener('change', () => updateDevice(toggle.dataset.device, 'online', toggle.selected)));
  $$('[data-save]', grid).forEach((button) => button.addEventListener('click', () => {
    const field = $(`.ip-field[data-device="${button.dataset.save}"]`);
    if (field) updateDevice(button.dataset.save, 'ip', field.value.trim());
  }));
}

async function updateDevice(device, field, value) {
  try {
    const result = await api('/api/device', { device, field, value });
    if (result.state) {
      labState = result.state;
      renderTopology('#lan-topology');
      summarizeTopology();
      renderDeviceConfigs();
      toast(`${device} model updated.`);
    }
  } catch (error) {
    toast(error.message || 'Could not update the model.');
    renderDeviceConfigs();
  }
}

async function loadState() {
  try {
    labState = await api('/api/state', undefined, 0);
    renderTopology('#lan-topology');
    summarizeTopology();
    renderDeviceConfigs();
  } catch { /* ignore */ }
}

// --------------------------------------------------------------------------- //
// Protocols & Wireshark Simulation
// --------------------------------------------------------------------------- //
let consoleMode = 'terminal';
let currentPackets = [];
let selectedPacketIndex = 0;
let activeFilterQuery = '';
let activeFilterChip = 'All';
let isCapturing = false;

function setConsoleMode(mode) {
  consoleMode = mode;
  const isWs = mode === 'wireshark';
  const termBtn = $('#tab-btn-terminal');
  const wsBtn = $('#tab-btn-wireshark');
  const termOutput = $('#terminal-output');
  const wsWindow = $('#wireshark-window');
  const replayBtn = $('#btn-wireshark-replay');

  if (termBtn) {
    termBtn.classList.toggle('active', !isWs);
    termBtn.setAttribute('aria-selected', String(!isWs));
  }
  if (wsBtn) {
    wsBtn.classList.toggle('active', isWs);
    wsBtn.setAttribute('aria-selected', String(isWs));
  }
  if (termOutput) termOutput.style.display = isWs ? 'none' : 'block';
  if (wsWindow) wsWindow.style.display = isWs ? 'flex' : 'none';
  if (replayBtn) replayBtn.style.display = isWs && currentPackets.length ? 'inline-flex' : 'none';

  if (isWs && currentPackets.length) {
    renderWiresharkTable();
  }
}

function updateWiresharkBadge() {
  const badge = $('#wireshark-badge');
  if (badge) badge.textContent = `${currentPackets.length}`;
}

function renderWiresharkTable() {
  const tbody = $('#ws-packet-tbody');
  if (!tbody) return;
  const filtered = filterPackets(currentPackets, activeFilterQuery);

  if (!filtered.length) {
    tbody.innerHTML = `<tr class="ws-empty-row"><td colspan="7">${currentPackets.length ? 'No packets match filter "' + escapeHtml(activeFilterQuery) + '"' : 'No packet capture active. Click "Run model sequence" in Protocols or type "model tcp".'}</td></tr>`;
    renderPacketInspection(-1);
    updateStatusBar(0);
    return;
  }

  tbody.innerHTML = filtered.map((pkt) => {
    const isSelected = pkt.no - 1 === selectedPacketIndex;
    const colorClass = getProtocolColorClass(pkt.protocol, pkt.info, pkt.stage);
    return `
      <tr class="${colorClass} ${isSelected ? 'ws-selected' : ''}" data-packet-no="${pkt.no}">
        <td class="ws-col-no">${pkt.no}</td>
        <td class="ws-col-time">${escapeHtml(pkt.time)}</td>
        <td class="ws-col-src" title="${escapeHtml(pkt.source)}">${escapeHtml(pkt.source)}</td>
        <td class="ws-col-dst" title="${escapeHtml(pkt.destination)}">${escapeHtml(pkt.destination)}</td>
        <td class="ws-col-proto">${escapeHtml(pkt.protocol)}</td>
        <td class="ws-col-len">${pkt.length}</td>
        <td class="ws-col-info" title="${escapeHtml(pkt.info)}">${escapeHtml(pkt.info)}</td>
      </tr>`;
  }).join('');

  $$('#ws-packet-tbody tr[data-packet-no]').forEach((row) => {
    row.addEventListener('click', () => {
      const pktNo = parseInt(row.getAttribute('data-packet-no'), 10);
      selectWiresharkPacket(pktNo - 1);
    });
  });

  updateStatusBar(filtered.length);

  const currentlyVisible = filtered.some((p) => p.no - 1 === selectedPacketIndex);
  if (!currentlyVisible && filtered.length) {
    selectWiresharkPacket(filtered[0].no - 1);
  } else {
    renderPacketInspection(selectedPacketIndex);
  }
}

function selectWiresharkPacket(index) {
  if (index < 0 || index >= currentPackets.length) return;
  selectedPacketIndex = index;
  const pkt = currentPackets[index];

  $$('#ws-packet-tbody tr').forEach((row) => {
    const pktNo = parseInt(row.getAttribute('data-packet-no'), 10);
    row.classList.toggle('ws-selected', pktNo - 1 === index);
  });

  $$('.timeline-step').forEach((step) => {
    const stepIdx = parseInt(step.getAttribute('data-packet-index'), 10);
    step.classList.toggle('active-step', stepIdx === index);
  });

  const summary = $('#ws-selected-summary');
  if (summary) summary.textContent = `Packet #${pkt.no} (${pkt.protocol} ${pkt.stage || ''})`;

  renderPacketInspection(index);

  const statusSelection = $('#ws-status-selection');
  if (statusSelection) statusSelection.textContent = `Packet #${pkt.no} selected · ${pkt.stage || pkt.protocol}`;
}

function renderPacketInspection(index) {
  const treeContainer = $('#ws-tree');
  const hexContainer = $('#ws-hex-dump');
  if (!treeContainer || !hexContainer) return;

  if (index < 0 || index >= currentPackets.length) {
    treeContainer.innerHTML = '<p class="ws-empty-hint">Select a packet row above to inspect dissection tree.</p>';
    hexContainer.textContent = 'No packet selected.';
    return;
  }

  const pkt = currentPackets[index];

  if (Array.isArray(pkt.layers) && pkt.layers.length) {
    treeContainer.innerHTML = pkt.layers.map((layer, lIdx) => {
      const isCollapsed = lIdx > 3;
      const fields = (layer.fields || []).map((f) => {
        const isHighlight = f.includes('Syn: Set') || f.includes('Acknowledgment: Set') || f.includes('ESTABLISHED');
        return `<div class="ws-tree-field ${isHighlight ? 'highlight-flag' : ''}">${escapeHtml(f)}</div>`;
      }).join('');
      return `
        <div class="ws-tree-node ${isCollapsed ? 'collapsed' : ''}">
          <div class="ws-tree-header" role="button" tabindex="0">
            <span class="ws-tree-triangle">▼</span>
            <span>${escapeHtml(layer.name)}</span>
          </div>
          <div class="ws-tree-children">${fields}</div>
        </div>`;
    }).join('');

    $$('.ws-tree-header', treeContainer).forEach((header) => {
      header.addEventListener('click', () => {
        header.closest('.ws-tree-node')?.classList.toggle('collapsed');
      });
    });
  } else {
    treeContainer.innerHTML = `<div class="ws-tree-node"><div class="ws-tree-header"><span>${escapeHtml(pkt.info)}</span></div><div class="ws-tree-children"><div class="ws-tree-field">${escapeHtml(pkt.summary || '')}</div></div></div>`;
  }

  hexContainer.textContent = formatHexDump(pkt.hex) || 'No raw payload available.';
}

function updateStatusBar(displayedCount) {
  const countEl = $('#ws-status-count');
  if (countEl) {
    const total = currentPackets.length;
    const pct = total ? Math.round((displayedCount / total) * 100) : 0;
    countEl.textContent = `Packets: ${total} · Displayed: ${displayedCount} (${pct}%)`;
  }
}

function setupFilterChips(scenario) {
  const container = $('#ws-filter-chips');
  if (!container) return;
  const chipsConfig = {
    tcp: ['All', 'SYN', 'SYN-ACK', 'ACK'],
    udp: ['All', 'UDP', 'Datagram'],
    http: ['All', 'DNS', 'TCP', 'HTTP'],
    dns: ['All', 'Query', 'Response'],
    dhcp: ['All', 'Discover', 'Offer', 'Request', 'ACK'],
    arp: ['All', 'Request', 'Reply'],
  };
  const list = chipsConfig[scenario] || ['All'];
  activeFilterChip = 'All';
  activeFilterQuery = '';
  const input = $('#ws-filter-input');
  if (input) {
    input.value = '';
    input.closest('.ws-filter-input-wrap')?.classList.remove('invalid');
  }

  container.innerHTML = list.map((label) => `
    <button type="button" class="ws-chip ${label === 'All' ? 'active' : ''}" data-filter="${escapeHtml(label)}">
      ${escapeHtml(label)}
    </button>`).join('');

  $$('.ws-chip', container).forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.ws-chip', container).forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const val = chip.getAttribute('data-filter');
      activeFilterChip = val;
      activeFilterQuery = val === 'All' ? '' : val;
      if (input) input.value = activeFilterQuery;
      renderWiresharkTable();
    });
  });
}

async function streamWiresharkCapture(packets, scenarioTitle) {
  if (isCapturing) return;
  isCapturing = true;
  currentPackets = [];
  selectedPacketIndex = 0;
  updateWiresharkBadge();

  const statusWrap = $('#ws-capture-status');
  const statusText = $('#ws-capture-text');
  const replayBtn = $('#btn-wireshark-replay');
  if (replayBtn) replayBtn.disabled = true;
  if (statusWrap) statusWrap.style.display = 'flex';

  for (let i = 0; i < packets.length; i += 1) {
    const pkt = packets[i];
    if (statusText) statusText.textContent = `Capturing packet ${i + 1} of ${packets.length} (${pkt.stage || pkt.protocol})…`;
    currentPackets.push(pkt);
    updateWiresharkBadge();
    renderWiresharkTable();
    selectWiresharkPacket(i);
    await delay(320);
  }

  if (statusWrap) statusWrap.style.display = 'none';
  if (replayBtn) {
    replayBtn.disabled = false;
    replayBtn.style.display = 'inline-flex';
  }
  isCapturing = false;
  selectWiresharkPacket(0);
}

// --------------------------------------------------------------------------- //
// Real-Time Interactive Actions Engine
// --------------------------------------------------------------------------- //
const interactiveState = {
  clientState: 'CLOSED',
  serverState: 'LISTEN',
  clientSeq: 1000,
  serverSeq: 5000,
  clientPort: 54321,
  serverPort: 80,
  startTime: null,
  packetCount: 0,
};

function updateSocketUI() {
  const clientChip = $('#sock-client-state');
  const serverChip = $('#sock-server-state');
  const linkInd = $('#socket-link-indicator');
  const linkStatus = $('#sock-link-status');

  const btnSyn = $('#act-send-syn');
  const btnSynack = $('#act-send-synack');
  const btnAck = $('#act-send-ack');
  const btnData = $('#act-send-data');
  const btnFin = $('#act-send-fin');
  const btnRst = $('#act-send-rst');

  const cState = interactiveState.clientState;
  const sState = interactiveState.serverState;

  if (clientChip) {
    clientChip.textContent = cState;
    clientChip.className = `state-chip state-${cState.toLowerCase().replace(/_/g, '-')}`;
  }
  if (serverChip) {
    serverChip.textContent = sState;
    serverChip.className = `state-chip state-${sState.toLowerCase().replace(/_/g, '-')}`;
  }

  const isConn = cState === 'ESTABLISHED' && sState === 'ESTABLISHED';
  if (linkInd) linkInd.classList.toggle('connected', isConn);
  if (linkStatus) {
    linkStatus.textContent = isConn
      ? 'ESTABLISHED'
      : (cState === 'SYN_SENT' || sState === 'SYN_RCVD')
        ? 'CONNECTING…'
        : 'DISCONNECTED';
  }

  if (btnSyn) btnSyn.disabled = cState !== 'CLOSED';
  if (btnSynack) btnSynack.disabled = !(cState === 'SYN_SENT' && (sState === 'LISTEN' || sState === 'SYN_RCVD'));
  if (btnAck) btnAck.disabled = !(cState === 'SYN_SENT' && sState === 'SYN_RCVD');
  if (btnData) btnData.disabled = !isConn;
  if (btnFin) btnFin.disabled = !isConn;
  if (btnRst) btnRst.disabled = cState === 'CLOSED' && sState === 'CLOSED';
}

function updateProtocolActionDeck() {
  const p = currentProtocol;
  const groupTcp = $('#actions-tcp');
  const groupUdp = $('#actions-udp');
  const groupDns = $('#actions-dns');
  const groupDhcp = $('#actions-dhcp');
  const groupArp = $('#actions-arp');

  if (groupTcp) groupTcp.style.display = (p === 'tcp' || p === 'http') ? 'flex' : 'none';
  if (groupUdp) groupUdp.style.display = p === 'udp' ? 'flex' : 'none';
  if (groupDns) groupDns.style.display = p === 'dns' ? 'flex' : 'none';
  if (groupDhcp) groupDhcp.style.display = p === 'dhcp' ? 'flex' : 'none';
  if (groupArp) groupArp.style.display = p === 'arp' ? 'flex' : 'none';

  updateSocketUI();
}

function appendTimelineStep(pkt) {
  const timeline = $('#protocol-timeline');
  if (!timeline) return;
  const emptyP = timeline.querySelector('.empty');
  if (emptyP) timeline.innerHTML = '';

  const index = currentPackets.length - 1;
  const stepEl = document.createElement('div');
  stepEl.className = 'timeline-step client-step active-step';
  stepEl.setAttribute('data-packet-index', String(index));
  stepEl.setAttribute('title', `Click to inspect Packet #${pkt.no} (${pkt.stage || pkt.protocol}) in Wireshark`);
  stepEl.innerHTML = `
    <span class="timeline-index">${String(pkt.no).padStart(2, '0')}</span>
    <div>
      <strong>${escapeHtml(pkt.stage || pkt.protocol)} [${escapeHtml(pkt.source)} → ${escapeHtml(pkt.destination)}]</strong>
      <p>${escapeHtml(pkt.info)}</p>
    </div>
  `;
  stepEl.addEventListener('click', () => {
    setConsoleMode('wireshark');
    selectWiresharkPacket(index);
  });

  $$('.timeline-step', timeline).forEach((s) => s.classList.remove('active-step'));
  timeline.appendChild(stepEl);
}

async function triggerPacketAction(actionName, customParams = {}) {
  try {
    if (!interactiveState.startTime) interactiveState.startTime = performance.now();
    const relTime = ((performance.now() - interactiveState.startTime) / 1000).toFixed(6);
    interactiveState.packetCount += 1;

    const srcIp = (labState && labState.hosts && labState.hosts.PC1 && labState.hosts.PC1.ip) || '192.168.1.10';
    const dstIp = (labState && labState.hosts && labState.hosts.Server && labState.hosts.Server.ip) || '192.168.1.100';

    const params = {
      src_ip: srcIp,
      dst_ip: dstIp,
      client_port: interactiveState.clientPort,
      server_port: interactiveState.serverPort,
      client_seq: interactiveState.clientSeq,
      server_seq: interactiveState.serverSeq,
      no: interactiveState.packetCount,
      time: relTime,
      data: $('#tcp-payload-input')?.value.trim() || 'GET / HTTP/1.1',
      ...customParams,
    };

    const res = await api('/api/packet_action', { action: actionName, params });
    if (!res || !res.packet) throw new Error('Failed to generate action packet.');
    const pkt = res.packet;

    // State machine updates
    const autoReply = $('#chk-auto-respond')?.checked ?? true;

    if (actionName === 'syn') {
      interactiveState.clientState = 'SYN_SENT';
      updateSocketUI();
      if (autoReply) {
        setTimeout(() => triggerPacketAction('synack'), 350);
      }
    } else if (actionName === 'synack') {
      interactiveState.serverState = 'SYN_RCVD';
      updateSocketUI();
      if (autoReply) {
        setTimeout(() => triggerPacketAction('ack'), 350);
      }
    } else if (actionName === 'ack') {
      interactiveState.clientState = 'ESTABLISHED';
      interactiveState.serverState = 'ESTABLISHED';
      updateSocketUI();
      toast('TCP Connection ESTABLISHED! Sockets connected.');
    } else if (actionName === 'data') {
      const dataLen = (new TextEncoder().encode(params.data)).length;
      if (autoReply) {
        setTimeout(() => triggerPacketAction('server_ack', { data_len: dataLen }), 350);
      }
    } else if (actionName === 'server_ack') {
      interactiveState.clientSeq += params.data_len || 0;
      toast('Server acknowledged data.');
    } else if (actionName === 'fin') {
      interactiveState.clientState = 'FIN_WAIT_1';
      updateSocketUI();
      if (autoReply) {
        setTimeout(() => triggerPacketAction('server_fin'), 350);
      }
    } else if (actionName === 'server_fin') {
      interactiveState.serverState = 'LAST_ACK';
      updateSocketUI();
      if (autoReply) {
        setTimeout(() => triggerPacketAction('client_fin_ack'), 350);
      }
    } else if (actionName === 'client_fin_ack') {
      interactiveState.clientState = 'CLOSED';
      interactiveState.serverState = 'CLOSED';
      updateSocketUI();
      toast('TCP Gracefully Closed.');
    } else if (actionName === 'rst') {
      interactiveState.clientState = 'CLOSED';
      interactiveState.serverState = 'CLOSED';
      updateSocketUI();
      toast('TCP Connection Aborted (RST).');
    } else if (actionName === 'retransmit') {
      toast('Simulated Packet Loss: TCP Retransmission captured.');
    } else if (actionName === 'dns_query') {
      if (autoReply) {
        setTimeout(() => triggerPacketAction('dns_response', { name: params.name }), 350);
      }
    } else if (actionName === 'arp_request') {
      if (autoReply) {
        setTimeout(() => triggerPacketAction('arp_reply', { target_ip: params.target_ip }), 350);
      }
    }

    // Append to current capture
    currentPackets.push(pkt);
    updateWiresharkBadge();
    setConsoleMode('wireshark');
    renderWiresharkTable();
    selectWiresharkPacket(currentPackets.length - 1);
    appendTimelineStep(pkt);

    const tableWrap = $('.ws-packet-list-wrap');
    if (tableWrap) tableWrap.scrollTop = tableWrap.scrollHeight;

    return pkt;
  } catch (err) {
    toast(err.message || 'Action failed.');
    console.error(err);
  }
}

function resetInteractiveFlow() {
  interactiveState.clientState = 'CLOSED';
  interactiveState.serverState = 'LISTEN';
  interactiveState.clientSeq = 1000;
  interactiveState.serverSeq = 5000;
  interactiveState.clientPort = 50000 + Math.floor(Math.random() * 15000);
  interactiveState.startTime = null;
  interactiveState.packetCount = 0;
  currentPackets = [];
  updateWiresharkBadge();
  renderWiresharkTable();
  updateSocketUI();
  const timeline = $('#protocol-timeline');
  if (timeline) timeline.innerHTML = '<p class="empty">Click action buttons above or Run sequence to reveal modelled steps.</p>';
  toast('Socket states and capture reset.');
}

async function runRealProbe() {
  try {
    toast('Probing real host TCP socket on 127.0.0.1:5000…');
    const res = await api('/api/probe_tcp', { host: '127.0.0.1', port: 5000 });
    if (!res.ok) throw new Error(res.error || 'Probe failed');

    if (!interactiveState.startTime) interactiveState.startTime = performance.now();
    const relTime = ((performance.now() - interactiveState.startTime) / 1000).toFixed(6);
    interactiveState.packetCount += 1;

    const pkt = {
      no: interactiveState.packetCount,
      time: relTime,
      source: `${res.client_ip}:${res.client_port}`,
      destination: `${res.server_ip}:${res.server_port}`,
      protocol: 'TCP',
      length: 74,
      info: `${res.client_port} → ${res.server_port} [SYN, ACK] Seq=1 Ack=1 RTT=${res.rtt_ms}ms (Real Host OS Kernel)`,
      stage: 'REAL-PROBE',
      summary: `Real Host OS Socket Probe: Connected to ${res.server_ip}:${res.server_port} in ${res.rtt_ms}ms. Ephemeral client port assigned by OS: ${res.client_port}.`,
      layers: [
        { name: `Frame ${interactiveState.packetCount}: 74 bytes on loopback`, fields: [`RTT: ${res.rtt_ms} ms`, 'Interface: Loopback (Real OS Socket)'] },
        { name: `Internet Protocol Version 4, Src: ${res.client_ip}, Dst: ${res.server_ip}`, fields: ['Protocol: TCP (6)'] },
        { name: `Transmission Control Protocol, Src Port: ${res.client_port}, Dst Port: ${res.server_port}`, fields: ['[TCP Connection: ESTABLISHED by Python socket.connect()]', `Measured Round-Trip Time: ${res.rtt_ms} ms`, `Client Ephemeral Port: ${res.client_port}`] },
      ],
      hex: '00000000000000000000000008004500003c0000400040067f007f0000017f000001' + res.client_port.toString(16).padStart(4, '0') + res.server_port.toString(16).padStart(4, '0') + '0000000100000001a012faf000000000',
    };

    currentPackets.push(pkt);
    updateWiresharkBadge();
    setConsoleMode('wireshark');
    renderWiresharkTable();
    selectWiresharkPacket(currentPackets.length - 1);
    appendTimelineStep(pkt);
    toast(`Real Host TCP Handshake succeeded! RTT: ${res.rtt_ms}ms`);
  } catch (err) {
    toast(`Real probe error: ${err.message}`);
  }
}

function renderProtocol() {
  const data = protocolData[currentProtocol];
  if (!data) return;
  setupFilterChips(data.scenario);
  const detail = $('#protocol-detail');
  if (detail) {
    detail.innerHTML = `
      <div class="protocol-detail-head">
        <span class="protocol-badge">${escapeHtml(data.badge)}</span>
        <div><h3>${escapeHtml(data.name)}</h3><p>${escapeHtml(data.summary)}</p></div>
      </div>
      <div class="protocol-facts">
        ${data.facts.map(([label, value]) => `<div class="protocol-fact"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`).join('')}
      </div>`;
  }
  const title = $('#sequence-title');
  const description = $('#sequence-description');
  if (title) title.textContent = data.title;
  if (description) description.textContent = data.description;
  const timeline = $('#protocol-timeline');
  if (timeline) timeline.innerHTML = '<p class="empty">Click action buttons above or Run sequence to reveal modelled steps.</p>';

  updateProtocolActionDeck();
}

async function runProtocolSequence() {
  const data = protocolData[currentProtocol];
  if (!data) return;
  const button = $('#run-protocol');
  if (button) button.disabled = true;
  try {
    switchView(2);
    setConsoleMode('wireshark');
    resetInteractiveFlow();

    if (currentProtocol === 'tcp') {
      // Step-by-step real-time interactive actions!
      await triggerPacketAction('syn');
      await delay(800);
      await triggerPacketAction('data', { data: $('#tcp-payload-input')?.value.trim() || 'GET / HTTP/1.1' });
      await delay(800);
      await triggerPacketAction('fin');
    } else if (currentProtocol === 'udp') {
      const uPayload = $('#udp-payload-input')?.value.trim() || 'NetLab UDP Datagram';
      await triggerPacketAction('udp', { payload: uPayload });
      await delay(400);
      await triggerPacketAction('udp', { payload: 'UDP Datagram #2 (Streaming)' });
    } else if (currentProtocol === 'dns') {
      const qName = $('#dns-query-input')?.value.trim() || 'example.com';
      await triggerPacketAction('dns_query', { name: qName });
    } else if (currentProtocol === 'dhcp') {
      await triggerPacketAction('dhcp_discover');
      await delay(400);
      await triggerPacketAction('dhcp_offer');
      await delay(400);
      await triggerPacketAction('dhcp_request');
      await delay(400);
      await triggerPacketAction('dhcp_ack');
    } else if (currentProtocol === 'arp') {
      await triggerPacketAction('arp_request');
      await delay(400);
      await triggerPacketAction('arp_reply');
    } else {
      const result = await api('/api/simulate', { scenario: data.scenario });
      if (Array.isArray(result.packets) && result.packets.length) {
        await streamWiresharkCapture(result.packets, result.title);
      }
    }
    toast(`${data.badge} real-time interactive simulation complete.`);
  } catch (error) {
    toast(error.message || 'Could not run the sequence.');
  } finally {
    if (button) button.disabled = false;
  }
}

// --------------------------------------------------------------------------- //
// Quiz
// --------------------------------------------------------------------------- //
function renderQuiz() {
  const question = quizQuestions[quizIndex];
  const progressLabel = $('#quiz-progress-label');
  const progressBar = $('#quiz-progress-bar');
  const scoreLabel = $('#quiz-score-label');
  const number = $('#quiz-number');
  const questionText = $('#quiz-question');
  const feedback = $('#quiz-feedback');
  const next = $('#quiz-next');
  if (progressLabel) progressLabel.textContent = `QUESTION ${quizIndex + 1} OF ${quizQuestions.length}`;
  if (progressBar) progressBar.value = (quizIndex + 1) / quizQuestions.length;
  if (scoreLabel) scoreLabel.textContent = `Score: ${quizScore}`;
  if (number) number.textContent = `Q${quizIndex + 1}`;
  if (questionText) questionText.textContent = question.q;

  const result = quizFeedback(question, quizSelection, quizChecked);
  if (feedback) { feedback.textContent = result.text; feedback.className = result.state; }

  const options = $('#quiz-options');
  if (options) {
    options.innerHTML = question.options.map((option, index) => `
      <label class="quiz-option ${quizSelection === index ? 'selected' : ''} ${quizChecked && index === question.answer ? 'correct' : ''} ${quizChecked && quizSelection === index && index !== question.answer ? 'incorrect' : ''}">
        <md-radio name="quiz" value="${index}" ${quizSelection === index ? 'checked' : ''} ${quizChecked ? 'disabled' : ''}></md-radio>
        <span>${escapeHtml(option)}</span>
      </label>`).join('');
    $$('md-radio', options).forEach((radio) => radio.addEventListener('change', () => {
      quizSelection = Number(radio.value);
      $$('md-radio', options).forEach((node) => { node.checked = Number(node.value) === quizSelection; });
      $$('.quiz-option', options).forEach((label, index) => label.classList.toggle('selected', index === quizSelection));
      if (next) next.disabled = false;
    }));
  }
  if (next) {
    next.disabled = quizSelection === null && !quizChecked;
    next.innerHTML = quizChecked
      ? (quizIndex === quizQuestions.length - 1 ? 'See results<md-icon slot="icon">arrow_forward</md-icon>' : 'Next question<md-icon slot="icon">arrow_forward</md-icon>')
      : 'Check answer<md-icon slot="icon">arrow_forward</md-icon>';
  }
}

function advanceQuiz() {
  if (!quizChecked) {
    if (quizSelection === null) return;
    quizChecked = true;
    if (quizSelection === quizQuestions[quizIndex].answer) quizScore += 1;
    renderQuiz();
    return;
  }
  if (quizIndex < quizQuestions.length - 1) {
    quizIndex += 1;
    quizSelection = null;
    quizChecked = false;
    renderQuiz();
    return;
  }
  const body = $('#quiz-body');
  if (body) {
    body.innerHTML = `
      <p class="eyebrow">COMPLETE</p>
      <h3>You scored ${quizScore} out of ${quizQuestions.length}.</h3>
      <p class="lead">${quizScore === quizQuestions.length ? 'Excellent — you can explain these concepts.' : quizScore >= 2 ? 'Good work. Revisit any module you were unsure about, then try again.' : 'Review the command, protocol, LAN and routing modules, then try again.'}</p>
      <md-filled-button id="quiz-restart" style="margin-top:16px"><md-icon slot="icon">restart_alt</md-icon>Try again</md-filled-button>`;
    $('#quiz-restart').addEventListener('click', restartQuiz);
  }
  const progressLabel = $('#quiz-progress-label');
  const progressBar = $('#quiz-progress-bar');
  if (progressLabel) progressLabel.textContent = 'QUIZ COMPLETE';
  if (progressBar) progressBar.value = 1;
}

function restartQuiz() {
  quizIndex = 0; quizScore = 0; quizSelection = null; quizChecked = false;
  const body = $('#quiz-body');
  if (body && !$('#quiz-options')) {
    body.innerHTML = `
      <p class="eyebrow" id="quiz-number">Q1</p>
      <h3 id="quiz-question"></h3>
      <div class="quiz-options" id="quiz-options"></div>
      <div class="quiz-footer">
        <span id="quiz-feedback" aria-live="polite">Choose one answer to check it.</span>
        <md-filled-button id="quiz-next" disabled>Check answer<md-icon slot="icon">arrow_forward</md-icon></md-filled-button>
      </div>`;
    $('#quiz-next').addEventListener('click', advanceQuiz);
  }
  renderQuiz();
}

// --------------------------------------------------------------------------- //
// Handlers and init
// --------------------------------------------------------------------------- //
function attachHandlers() {
  const tabs = $('#module-tabs');
  tabs?.addEventListener('change', () => { if (!suppressTabEvent) switchView(tabs.activeTabIndex); });

  const protocolTabs = $('#protocol-tabs');
  protocolTabs?.addEventListener('change', () => {
    currentProtocol = PROTOCOL_KEYS[protocolTabs.activeTabIndex] || 'tcp';
    renderProtocol();
  });

  $('#run-terminal')?.addEventListener('click', () => runCommand($('#terminal-input').value));
  $('#terminal-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runCommand($('#terminal-input').value);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const move = navigateHistory(commandHistory, historyIndex, event.key === 'ArrowUp' ? 'up' : 'down');
      historyIndex = move.index;
      $('#terminal-input').value = move.value;
    }
  });
  $('#clear-terminal')?.addEventListener('click', clearTerminal);
  $('#clear-log')?.addEventListener('click', () => { sessionLog = []; renderSession(); });

  // Console mode tabs (Terminal vs Wireshark)
  $('#tab-btn-terminal')?.addEventListener('click', () => setConsoleMode('terminal'));
  $('#tab-btn-wireshark')?.addEventListener('click', () => setConsoleMode('wireshark'));
  $('#btn-wireshark-replay')?.addEventListener('click', () => {
    const data = protocolData[currentProtocol];
    if (data && currentPackets.length) {
      streamWiresharkCapture([...currentPackets], data.title);
    }
  });

  // Wireshark filter bar
  const filterInput = $('#ws-filter-input');
  filterInput?.addEventListener('input', (e) => {
    activeFilterQuery = e.target.value;
    renderWiresharkTable();
  });
  filterInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      activeFilterQuery = filterInput.value;
      renderWiresharkTable();
    }
  });
  $('#ws-filter-apply')?.addEventListener('click', () => {
    if (filterInput) activeFilterQuery = filterInput.value;
    renderWiresharkTable();
  });
  $('#ws-filter-clear')?.addEventListener('click', () => {
    if (filterInput) filterInput.value = '';
    activeFilterQuery = '';
    $$('.ws-chip').forEach((c) => c.classList.toggle('active', c.getAttribute('data-filter') === 'All'));
    renderWiresharkTable();
  });

  // Wireshark inspection sub-tabs
  $('#ws-tab-details')?.addEventListener('click', () => {
    $('#ws-tab-details')?.classList.add('active');
    $('#ws-tab-details')?.setAttribute('aria-selected', 'true');
    $('#ws-tab-hex')?.classList.remove('active');
    $('#ws-tab-hex')?.setAttribute('aria-selected', 'false');
    const dView = $('#ws-details-view');
    const hView = $('#ws-hex-view');
    if (dView) dView.style.display = 'block';
    if (hView) hView.style.display = 'none';
  });
  $('#ws-tab-hex')?.addEventListener('click', () => {
    $('#ws-tab-hex')?.classList.add('active');
    $('#ws-tab-hex')?.setAttribute('aria-selected', 'true');
    $('#ws-tab-details')?.classList.remove('active');
    $('#ws-tab-details')?.setAttribute('aria-selected', 'false');
    const dView = $('#ws-details-view');
    const hView = $('#ws-hex-view');
    if (dView) dView.style.display = 'none';
    if (hView) hView.style.display = 'block';
  });

  $('#presentation-mode')?.addEventListener('click', () => togglePresentationMode());
  $('#pres-prev-btn')?.addEventListener('click', prevTopic);
  $('#pres-next-btn')?.addEventListener('click', nextTopic);
  $('#pres-exit-btn')?.addEventListener('click', () => togglePresentationMode(false));
  $('#pres-toggle-console')?.addEventListener('click', togglePresentationConsole);

  $('#reset-lab')?.addEventListener('click', resetModel);
  $('#reset-device-config')?.addEventListener('click', resetModel);
  $('#refresh-commands')?.addEventListener('click', loadCommands);
  $('#run-protocol')?.addEventListener('click', runProtocolSequence);

  // Real-Time Interactive Action Deck Listeners
  $('#act-send-syn')?.addEventListener('click', () => triggerPacketAction('syn'));
  $('#act-send-synack')?.addEventListener('click', () => triggerPacketAction('synack'));
  $('#act-send-ack')?.addEventListener('click', () => triggerPacketAction('ack'));
  $('#act-send-data')?.addEventListener('click', () => triggerPacketAction('data', { data: $('#tcp-payload-input')?.value.trim() || 'GET / HTTP/1.1' }));
  $('#tcp-payload-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerPacketAction('data', { data: $('#tcp-payload-input')?.value.trim() || 'GET / HTTP/1.1' });
  });
  $('#act-send-fin')?.addEventListener('click', () => triggerPacketAction('fin'));
  $('#act-send-rst')?.addEventListener('click', () => triggerPacketAction('rst'));
  $('#act-packet-loss')?.addEventListener('click', () => triggerPacketAction('retransmit'));
  $('#act-real-probe')?.addEventListener('click', runRealProbe);
  $('#act-reset-flow')?.addEventListener('click', resetInteractiveFlow);

  // UDP actions
  $('#act-send-udp')?.addEventListener('click', () => triggerPacketAction('udp', { payload: $('#udp-payload-input')?.value.trim() || 'NetLab UDP Datagram' }));
  $('#udp-payload-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerPacketAction('udp', { payload: $('#udp-payload-input')?.value.trim() || 'NetLab UDP Datagram' });
  });
  $('#act-blast-udp')?.addEventListener('click', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await triggerPacketAction('udp', { payload: `UDP Blast #${i} (${new Date().toLocaleTimeString()})` });
      await delay(130);
    }
  });

  // DNS actions
  $('#act-dns-query')?.addEventListener('click', () => triggerPacketAction('dns_query', { name: $('#dns-query-input')?.value.trim() || 'example.com' }));
  $('#dns-query-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') triggerPacketAction('dns_query', { name: $('#dns-query-input')?.value.trim() || 'example.com' });
  });
  $('#act-dns-response')?.addEventListener('click', () => triggerPacketAction('dns_response', { name: $('#dns-query-input')?.value.trim() || 'example.com' }));

  // DHCP actions
  $('#act-dhcp-discover')?.addEventListener('click', () => triggerPacketAction('dhcp_discover'));
  $('#act-dhcp-offer')?.addEventListener('click', () => triggerPacketAction('dhcp_offer'));
  $('#act-dhcp-request')?.addEventListener('click', () => triggerPacketAction('dhcp_request'));
  $('#act-dhcp-ack')?.addEventListener('click', () => triggerPacketAction('dhcp_ack'));

  // ARP actions
  $('#act-arp-request')?.addEventListener('click', () => triggerPacketAction('arp_request'));
  $('#act-arp-reply')?.addEventListener('click', () => triggerPacketAction('arp_reply'));

  // Wireshark Console Quick Actions Toolbar
  $('#ws-quick-syn')?.addEventListener('click', () => triggerPacketAction('syn'));
  $('#ws-quick-synack')?.addEventListener('click', () => triggerPacketAction('synack'));
  $('#ws-quick-ack')?.addEventListener('click', () => triggerPacketAction('ack'));
  $('#ws-quick-data')?.addEventListener('click', () => triggerPacketAction('data', { data: $('#tcp-payload-input')?.value.trim() || 'GET / HTTP/1.1' }));
  $('#ws-quick-fin')?.addEventListener('click', () => triggerPacketAction('fin'));
  $('#ws-quick-rst')?.addEventListener('click', () => triggerPacketAction('rst'));
  $('#ws-quick-loss')?.addEventListener('click', () => triggerPacketAction('retransmit'));
  $('#ws-quick-probe')?.addEventListener('click', runRealProbe);

  $('#run-http')?.addEventListener('click', () => runCommand(`curl ${$('#http-url').value.trim()}`));
  $('#run-dns')?.addEventListener('click', () => runCommand(`nslookup ${$('#dns-name').value.trim()}`));
  $('#run-route-table')?.addEventListener('click', async () => {
    const result = await runCommand('route print');
    if (result) $('#route-table-output').textContent = formatResultText(result);
  });
  $('#run-trace')?.addEventListener('click', () => runCommand(`tracert ${$('#trace-target').value.trim()}`));
  $('#trace-target')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') runCommand(`tracert ${$('#trace-target').value.trim()}`); });

  $('#quiz-next')?.addEventListener('click', advanceQuiz);

  window.addEventListener('keydown', (event) => {
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const typing = tag === 'input' || tag === 'textarea' || tag === 'md-outlined-text-field' || tag === 'md-filled-text-field';
    if (consoleMode === 'wireshark' && !typing && currentPackets.length) {
      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        const next = Math.min(currentPackets.length - 1, selectedPacketIndex + 1);
        selectWiresharkPacket(next);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        const prev = Math.max(0, selectedPacketIndex - 1);
        selectWiresharkPacket(prev);
        return;
      }
    }
    if (event.key === 'Escape' && document.body.classList.contains('presenter-mode')) {
      event.preventDefault();
      togglePresentationMode(false);
      return;
    }
    if (!typing && (event.key === 'p' || event.key === 'P')) {
      event.preventDefault();
      togglePresentationMode();
      return;
    }
    if (document.body.classList.contains('presenter-mode') && !typing) {
      if (event.key === 'c' || event.key === 'C') { event.preventDefault(); togglePresentationConsole(); return; }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); nextTopic(); return; }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); prevTopic(); }
    }
  });
}

async function resetModel() {
  try {
    await api('/api/reset', {});
    await loadState();
    sessionLog = [];
    renderSession();
    clearTerminal();
    currentPackets = [];
    selectedPacketIndex = 0;
    updateWiresharkBadge();
    renderWiresharkTable();
    setConsoleMode('terminal');
    restartQuiz();
    toast('LAN model reset to defaults.');
  } catch (error) {
    toast(error.message || 'Could not reset the model.');
  }
}

async function init() {
  attachHandlers();
  renderModuleGrid();
  renderPresetChips();
  renderProtocol();
  renderQuiz();
  updatePresentationNav();
  setBackendStatus('waking');
  await Promise.all([loadHostInfo(), loadCommands(), loadState()]);
  setBackendStatus('online');
}

document.addEventListener('DOMContentLoaded', init);
