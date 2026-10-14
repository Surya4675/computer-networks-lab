'use strict';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let labState = null;
let currentView = 'home';
let currentProtocol = 'tcp';
let selectedSource = 'PC1';
let commandHistory = [];
let historyIndex = 0;
let eventLog = [];
let quizIndex = 0;
let quizScore = 0;
let quizSelection = null;
let quizChecked = false;

const viewsList = [
  { id: 'home', title: 'Overview' },
  { id: 'commands', title: 'Network commands' },
  { id: 'protocols', title: 'Protocols' },
  { id: 'lan', title: 'LAN setup' },
  { id: 'server', title: 'Server setup' },
  { id: 'routing', title: 'Routing' },
  { id: 'quiz', title: 'Knowledge check' }
];

const protocolData = {
  tcp: {name:'Transmission Control Protocol', badge:'TCP', summary:'TCP provides a reliable, ordered byte stream. It uses a connection setup before application data is exchanged and retransmits lost segments when needed.', facts:[['Connection','Connection-oriented'],['Delivery','Reliable & ordered'],['Common uses','Web, email, file transfer']], title:'TCP three-way handshake', description:'See how a TCP connection is established before application data is exchanged.', scenario:'tcp'},
  udp: {name:'User Datagram Protocol', badge:'UDP', summary:'UDP sends independent datagrams without setting up a connection first. It has less protocol overhead, but delivery and order are not guaranteed by UDP itself.', facts:[['Connection','Connectionless'],['Delivery','Best effort'],['Common uses','DNS, live media, games']], title:'UDP datagram delivery', description:'Follow a datagram from the sender to the receiving application.', scenario:'udp'},
  http: {name:'Hypertext Transfer Protocol', badge:'HTTP', summary:'HTTP defines request and response messages used by web clients and servers. In this model, the client asks for a page and the lab server returns a sample response.', facts:[['Purpose','Web request / response'],['Typical port','80 (HTTP)'],['Secure variant','HTTPS uses TLS']], title:'HTTP request / response', description:'Trace a simple request from a browser-like client to the sample web server.', scenario:'http'},
  dns: {name:'Domain Name System', badge:'DNS', summary:'DNS maps human-readable names to records such as IP addresses. The client can then connect to the server using the returned address.', facts:[['Purpose','Name resolution'],['Typical port','53'],['Record used here','A record → IPv4']], title:'DNS name resolution', description:'Look up server.local and observe the A-record response.', scenario:'dns'},
  dhcp: {name:'Dynamic Host Configuration Protocol', badge:'DHCP', summary:'DHCP can automatically provide hosts with an IP address and other network settings. The familiar DORA exchange is Discover, Offer, Request, and Acknowledgement.', facts:[['Purpose','Automatic IP setup'],['Ports','UDP 67 / 68'],['Sequence','DORA']], title:'DHCP address assignment', description:'Step through the four-part DORA exchange that assigns a sample lease.', scenario:'dhcp'},
  arp: {name:'Address Resolution Protocol', badge:'ARP', summary:'On an IPv4 Ethernet LAN, ARP helps a device discover the MAC address associated with a local IPv4 address. A request is broadcast and the target can reply directly.', facts:[['Purpose','IPv4 → MAC mapping'],['Scope','Local network link'],['Message types','Request / reply']], title:'ARP address resolution', description:'See a local host discover the MAC address for another device on the LAN.', scenario:'arp'}
};

