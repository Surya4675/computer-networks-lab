// Pure, side-effect-free helpers shared by the NetLab UI.
// Kept free of DOM/browser globals so they can be unit-tested with `node --test`.

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

// Quote-aware tokenizer mirroring the backend's shlex.split.
// Returns null when quotation marks are unbalanced.
export function tokenize(raw) {
  const input = String(raw ?? '');
  const tokens = [];
  let current = '';
  let quote = null;
  let hasToken = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      hasToken = true;
    } else if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
    } else if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
    } else {
      current += char;
      hasToken = true;
    }
  }
  if (quote) return null;
  if (hasToken) tokens.push(current);
  return tokens;
}

export function pushHistory(history, command, limit = 50) {
  const next = history.filter((item) => item !== command);
  next.push(command);
  return next.slice(-limit);
}

// Move through command history. `direction` is 'up' or 'down'.
export function navigateHistory(history, index, direction) {
  if (!history.length) return { value: '', index: 0 };
  const delta = direction === 'up' ? -1 : 1;
  let next = index + delta;
  if (next < 0) next = 0;
  if (next > history.length) next = history.length;
  return { value: next >= history.length ? '' : history[next], index: next };
}

export function formatResultText(result) {
  const output = result && result.output ? String(result.output).trim() : '';
  const error = result && result.error ? String(result.error).trim() : '';
  if (output && error && !output.includes(error)) return `${output}\n\n${error}`;
  if (output) return output;
  if (error) return error;
  return result && result.ok ? 'Completed.' : 'Command failed.';
}

export function kindClass(kind) {
  if (kind === 'success') return 'success';
  if (kind === 'error') return 'error';
  return '';
}

export function quizFeedback(question, selection, checked) {
  if (!checked || selection === null || selection === undefined) {
    return { text: 'Choose one answer to check it.', state: '' };
  }
  const correct = selection === question.answer;
  return {
    text: `${correct ? 'Correct.' : 'Not quite.'} ${question.explain}`,
    state: correct ? 'good' : 'bad',
  };
}

export function summarizeHosts(hosts) {
  const list = Object.values(hosts || {});
  const online = list.filter((host) => host.online).length;
  return { total: list.length, online, label: `${online} of ${list.length} devices online` };
}

export function formatHexDump(hexStr) {
  if (!hexStr || typeof hexStr !== 'string') return '';
  const clean = hexStr.replace(/[^0-9a-fA-F]/g, '');
  if (!clean) return '';
  const lines = [];
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(clean.slice(i, i + 2).toLowerCase());
  }
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(4, '0');
    const first8 = chunk.slice(0, 8).map((b) => b.padStart(2, '0')).join(' ');
    const second8 = chunk.slice(8, 16).map((b) => b.padStart(2, '0')).join(' ');
    let hexCol = first8;
    if (second8) {
      hexCol += '  ' + second8;
    }
    const asciiCol = chunk.map((b) => {
      const code = parseInt(b, 16);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
    }).join('');
    lines.push(`${offset}  ${hexCol.padEnd(48, ' ')}   ${asciiCol}`);
  }
  return lines.join('\n');
}

export function filterPackets(packets, query) {
  if (!Array.isArray(packets)) return [];
  const q = String(query ?? '').trim().toLowerCase();
  if (!q || q === 'all' || q === '*') return packets;

  // Normalized display filter matches
  const isSynFilter = q === 'syn' || q.includes('flags.syn==1') || q.includes('flags.syn == 1');
  const isSynAckFilter = q === 'syn-ack' || q === 'synack' || (q.includes('syn') && q.includes('ack'));
  const isAckFilter = q === 'ack' || q.includes('flags.ack==1') || q.includes('flags.ack == 1');

  return packets.filter((pkt) => {
    const stage = String(pkt.stage || '').toLowerCase();
    const proto = String(pkt.protocol || '').toLowerCase();
    const info = String(pkt.info || '').toLowerCase();
    const src = String(pkt.source || '').toLowerCase();
    const dst = String(pkt.destination || '').toLowerCase();

    if (isSynAckFilter) {
      return stage === 'syn-ack' || info.includes('syn, ack') || info.includes('syn-ack');
    }
    if (isSynFilter) {
      return stage === 'syn' || (info.includes('[syn]') && !info.includes('ack'));
    }
    if (isAckFilter) {
      return stage === 'ack' || info.includes('[ack]');
    }

    if (q.startsWith('ip.addr==') || q.startsWith('ip.addr ==')) {
      const addr = q.split('==')[1].trim();
      return src === addr || dst === addr;
    }
    if (q.startsWith('tcp.port==') || q.startsWith('tcp.port ==')) {
      const port = q.split('==')[1].trim();
      return info.includes(port);
    }

    return (
      proto.includes(q) ||
      stage.includes(q) ||
      info.includes(q) ||
      src.includes(q) ||
      dst.includes(q)
    );
  });
}

export function formatWiresharkAsciiTable(packets, title = 'Packet Capture') {
  if (!Array.isArray(packets) || !packets.length) return 'No packets captured.\n';
  const header = `[Wireshark Packet Capture] ${title}`;
  const sep = '='.repeat(84);
  const thin = '-'.repeat(84);
  const rows = [
    sep,
    header,
    `No.  Time        Source          Destination     Proto  Len  Info`,
    thin,
  ];
  packets.forEach((p) => {
    const no = String(p.no).padEnd(4, ' ');
    const time = String(p.time).padEnd(11, ' ');
    const src = String(p.source).padEnd(15, ' ');
    const dst = String(p.destination).padEnd(15, ' ');
    const proto = String(p.protocol).padEnd(6, ' ');
    const len = String(p.length).padEnd(4, ' ');
    const info = String(p.info || '');
    rows.push(`${no} ${time} ${src} ${dst} ${proto} ${len} ${info}`);
  });
  rows.push(sep);
  return rows.join('\n');
}

export function getProtocolColorClass(protocol, info = '', stage = '') {
  const p = String(protocol || '').toUpperCase();
  const inf = String(info || '').toUpperCase();
  const stg = String(stage || '').toUpperCase();

  if (p === 'TCP') {
    if (stg === 'SYN-ACK' || inf.includes('SYN, ACK') || inf.includes('SYN-ACK')) return 'ws-tcp-synack';
    if (stg === 'SYN' || inf.includes('[SYN]')) return 'ws-tcp-syn';
    if (stg === 'ACK' || inf.includes('[ACK]')) return 'ws-tcp-ack';
    if (inf.includes('RST')) return 'ws-tcp-rst';
    return 'ws-tcp';
  }
  if (p === 'UDP') return 'ws-udp';
  if (p === 'HTTP') return 'ws-http';
  if (p === 'DNS') return 'ws-dns';
  if (p === 'DHCP') return 'ws-dhcp';
  if (p === 'ARP') return 'ws-arp';
  return 'ws-default';
}

