const gatewayInput = document.getElementById("gateway-url");
const statusNode = document.getElementById("status");

function gatewayUrl() {
  const value = String(gatewayInput?.value || "").trim();
  return value || "http://127.0.0.1:8054/dns-query";
}

function enableConfigBlock(url) {
  return [
    "# about:config",
    "network.trr.mode=3",
    `network.trr.uri=${url}`,
    `network.trr.custom_uri=${url}`,
    "network.trr.allow-rfc1918=true",
    "network.trr.bootstrapAddress=127.0.0.1"
  ].join("\n");
}

function disableConfigBlock() {
  return [
    "# about:config",
    "network.trr.mode=5",
    "network.trr.uri=",
    "network.trr.custom_uri="
  ].join("\n");
}

function policiesJsonBlock(url) {
  return JSON.stringify({
    policies: {
      DNSOverHTTPS: {
        Enabled: true,
        ProviderURL: url,
        Locked: false
      }
    }
  }, null, 2);
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    statusNode.textContent = `Copied ${label}.`;
  } catch {
    statusNode.textContent = `Clipboard write failed. Copy manually:\n${text}`;
  }
}

document.getElementById("copy-enable")?.addEventListener("click", async () => {
  await copyText(enableConfigBlock(gatewayUrl()), "Enable DDNS DoH values");
});

document.getElementById("copy-disable")?.addEventListener("click", async () => {
  await copyText(disableConfigBlock(), "Disable DDNS DoH values");
});

document.getElementById("copy-policy")?.addEventListener("click", async () => {
  await copyText(policiesJsonBlock(gatewayUrl()), "policies.json snippet");
});