const quizQuestions = [
  {q:'Which command is commonly used to test whether an IP host is reachable?', options:['ipconfig','ping','arp -a','netstat'], answer:1, explain:'Ping tests reachability using echo request and echo reply messages in this model.'},
  {q:'Which protocol translates a domain name such as server.local into an IP address?', options:['DHCP','ARP','DNS','TCP'], answer:2, explain:'DNS retrieves records that associate names with addresses and other data.'},
  {q:'Which device forwards packets between different IP networks?', options:['Switch','Router','Repeater','Network printer'], answer:1, explain:'Routers use IP addresses and routing tables to choose the next hop.'},
  {q:'What does DHCP commonly provide to a client?', options:['An automatic IP configuration','A guaranteed TCP connection','A MAC address for every host','A web page'], answer:0, explain:'DHCP can assign an IP address, subnet mask, default gateway, and DNS server settings.'}
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

async function api(path, payload) {
  const options = payload === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)};
  const response = await fetch(path, options);
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unreadable response.'); }
  if (!response.ok && !data.message) throw new Error(`Request failed (${response.status}).`);
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}

function toast(message, type = '') {
  const region = $('#toast-region');
  const node = document.createElement('div');
  node.className = `toast ${type}`.trim();
  node.textContent = message;
  region.appendChild(node);
  window.setTimeout(() => node.remove(), 2900);
}

function switchView(view) {
  if (!$(`#view-${view}`)) return;
  currentView = view;
  $$('.view').forEach(section => section.classList.toggle('active', section.id === `view-${view}`));
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#current-crumb').textContent = $(`#view-${view}`).dataset.title || view;
  updatePresentationNav();
  $('#main-content').scrollIntoView({behavior:'smooth', block:'start'});
  if (view === 'protocols') renderProtocol();
  if (view === 'lan') { renderDeviceConfigs(); renderTopology('#lan-topology'); }
  if (view === 'routing') renderRoutingTable();
}

function addTerminalEntry(command, output, ok = true) {
  const area = $('#terminal-output');
  const commandLine = document.createElement('div');
  commandLine.className = 'terminal-command';
  commandLine.textContent = command.startsWith('python ') ? command : command;
  area.appendChild(commandLine);
  const result = document.createElement('div');
  result.className = `terminal-result ${ok ? '' : 'terminal-error'}`.trim();
  result.textContent = output || (ok ? 'Completed.' : 'Command failed.');
  area.appendChild(result);
  while (area.children.length > 42) area.removeChild(area.firstChild);
  area.scrollTop = area.scrollHeight;
  $('#last-run').textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function pushEvents(events = []) {
  if (!Array.isArray(events) || !events.length) return;
  eventLog.push(...events.map(event => ({...event, time:event.time || new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})})));
  eventLog = eventLog.slice(-30);
  renderEvents();
}

function renderEvents() {
  const list = $('#event-list');
  $('#event-count').textContent = `${eventLog.length} event${eventLog.length === 1 ? '' : 's'}`;
  if (!eventLog.length) {
    list.innerHTML = '<div class="event-empty"><span>≋</span><strong>No events yet</strong><small>Run a command or protocol sequence to see each modeled step.</small></div>';
    return;
  }
  list.innerHTML = eventLog.slice().reverse().map(event => `<div class="event-item ${event.kind === 'success' ? 'success' : event.kind === 'error' ? 'error' : ''}"><span class="event-marker"></span><div><div class="event-meta"><span>${escapeHtml(event.time)}</span><span>·</span><span>PYTHON SIM</span></div><div class="event-title">${escapeHtml(event.title || 'Simulation step')}</div><div class="event-detail">${escapeHtml(event.detail || '')}</div></div></div>`).join('');
}

function clearEvents() { eventLog = []; renderEvents(); }

function clearTerminal() {
  $('#terminal-output').innerHTML = '<div class="terminal-welcome">NETLAB PYTHON SIMULATOR <span>v1.0</span></div><div class="terminal-muted">Console cleared. Type <b>help</b> to see the supported commands.</div>';
  $('#last-run').textContent = 'Console cleared';
}

