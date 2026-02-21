/* global document, fetch */
(() => {
  const DATA_PATHS = ['../../reports/latest.json', './latest.json'];

  const tiles = document.getElementById('tiles');
  const latest = document.getElementById('latest');
  const results = document.getElementById('results');
  const txLinks = document.getElementById('tx-links');
  const notes = document.getElementById('notes');

  function safe(v, fallback = '—') {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
  }

  function classify(status) {
    const s = String(status || '').toLowerCase();
    if (s.includes('pass') || s === 'seen' || s === 'ok') return 'ok';
    if (s.includes('fail') || s.includes('missing')) return 'bad';
    return 'warn';
  }

  function tile(label, value, klass) {
    const node = document.createElement('section');
    node.className = 'card';
    node.innerHTML = `<div class="label">${label}</div><div class="value ${klass || ''}">${value}</div>`;
    return node;
  }

  async function loadLatest() {
    for (const p of DATA_PATHS) {
      try {
        const resp = await fetch(p, { cache: 'no-store' });
        if (!resp.ok) continue;
        const json = await resp.json();
        return { json, source: p };
      } catch (_err) {
        // Try next path.
      }
    }
    return { json: null, source: null };
  }

  function renderEmpty() {
    tiles.innerHTML = '';
    tiles.appendChild(tile('Status', 'No data yet', 'warn'));
    tiles.appendChild(tile('Source', 'reports/latest.json missing', 'warn'));
    latest.innerHTML = '<div class="empty">No report found. Run <span class="mono">bash scripts/generate_dashboard_report.sh</span> first.</div>';
    results.innerHTML = '<tr><td colspan="3">No checks available.</td></tr>';
    txLinks.innerHTML = '<li>None</li>';
    notes.textContent = 'No notes yet.';
  }

  function render(data, source) {
    const checks = Array.isArray(data.results) ? data.results : [];
    const demoOk = !!data.demo_ok;

    tiles.innerHTML = '';
    tiles.appendChild(tile('Generated UTC', safe(data.timestamp_utc), ''));
    tiles.appendChild(tile('Commit', `<span class="mono">${safe(data.git_sha, 'unknown')}</span>`, ''));
    tiles.appendChild(tile('MVP Demo', demoOk ? 'PASS' : 'NOT CONFIRMED', demoOk ? 'ok' : 'warn'));
    tiles.appendChild(tile('Checks', String(checks.length), checks.length > 0 ? 'ok' : 'warn'));

    latest.innerHTML = `
      <div class="card">
        <p><strong>source:</strong> <span class="mono">${safe(source, 'unknown')}</span></p>
        <p><strong>branch:</strong> <span class="mono">${safe(data.branch, 'unknown')}</span></p>
        <p><strong>canonical command:</strong> <span class="mono">npm run mvp:demo:devnet</span></p>
      </div>
    `;

    results.innerHTML = '';
    if (checks.length === 0) {
      results.innerHTML = '<tr><td colspan="3">No checks found in report.</td></tr>';
    } else {
      for (const row of checks) {
        const tr = document.createElement('tr');
        const status = safe(row.status, 'unknown');
        tr.innerHTML = `
          <td class="mono">${safe(row.name)}</td>
          <td class="${classify(status)}"><strong>${status}</strong></td>
          <td>${safe(row.detail)}</td>
        `;
        results.appendChild(tr);
      }
    }

    const txs = Array.isArray(data.tx_links) ? data.tx_links : [];
    txLinks.innerHTML = '';
    if (txs.length === 0) {
      txLinks.innerHTML = '<li>No tx links recorded.</li>';
    } else {
      for (const link of txs) {
        const li = document.createElement('li');
        const href = safe(link, '');
        li.innerHTML = `<a href="${href}" target="_blank" rel="noreferrer">${href}</a>`;
        txLinks.appendChild(li);
      }
    }

    const noteLines = Array.isArray(data.notes) ? data.notes : ['No notes'];
    notes.textContent = noteLines.join('\n');
  }

  loadLatest().then(({ json, source }) => {
    if (!json) {
      renderEmpty();
      return;
    }
    render(json, source);
  });
})();
