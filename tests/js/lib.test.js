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