async function runCommand(command = $('#terminal-input').value) {
  const trimmed = String(command || '').trim();
  if (!trimmed) { $('#terminal-input').focus(); return; }
  if (trimmed.toLowerCase() === 'clear') { clearTerminal(); $('#terminal-input').value = ''; return; }
  commandHistory.push(trimmed); commandHistory = commandHistory.slice(-40); historyIndex = commandHistory.length;
  $('#terminal-input').value = '';
  $('#terminal-input').disabled = true;
  $('#terminal-form button').disabled = true;
  addTerminalEntry(trimmed, 'Running Python simulation…', true);
  try {
    const result = await api('/api/command', {command:trimmed, source:selectedSource});
    // Replace the temporary progress row to keep command/output pairs coherent.
    const area = $('#terminal-output');
    const children = Array.from(area.children);
    const progress = children[children.length - 1];
    const commandNode = children[children.length - 2];
    if (progress && progress.classList.contains('terminal-result')) progress.remove();
    if (commandNode && commandNode.classList.contains('terminal-command')) commandNode.textContent = trimmed;
    addResultOnly(result.output, result.ok);
    pushEvents(result.events || []);
    if (result.highlight) highlightPath(result.highlight);
    await refreshState(false);
    if (!result.ok) toast('Simulation completed with an unreachable or unavailable target.', 'error');
  } catch (error) {
    addResultOnly(`Could not reach the Python lab backend. Is app.py running?\n${error.message}`, false);
    toast('The Python lab backend is unavailable.', 'error');
  } finally {
    $('#terminal-input').disabled = false;
    $('#terminal-form button').disabled = false;
    $('#terminal-input').focus();
    $('#terminal-output').scrollTop = $('#terminal-output').scrollHeight;
  }
}

