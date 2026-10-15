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
// Protocols
// --------------------------------------------------------------------------- //
function renderProtocol() {
  const data = protocolData[currentProtocol];
  if (!data) return;
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
  if (timeline) timeline.innerHTML = '<p class="empty">Run the sequence to reveal the modelled steps.</p>';
}

async function runProtocolSequence() {
  const data = protocolData[currentProtocol];
  if (!data) return;
  const button = $('#run-protocol');
  if (button) button.disabled = true;
  try {
    const result = await api('/api/simulate', { scenario: data.scenario });
    switchView(2);
    writeTerminal(`\n$ model ${data.scenario}\n`);
    const timeline = $('#protocol-timeline');
    if (timeline) {
      timeline.innerHTML = (result.events || []).map((event, index) => `
        <div class="timeline-step ${kindClass(event.kind)}">
          <span class="timeline-index">${String(index + 1).padStart(2, '0')}</span>
          <div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p></div>
        </div>`).join('') || '<p class="empty">No steps returned.</p>';
    }
    toast(`${data.badge} model sequence complete.`);
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

  $('#presentation-mode')?.addEventListener('click', () => togglePresentationMode());
  $('#pres-prev-btn')?.addEventListener('click', prevTopic);
  $('#pres-next-btn')?.addEventListener('click', nextTopic);
  $('#pres-exit-btn')?.addEventListener('click', () => togglePresentationMode(false));
  $('#pres-toggle-console')?.addEventListener('click', togglePresentationConsole);

  $('#reset-lab')?.addEventListener('click', resetModel);
  $('#reset-device-config')?.addEventListener('click', resetModel);
  $('#refresh-commands')?.addEventListener('click', loadCommands);
  $('#run-protocol')?.addEventListener('click', runProtocolSequence);

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
