(() => {
  const cfg = window.DDNS_COMPAT_ADMIN || {};
  const statusEl = document.getElementById('ddns-compat-status');
  const reportEl = document.getElementById('ddns-compat-report');
  const walletStatusEl = document.getElementById('ddns-compat-wallet-status');
  const payStatusEl = document.getElementById('ddns-compat-pay-status');
  const minerStatusEl = document.getElementById('ddns-compat-miner-status');

  const setStatus = (el, message, tone = '') => {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', tone === 'error');
    el.classList.toggle('is-success', tone === 'success');
  };

  const post = async (action, data = {}) => {
    const body = new URLSearchParams({ action, nonce: cfg.nonce, ...data });
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

  const renderReport = (data) => {
    if (!reportEl) return;
    reportEl.innerHTML = '';
    const status = document.createElement('p');
    status.textContent = `Status: ${data.status || 'unknown'}`;
    reportEl.appendChild(status);

    if (data.summary) {
      const summary = document.createElement('p');
      summary.textContent = `Summary: ${data.summary}`;
      reportEl.appendChild(summary);
    }

    if (data.report_url) {
      const link = document.createElement('a');
      link.href = data.report_url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'View HTML report';
      reportEl.appendChild(link);
    }

    if (data.changes) {
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(data.changes, null, 2);
      reportEl.appendChild(pre);
    }
  };

  const connectBtn = document.getElementById('ddns-compat-connect');
  connectBtn?.addEventListener('click', async () => {
    try {
      setStatus(statusEl, 'Connecting staging...');
      const data = await post('ddns_compat_connect');
      cfg.siteId = data.site_id || cfg.siteId;
      setStatus(statusEl, `Connected staging (${cfg.siteId}).`, 'success');
    } catch (error) {
      setStatus(statusEl, error.message, 'error');
    }
  });

  const runBtn = document.getElementById('ddns-compat-run');
  runBtn?.addEventListener('click', async () => {
    try {
      setStatus(statusEl, 'Running compatibility check...');
      const data = await post('ddns_compat_run_check');
      cfg.lastJobId = data.job_id || cfg.lastJobId;
      setStatus(statusEl, `Job queued: ${cfg.lastJobId}`, 'success');
      if (data.report) {
        renderReport(data.report);
      }
    } catch (error) {
      setStatus(statusEl, error.message, 'error');
    }
  });

  const refreshBtn = document.getElementById('ddns-compat-refresh');
  refreshBtn?.addEventListener('click', async () => {
    try {
      setStatus(statusEl, 'Fetching report...');
      const data = await post('ddns_compat_fetch_report', { jobId: cfg.lastJobId || '' });
      renderReport(data);
      setStatus(statusEl, 'Report updated.', 'success');
    } catch (error) {
      setStatus(statusEl, error.message, 'error');
    }
  });

  const updateWalletStatus = (chain, address) => {
    if (!walletStatusEl) return;
    if (chain && address) {
      walletStatusEl.textContent = `Connected: ${chain} ${address}`;
    } else {
      walletStatusEl.textContent = 'No wallet connected yet.';
    }
  };

  const connectEvm = async () => {
    if (!window.ethereum) {
      throw new Error('No EVM wallet detected.');
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const address = accounts?.[0];
    if (!address) {
      throw new Error('No EVM account selected.');
    }
    const challenge = await post('ddns_compat_wallet_challenge', {
      chain: 'evm',
      address,
    });
    const message = challenge.message || challenge.challenge;
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, address],
    });
    await post('ddns_compat_wallet_verify', {
      chain: 'evm',
      address,
      message,
      signature,
    });
    updateWalletStatus('EVM', address);
  };

  const toBase64 = (bytes) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const connectSolana = async () => {
    const provider = window.solana;
    if (!provider?.connect || !provider?.signMessage) {
      throw new Error('No Solana wallet detected.');
    }
    const response = await provider.connect();
    const address = response?.publicKey?.toString() || provider.publicKey?.toString();
    if (!address) {
      throw new Error('No Solana account selected.');
    }
    const challenge = await post('ddns_compat_wallet_challenge', {
      chain: 'solana',
      address,
    });
    const message = challenge.message || challenge.challenge;
    const encoded = new TextEncoder().encode(message);
    const signed = await provider.signMessage(encoded, 'utf8');
    const signature = toBase64(signed.signature || signed);
    await post('ddns_compat_wallet_verify', {
      chain: 'solana',
      address,
      message,
      signature,
    });
    updateWalletStatus('Solana', address);
  };

  const evmBtn = document.getElementById('ddns-compat-wallet-evm');
  evmBtn?.addEventListener('click', async () => {
    try {
      setStatus(walletStatusEl, 'Connecting EVM wallet...');
      await connectEvm();
      setStatus(walletStatusEl, 'EVM wallet connected.', 'success');
    } catch (error) {
      setStatus(walletStatusEl, error.message, 'error');
    }
  });

  const solBtn = document.getElementById('ddns-compat-wallet-solana');
  solBtn?.addEventListener('click', async () => {
    try {
      setStatus(walletStatusEl, 'Connecting Solana wallet...');
      await connectSolana();
      setStatus(walletStatusEl, 'Solana wallet connected.', 'success');
    } catch (error) {
      setStatus(walletStatusEl, error.message, 'error');
    }
  });

  const payBtn = document.getElementById('ddns-compat-pay');
  payBtn?.addEventListener('click', async () => {
    try {
      setStatus(payStatusEl, 'Requesting payment...', '');
      const data = await post('ddns_compat_create_payment');
      const summary = data.address
        ? `Send ${data.amount} ${data.asset} to ${data.address}.`
        : 'Payment created.';
      setStatus(payStatusEl, summary, 'success');
    } catch (error) {
      setStatus(payStatusEl, error.message, 'error');
    }
  });

  const minerBtn = document.getElementById('ddns-compat-miner-verify');
  minerBtn?.addEventListener('click', async () => {
    const tokenInput = document.getElementById('ddns-compat-miner-token');
    try {
      setStatus(minerStatusEl, 'Verifying miner proof...');
      const data = await post('ddns_compat_miner_proof', {
        token: tokenInput?.value || '',
      });
      setStatus(minerStatusEl, data.message || 'Miner proof accepted.', 'success');
    } catch (error) {
      setStatus(minerStatusEl, error.message, 'error');
    }
  });
})();