function addResultOnly(output, ok = true) {
  const area = $('#terminal-output');
  const result = document.createElement('div');
  result.className = `terminal-result ${ok ? '' : 'terminal-error'}`.trim();
  result.textContent = output || (ok ? 'Completed.' : 'Command failed.');
  area.appendChild(result);
  while (area.children.length > 42) area.removeChild(area.firstChild);
  area.scrollTop = area.scrollHeight;
  $('#last-run').textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

function nodeStateMarkup(name, host) {
  const typeClass = name === 'Router' ? 'router-node' : name === 'PC1' ? 'pc1-node' : name === 'PC2' ? 'pc2-node' : 'server-node';
  const drawing = name === 'Router' ? '<span class="device-drawing router-drawing"><i></i><i></i><i></i><i></i><b>↕</b></span>' : name === 'Server' ? '<span class="device-drawing server-drawing"><i></i><i></i><i></i></span>' : '<span class="device-drawing computer-drawing"><i></i><b></b></span>';
  const pos = name === 'Router' ? 'left:49.5%;top:5px;min-width:144px' : name === 'PC1' ? 'left:21%;top:115px' : name === 'PC2' ? 'left:49.5%;top:115px' : 'left:78%;top:115px';
  const sourceAttr = ['PC1','PC2','Server'].includes(name) ? `data-source="${name}"` : '';
  return `<button class="device-node ${typeClass} ${host.online ? '' : 'offline'}" style="${pos}" ${sourceAttr} title="${name}${['PC1','PC2','Server'].includes(name) ? ' · click to set console source' : ''}">${drawing}<strong>${name === 'Router' ? 'Router / Switch' : name}</strong><small>${escapeHtml(host.ip)}</small><span class="node-state"><i></i> ${host.online ? 'Online' : 'Offline'}</span></button>`;
}

function topologyMarkup() {
  return `<svg class="network-lines" viewBox="0 0 720 230" preserveAspectRatio="none" aria-hidden="true"><path class="link-line" id="line-pc1" d="M150 167 L356 78"/><path class="link-line" id="line-pc2" d="M355 167 L356 78"/><path class="link-line" id="line-server" d="M560 167 L356 78"/><circle class="line-node" cx="356" cy="78" r="4"/></svg>${Object.entries(labState.hosts).map(([name, host]) => nodeStateMarkup(name, host)).join('')}<div class="subnet-label"><span></span>LOCAL SUBNET <b>192.168.1.0/24</b></div>`;
}

function renderTopology(selector) {
  const container = $(selector);
  if (!container || !labState) return;
  container.innerHTML = topologyMarkup();
  if (selector === '#overview-topology') {
    // Keep initial visual layout and add the interactive data attributes to each device.
    const originals = $$('.device-node', container);
    originals.forEach(node => {
      if (node.classList.contains('router-node')) return;
      if (node.classList.contains('pc1-node')) node.dataset.source = 'PC1';
      if (node.classList.contains('pc2-node')) node.dataset.source = 'PC2';
      if (node.classList.contains('server-node')) node.dataset.source = 'Server';
    });
  }
  $$('.device-node', container).forEach(node => {
    if (node.dataset.source === selectedSource) node.classList.add('selected');
    node.addEventListener('click', () => {
      if (!node.dataset.source) { toast('The router is the lab gateway; choose a host as the command source.'); return; }
      setSource(node.dataset.source);
    });
  });
  Object.keys(labState.hosts).forEach(name => {
    const host = labState.hosts[name];
    const originalIp = $(`#ip-${name}`);
    if (originalIp) originalIp.textContent = host.ip;
    const state = $(`#state-${name}`);
    if (state) { state.classList.toggle('offline', !host.online); state.innerHTML = `<i></i> ${host.online ? 'Online' : 'Offline'}`; }
  });
}

function highlightPath(names) {
  const nameSet = new Set(names || []);
  ['#overview-topology','#lan-topology'].forEach(selector => {
    const root = $(selector);
    if (!root) return;
    $$('.link-line', root).forEach(line => line.classList.remove('active-path'));
    if (nameSet.has('PC1')) $('#line-pc1', root)?.classList.add('active-path');
    if (nameSet.has('PC2')) $('#line-pc2', root)?.classList.add('active-path');
    if (nameSet.has('Server')) $('#line-server', root)?.classList.add('active-path');
    window.setTimeout(() => $$('.link-line', root).forEach(line => line.classList.remove('active-path')), 2800);
  });
}

function setSource(name) {
  if (!['PC1','PC2','Server'].includes(name)) return;
  selectedSource = name;
  const sourceSelect = $('#console-source');
  if (sourceSelect) sourceSelect.value = name;
  renderTopology('#overview-topology');
  if ($('#lan-topology')) renderTopology('#lan-topology');
  renderRoutingTable();
  toast(`${name} selected as the console source.`, 'success');
}

function updateSourceOptions() {
  const select = $('#console-source');
  if (!select || !labState) return;
  const oldValue = selectedSource;
  select.innerHTML = ['PC1','PC2','Server'].map(name => `<option value="${name}">${name} · ${labState.hosts[name].ip}${labState.hosts[name].online ? '' : ' (offline)'}</option>`).join('');
  selectedSource = ['PC1','PC2','Server'].includes(oldValue) ? oldValue : 'PC1';
  select.value = selectedSource;
}

function renderOnlineSummary() {
  const count = Object.values(labState.hosts).filter(host => host.online).length;
  const text = `${count} device${count === 1 ? '' : 's'} online`;
  $('#online-summary').textContent = text;
  $('#lan-online-summary').textContent = text;
}

function renderDeviceConfigs() {
  if (!labState) return;
  const grid = $('#device-config-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(labState.hosts).map(([name, host]) => `<div class="device-config-card" data-device-card="${name}"><div class="device-config-head"><div><strong>${name === 'Router' ? 'Router / Default gateway' : name}</strong><small>${host.kind === 'router' ? 'Gateway interface' : host.kind === 'server' ? 'Host + services' : 'Workstation'}</small></div><span class="config-state ${host.online ? '' : 'offline'}">${host.online ? '● Online' : '● Offline'}</span></div><label for="ip-${name}-edit">IPv4 address</label><input type="text" id="ip-${name}-edit" value="${escapeHtml(host.ip)}" spellcheck="false" inputmode="decimal" aria-label="${name} IPv4 address"><div class="device-config-actions"><button class="small-button save-ip" data-device="${name}">Save IP</button><label class="switch-control" title="Toggle ${name} online status"><input type="checkbox" class="device-online-toggle" data-device="${name}" ${host.online ? 'checked' : ''} aria-label="${name} online"><span class="switch-visual"></span></label></div></div>`).join('');
  $$('.save-ip', grid).forEach(button => button.addEventListener('click', () => saveDeviceIp(button.dataset.device)));
  $$('.device-online-toggle', grid).forEach(input => input.addEventListener('change', () => updateDevice(input.dataset.device, 'online', input.checked)));
}

async function saveDeviceIp(device) {
  const field = $(`#ip-${device}-edit`);
  if (!field) return;
  await updateDevice(device, 'ip', field.value.trim());
}

async function updateDevice(device, field, value) {
  try {
    const result = await api('/api/device', {device, field, value});
    if (result.state) {
      labState = result.state;
      updateSourceOptions();
      renderAllState();
      toast(`${device} configuration updated.`, 'success');
    }
  } catch (error) {
    toast(error.message || 'Could not update device.', 'error');
    renderDeviceConfigs();
  }
}

function renderAllState() {
  if (!labState) return;
  renderTopology('#overview-topology');
  if ($('#lan-topology')) renderTopology('#lan-topology');
  renderOnlineSummary();
  renderDeviceConfigs();
  renderRoutingTable();
  $('#server-ip-label').textContent = labState.hosts.Server.ip;
  $('#web-toggle').checked = Boolean(labState.server_running);
  $('#dns-toggle').checked = Boolean(labState.dns_running);
  setServiceState('web-state', labState.server_running);
  setServiceState('dns-state', labState.dns_running);
}

function setServiceState(id, running) {
  const element = $(`#${id}`);
  if (!element) return;
  element.classList.toggle('stopped', !running);
  element.innerHTML = `<i></i> ${running ? 'Running' : 'Stopped'}`;
}

async function refreshState(showError = true) {
  try {
    labState = await api('/api/state');
    updateSourceOptions();
    renderAllState();
  } catch (error) {
    if (showError) toast(`Could not load lab state: ${error.message}`, 'error');
  }
}

function renderRoutingTable() {
  if (!labState) return;
  const source = labState.hosts[selectedSource] || labState.hosts.PC1;
  const gateway = labState.hosts.Router.online ? labState.hosts.Router.ip : 'unavailable';
  $('#routing-table-body').innerHTML = `<tr><td>0.0.0.0</td><td>0.0.0.0</td><td>${escapeHtml(gateway)}</td><td><span class="route-tag">Default</span></td></tr><tr><td>192.168.1.0</td><td>255.255.255.0</td><td>On-link</td><td><span class="route-tag local">Local</span></td></tr><tr><td>${escapeHtml(source.ip)}</td><td>255.255.255.255</td><td>On-link</td><td><span class="route-tag local">Host</span></td></tr>`;
}

function renderProtocol() {
  const data = protocolData[currentProtocol];
  if (!data) return;
  $$('.protocol-tab').forEach(button => button.classList.toggle('active', button.dataset.protocol === currentProtocol));
  $('#protocol-detail').innerHTML = `<div class="protocol-detail-top"><div class="protocol-badge">${escapeHtml(data.badge)}</div><div class="protocol-title"><h2>${escapeHtml(data.name)}</h2><p>${escapeHtml(data.summary)}</p></div></div><div class="protocol-facts">${data.facts.map(([label,value]) => `<div class="protocol-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>`;
  $('#sequence-title').textContent = data.title;
  $('#sequence-description').textContent = data.description;
  $('#protocol-timeline').innerHTML = '<div class="empty-timeline">Run the sequence to reveal protocol events.</div>';
}

async function runProtocolSequence() {
  const data = protocolData[currentProtocol];
  const button = $('#run-protocol');
  button.disabled = true;
  button.textContent = 'Running…';
  try {
    const result = await api('/api/simulate', {scenario:data.scenario});
    addTerminalEntry(`python simulate('${data.scenario}')`, result.output, result.ok);
    pushEvents(result.events || []);
    const timeline = $('#protocol-timeline');
    timeline.innerHTML = (result.events || []).map((event,index) => `<div class="timeline-step ${event.kind === 'success' ? 'success' : event.kind === 'error' ? 'error' : ''}"><span class="timeline-index">${String(index+1).padStart(2,'0')}</span><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p></div></div>`).join('') || '<div class="empty-timeline">No events were returned.</div>';
    if (!result.ok) toast('The service is stopped, so this flow did not complete.', 'error');
  } catch (error) { toast(error.message || 'Could not run protocol sequence.', 'error'); }
  finally { button.disabled = false; button.innerHTML = 'Run sequence <span>▶</span>'; }
}

async function runTrace() {
  const target = $('#trace-target').value.trim();
  if (!target) { toast('Enter a destination IPv4 address.', 'error'); return; }
  $('#terminal-input').value = `tracert ${target}`;
  await runCommand(`tracert ${target}`);
  const resultSteps = [
    {title:'Local gateway', ip:labState?.hosts?.Router?.ip || '192.168.1.1', time:'1–2 ms'},
    {title:'Sample upstream router', ip:'198.51.100.1', time:'8–9 ms'},
    {title:'Destination', ip:target, time:'18 ms'}
  ];
  $('#trace-steps').innerHTML = resultSteps.map((step,index) => `<div class="trace-stop"><span class="trace-pin">${index+1}</span><div><strong>${escapeHtml(step.title)}</strong><small>${escapeHtml(step.ip)}</small></div><span class="trace-time">${escapeHtml(step.time)}</span></div>`).join('');
}

function renderQuiz() {
  const question = quizQuestions[quizIndex];
  $('#quiz-progress-label').textContent = `QUESTION ${quizIndex+1} OF ${quizQuestions.length}`;
  $('#quiz-progress-bar').style.width = `${(quizIndex+1)/quizQuestions.length*100}%`;
  $('#quiz-score-label').textContent = `Score: ${quizScore}`;
  $('#quiz-number').textContent = `Q${quizIndex+1}`;
  $('#quiz-question').textContent = question.q;
  $('#quiz-feedback').className = '';
  $('#quiz-feedback').textContent = quizChecked ? (quizSelection === question.answer ? `Correct. ${question.explain}` : `Not quite. ${question.explain}`) : 'Choose one answer to check it.';
  if (quizChecked) $('#quiz-feedback').classList.add(quizSelection === question.answer ? 'good' : 'bad');
  $('#quiz-options').innerHTML = question.options.map((option,index) => `<label class="quiz-option ${quizSelection === index ? 'selected' : ''} ${quizChecked && index === question.answer ? 'correct' : ''} ${quizChecked && quizSelection === index && index !== question.answer ? 'incorrect' : ''}"><input type="radio" name="quiz-answer" value="${index}" ${quizSelection === index ? 'checked' : ''} ${quizChecked ? 'disabled' : ''}><span>${escapeHtml(option)}</span></label>`).join('');
  $$('#quiz-options input').forEach(input => input.addEventListener('change', () => {
    quizSelection = Number(input.value);
    $$('#quiz-options .quiz-option').forEach((label,index) => label.classList.toggle('selected', index === quizSelection));
    $('#quiz-next').disabled = quizSelection === null;
  }));
  $('#quiz-next').disabled = quizSelection === null && !quizChecked;
  $('#quiz-next').innerHTML = quizChecked ? (quizIndex === quizQuestions.length - 1 ? 'See results <span>→</span>' : 'Next question <span>→</span>') : 'Check answer <span>→</span>';
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
    quizIndex += 1; quizSelection = null; quizChecked = false; renderQuiz();
    return;
  }
  $('#quiz-card').innerHTML = `<div class="quiz-number">COMPLETE</div><h2>You scored ${quizScore} out of ${quizQuestions.length}.</h2><p class="lead">${quizScore === quizQuestions.length ? 'Excellent — you are ready to explain these concepts.' : quizScore >= 2 ? 'Good work. Revisit any module where you were unsure, then try again.' : 'Revisit the command, protocol, LAN, and routing modules before another attempt.'}</p><button class="primary-button" id="quiz-card-restart" style="margin-top:20px">Try again <span>↺</span></button>`;
  $('#quiz-card-restart').addEventListener('click', restartQuiz);
  $('#quiz-progress-label').textContent = 'QUIZ COMPLETE';
  $('#quiz-progress-bar').style.width = '100%';
  $('#quiz-score-label').textContent = `Score: ${quizScore}`;
}

function restartQuiz() { quizIndex=0; quizScore=0; quizSelection=null; quizChecked=false; renderQuiz(); }

async function setService(field, value) {
  try {
    const result = await api('/api/device', {device:'Server', field, value});
    labState = result.state;
    updateSourceOptions(); renderAllState();
    toast(`${field === 'server_running' ? 'Web service' : 'DNS service'} ${value ? 'started' : 'stopped'}.`, 'success');
  } catch (error) { toast(error.message || 'Could not change service state.', 'error'); await refreshState(false); }
}

async function resetLab() {
  try {
    await api('/api/reset', {});
    selectedSource = 'PC1';
    await refreshState(false);
    clearEvents(); clearTerminal();
    addTerminalEntry('system reset', 'Lab state restored to default IP addresses and running services.', true);
    restartQuiz();
    toast('Lab reset to defaults.', 'success');
  } catch (error) { toast(`Could not reset lab: ${error.message}`, 'error'); }
}

function updatePresentationNav() {
  const idx = viewsList.findIndex(v => v.id === currentView);
  const total = viewsList.length;
  const currentItem = viewsList[idx] || viewsList[0];
  const indicator = $('#pres-topic-indicator');
  if (indicator) {
    indicator.textContent = `${idx + 1} of ${total} · ${currentItem.title}`;
  }
  const prevBtn = $('#pres-prev-btn');
  if (prevBtn) prevBtn.disabled = (idx <= 0);
  const nextBtn = $('#pres-next-btn');
  if (nextBtn) nextBtn.disabled = (idx >= total - 1);
}

function prevTopic() {
  const idx = viewsList.findIndex(v => v.id === currentView);
  if (idx > 0) switchView(viewsList[idx - 1].id);
}

function nextTopic() {
  const idx = viewsList.findIndex(v => v.id === currentView);
  if (idx < viewsList.length - 1) switchView(viewsList[idx + 1].id);
}

function togglePresentationConsole() {
  const isHidden = document.body.classList.toggle('pres-hide-console');
  const label = $('#pres-console-label');
  if (label) label.textContent = isHidden ? 'Console: Hidden' : 'Console: Visible';
  toast(isHidden ? 'Live console hidden for slide focus.' : 'Live console visible alongside topic.');
}

function togglePresentationMode(force) {
  const isCurrentlyOn = document.body.classList.contains('presenter-mode');
  const willEnable = force !== undefined ? Boolean(force) : !isCurrentlyOn;
  
  if (willEnable) {
    document.body.classList.add('presenter-mode');
    $('#presentation-label').textContent = 'Exit Presentation';
    $('#presentation-mode').setAttribute('aria-pressed', 'true');
    $('#presentation-mode').classList.add('active');
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    toast('Classroom Presentation Mode active. Use ←/→ or PageUp/PageDown to present.', 'success');
  } else {
    document.body.classList.remove('presenter-mode');
    document.body.classList.remove('pres-hide-console');
    $('#presentation-label').textContent = 'Start Presentation';
    $('#presentation-mode').setAttribute('aria-pressed', 'false');
    $('#presentation-mode').classList.remove('active');
    const consoleLabel = $('#pres-console-label');
    if (consoleLabel) consoleLabel.textContent = 'Console: Visible';
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    toast('Returned to regular lab workspace.');
  }
  updatePresentationNav();
}

function attachHandlers() {
  $$('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#terminal-form').addEventListener('submit', event => { event.preventDefault(); runCommand(); });
  $('#terminal-input').addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && commandHistory.length) { event.preventDefault(); historyIndex=Math.max(0,historyIndex-1); $('#terminal-input').value=commandHistory[historyIndex] || ''; }
    if (event.key === 'ArrowDown' && commandHistory.length) { event.preventDefault(); historyIndex=Math.min(commandHistory.length,historyIndex+1); $('#terminal-input').value=commandHistory[historyIndex] || ''; }
  });
  $$('.preset-chips button, [data-command]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); const command=button.dataset.command; if (command) { $('#terminal-input').value=command; runCommand(command); } }));
  $('#clear-terminal').addEventListener('click', clearTerminal);
  $('#clear-events').addEventListener('click', clearEvents);
  $('#console-source').addEventListener('change', event => setSource(event.target.value));
  $('#presentation-mode').addEventListener('click', () => togglePresentationMode());
  $('#pres-prev-btn')?.addEventListener('click', prevTopic);
  $('#pres-next-btn')?.addEventListener('click', nextTopic);
  $('#pres-exit-btn')?.addEventListener('click', () => togglePresentationMode(false));
  $('#pres-toggle-console')?.addEventListener('click', togglePresentationConsole);
  $('#reset-lab').addEventListener('click', resetLab);
  $$('.protocol-tab').forEach(button => button.addEventListener('click', () => { currentProtocol=button.dataset.protocol; renderProtocol(); }));
  $('#run-protocol').addEventListener('click', runProtocolSequence);
  $('#web-toggle').addEventListener('change', event => setService('server_running', event.target.checked));
  $('#dns-toggle').addEventListener('change', event => setService('dns_running', event.target.checked));
  $('#test-web').addEventListener('click', () => runCommand('curl http://server.local'));
  $('#test-dns').addEventListener('click', () => runCommand('nslookup server.local'));
  $('#run-trace').addEventListener('click', runTrace);
  $('#trace-target').addEventListener('keydown', event => { if (event.key === 'Enter') runTrace(); });
  $('#reset-device-config').addEventListener('click', resetLab);
  $('#quiz-next').addEventListener('click', advanceQuiz);
  $('#quiz-restart').addEventListener('click', restartQuiz);

  // Keyboard navigation for presentation and lecture mode
  window.addEventListener('keydown', event => {
    const activeEl = document.activeElement;
    const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
    const isInput = tag === 'input' || tag === 'select' || tag === 'textarea';

    if (event.key === 'Escape' && document.body.classList.contains('presenter-mode')) {
      event.preventDefault();
      togglePresentationMode(false);
      return;
    }

    if (!isInput && (event.key === 'p' || event.key === 'P')) {
      event.preventDefault();
      togglePresentationMode();
      return;
    }

    if (document.body.classList.contains('presenter-mode')) {
      if (!isInput && (event.key === 'c' || event.key === 'C')) {
        event.preventDefault();
        togglePresentationConsole();
        return;
      }
      if (!isInput && (event.key === 'ArrowRight' || event.key === 'PageDown')) {
        event.preventDefault();
        nextTopic();
        return;
      }
      if (!isInput && (event.key === 'ArrowLeft' || event.key === 'PageUp')) {
        event.preventDefault();
        prevTopic();
        return;
      }
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('presenter-mode')) {
      // Keep UI in presenter mode with toolbar accessible
    }
  });
}

async function init() {
  attachHandlers();
  $('#lan-topology').innerHTML = '';
  renderProtocol();
  renderQuiz();
  await refreshState();
  // Render dynamic topology in the overview too, so all state changes stay in sync.
  renderTopology('#overview-topology');
  renderTopology('#lan-topology');
  renderOnlineSummary();
  renderDeviceConfigs();
}

document.addEventListener('DOMContentLoaded', init);
