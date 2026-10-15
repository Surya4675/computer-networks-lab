import test from 'node:test';
import assert from 'node:assert/strict';

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
} from '../../static/js/lib.js';

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('tokenize splits on whitespace', () => {
  assert.deepEqual(tokenize('ping 1.1.1.1'), ['ping', '1.1.1.1']);
});

test('tokenize honours quotes', () => {
  assert.deepEqual(tokenize('curl "https://example.com/a b"'), ['curl', 'https://example.com/a b']);
});

test('tokenize returns null on unbalanced quotes', () => {
  assert.equal(tokenize('ping "oops'), null);
});

test('tokenize ignores redundant whitespace', () => {
  assert.deepEqual(tokenize('   nslookup    example.com  '), ['nslookup', 'example.com']);
});

test('pushHistory appends and de-duplicates', () => {
  let history = [];
  history = pushHistory(history, 'ping');
  history = pushHistory(history, 'ipconfig');
  history = pushHistory(history, 'ping');
  assert.deepEqual(history, ['ipconfig', 'ping']);
});

test('pushHistory enforces a limit', () => {
  let history = [];
  for (let i = 0; i < 5; i += 1) history = pushHistory(history, `cmd${i}`, 3);
  assert.deepEqual(history, ['cmd2', 'cmd3', 'cmd4']);
});

test('navigateHistory walks up and down', () => {
  const history = ['a', 'b', 'c'];
  let move = navigateHistory(history, 3, 'up');
  assert.deepEqual(move, { value: 'c', index: 2 });
  move = navigateHistory(history, move.index, 'up');
  assert.deepEqual(move, { value: 'b', index: 1 });
  move = navigateHistory(history, move.index, 'down');
  assert.deepEqual(move, { value: 'c', index: 2 });
  move = navigateHistory(history, move.index, 'down');
  assert.deepEqual(move, { value: '', index: 3 });
});

test('navigateHistory clamps on empty history', () => {
  assert.deepEqual(navigateHistory([], 0, 'up'), { value: '', index: 0 });
});

test('formatResultText prefers output', () => {
  assert.equal(formatResultText({ ok: true, output: 'hi', error: '' }), 'hi');
});

test('formatResultText appends distinct error', () => {
  assert.equal(formatResultText({ ok: false, output: 'partial', error: 'boom' }), 'partial\n\nboom');
});

test('formatResultText avoids duplicating error in output', () => {
  assert.equal(formatResultText({ ok: false, output: 'boom', error: 'boom' }), 'boom');
});

test('formatResultText falls back by status', () => {
  assert.equal(formatResultText({ ok: true }), 'Completed.');
  assert.equal(formatResultText({ ok: false }), 'Command failed.');
});

test('kindClass maps known kinds', () => {
  assert.equal(kindClass('success'), 'success');
  assert.equal(kindClass('error'), 'error');
  assert.equal(kindClass('info'), '');
  assert.equal(kindClass(undefined), '');
});

test('quizFeedback marks correct answers', () => {
  const question = { answer: 1, explain: 'Because.' };
  assert.equal(quizFeedback(question, 1, true).state, 'good');
  assert.equal(quizFeedback(question, 0, true).state, 'bad');
  assert.equal(quizFeedback(question, null, false).state, '');
});

test('summarizeHosts counts online devices', () => {
  const summary = summarizeHosts({ a: { online: true }, b: { online: false }, c: { online: true } });
  assert.deepEqual(summary, { total: 3, online: 2, label: '2 of 3 devices online' });
});

test('formatHexDump produces 16-byte lines with offset and ascii', () => {
  const hex = '48656c6c6f20576f726c6421'; // "Hello World!" (12 bytes)
  const dumped = formatHexDump(hex);
  assert.match(dumped, /^0000\s+/);
  assert.match(dumped, /48 65 6c 6c 6f 20 57 6f/);
  assert.match(dumped, /Hello World!/);
  assert.equal(formatHexDump(''), '');
});

test('filterPackets filters by SYN, SYN-ACK, ACK, and protocol', () => {
  const packets = [
    { no: 1, protocol: 'TCP', stage: 'SYN', info: '54321 → 80 [SYN] Seq=0', source: '192.168.1.10', destination: '192.168.1.100' },
    { no: 2, protocol: 'TCP', stage: 'SYN-ACK', info: '80 → 54321 [SYN, ACK] Seq=0 Ack=1', source: '192.168.1.100', destination: '192.168.1.10' },
    { no: 3, protocol: 'TCP', stage: 'ACK', info: '54321 → 80 [ACK] Seq=1 Ack=1', source: '192.168.1.10', destination: '192.168.1.100' },
    { no: 4, protocol: 'UDP', stage: 'Datagram', info: '9999 → 51234 Len=20', source: '192.168.1.10', destination: '192.168.1.100' },
  ];

  assert.equal(filterPackets(packets, 'all').length, 4);
  assert.equal(filterPackets(packets, '').length, 4);

  const syns = filterPackets(packets, 'syn');
  assert.equal(syns.length, 1);
  assert.equal(syns[0].stage, 'SYN');

  const synacks = filterPackets(packets, 'syn-ack');
  assert.equal(synacks.length, 1);
  assert.equal(synacks[0].stage, 'SYN-ACK');

  const acks = filterPackets(packets, 'ack');
  assert.equal(acks.length, 1);
  assert.equal(acks[0].stage, 'ACK');

  const udps = filterPackets(packets, 'udp');
  assert.equal(udps.length, 1);
  assert.equal(udps[0].protocol, 'UDP');
});

test('formatWiresharkAsciiTable outputs headers and rows', () => {
  const packets = [
    { no: 1, time: '0.000000', source: '192.168.1.10', destination: '192.168.1.100', protocol: 'TCP', length: 74, info: '[SYN]' },
  ];
  const table = formatWiresharkAsciiTable(packets, 'TCP 3-Way Handshake');
  assert.match(table, /\[Wireshark Packet Capture\] TCP 3-Way Handshake/);
  assert.match(table, /No\.\s+Time\s+Source/);
  assert.match(table, /1\s+0\.000000\s+192\.168\.1\.10/);
});

test('getProtocolColorClass returns correct Wireshark classes', () => {
  assert.equal(getProtocolColorClass('TCP', '[SYN]', 'SYN'), 'ws-tcp-syn');
  assert.equal(getProtocolColorClass('TCP', '[SYN, ACK]', 'SYN-ACK'), 'ws-tcp-synack');
  assert.equal(getProtocolColorClass('TCP', '[ACK]', 'ACK'), 'ws-tcp-ack');
  assert.equal(getProtocolColorClass('UDP'), 'ws-udp');
  assert.equal(getProtocolColorClass('HTTP'), 'ws-http');
  assert.equal(getProtocolColorClass('DNS'), 'ws-dns');
  assert.equal(getProtocolColorClass('DHCP'), 'ws-dhcp');
  assert.equal(getProtocolColorClass('ARP'), 'ws-arp');
});

