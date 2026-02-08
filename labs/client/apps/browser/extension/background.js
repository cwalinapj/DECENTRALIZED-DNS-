// DDNS Wallet extension background
const state = {
  connected: false,
  dnsEnabled: false
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'DDNS_TOGGLE_DNS') {
    state.dnsEnabled = !!msg.enabled;
    sendResponse({ ok: true, dnsEnabled: state.dnsEnabled });
    return true;
  }
  if (msg && msg.type === 'DDNS_CONNECT_WALLET') {
    state.connected = true;
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
