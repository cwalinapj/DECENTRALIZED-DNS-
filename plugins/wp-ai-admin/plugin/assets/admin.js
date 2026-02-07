(() => {
  const cfg = window.DDNS_COMPUTE_CFG || {};
  const cpuInput = document.getElementById('ddns-compute-cpu');
  const memoryInput = document.getElementById('ddns-compute-memory');
  const minerUrlInput = document.getElementById('ddns-compute-miner-url');
  const commandEl = document.getElementById('ddns-compute-command');
  const copyBtn = document.getElementById('ddns-compute-copy');
  const proveBtn = document.getElementById('ddns-compute-prove');
  const statusEl = document.getElementById('ddns-compute-status');
  const consentEl = document.querySelector('input[name="ddns_compute_consent"]');
  const MAX_ERROR_MESSAGE_LENGTH = 160;

  const setStatus = (message, tone = '') => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', tone === 'error');
    statusEl.classList.toggle('is-success', tone === 'success');
  };

  const parsePort = (value) => {
    try {
      const url = new URL(value);
      if (url.port) return url.port;
      return url.protocol === 'https:' ? '443' : '80';
    } catch {
      return '8795';
    }
  };

  const buildCommand = () => {
    if (!commandEl) return;
    const cpu = cpuInput?.value.trim();
    const memory = memoryInput?.value.trim();
    const port = parsePort(minerUrlInput?.value || 'http://localhost:8795');
    const parts = [
      'docker run -d --name ddns-miner-cache --restart unless-stopped',
      '--read-only --cap-drop=ALL --security-opt no-new-privileges --pids-limit 128 --tmpfs /tmp',
    ];
    if (cpu) {
      parts.push(`--cpus ${cpu}`);
    }
    if (memory) {
      parts.push(`--memory ${memory}`);
    }
    parts.push(`-p ${port}:${port}`);
    parts.push('-v ddns-miner-cache:/var/lib/ddns');
    parts.push('ddns-miner-cache:latest');
    commandEl.value = parts.join(' ');
  };

  const post = async (action, data = {}) => {
    const body = new URLSearchParams({ action, nonce: cfg.wpNonce, ...data });
    const response = await fetch(cfg.ajaxUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body,
    });
    const payload = await response.json();
    if (!payload.success) {
      const error = payload.data?.message || payload.data?.error || 'Request failed.';
      throw new Error(error);
    }
    return payload.data;
  };

  const copyCommand = async () => {
    if (!commandEl) return;
    try {
      await navigator.clipboard.writeText(commandEl.value);
      setStatus('Command copied.', 'success');
    } catch (error) {
      setStatus('Copy failed.', 'error');
    }
  };

  const proveMiner = async () => {
    if (consentEl && !consentEl.checked) {
      setStatus('Consent is required before proving miner.', 'error');
      return;
    }
    const minerUrl = minerUrlInput?.value.trim();
    if (!minerUrl) {
      setStatus('Miner URL is required.', 'error');
      return;
    }
    setStatus('Requesting challenge...');
    const challenge = await post('ddns_compute_miner_challenge');
    const proofNonce = challenge.nonce;
    const proveResponse = await fetch(`${minerUrl.replace(/\/$/, '')}/prove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nonce: proofNonce }),
    });
    if (!proveResponse.ok) {
      const text = await proveResponse.text();
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.error || parsed.message || text;
      } catch {
        detail = text;
      }
      detail = (detail || '').trim();
      if (detail.length > MAX_ERROR_MESSAGE_LENGTH) {
        detail = `${detail.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`;
      }
      const suffix = detail ? `: ${detail}` : '';
      throw new Error(`Miner proof failed (${proveResponse.status})${suffix}`);
    }
    const proof = await proveResponse.json();
    await post('ddns_compute_miner_verify', {
      proof_nonce: proof.nonce || proofNonce,
      signature: proof.signature,
      public_key: proof.public_key,
    });
    setStatus('Credits: active', 'success');
  };

  copyBtn?.addEventListener('click', copyCommand);
  proveBtn?.addEventListener('click', () => {
    proveMiner().catch((error) => setStatus(error.message, 'error'));
  });
  [cpuInput, memoryInput, minerUrlInput].forEach((input) => {
    input?.addEventListener('input', buildCommand);
  });

  buildCommand();
})();
