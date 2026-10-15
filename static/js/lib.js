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
