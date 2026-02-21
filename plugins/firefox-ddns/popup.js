const LOCAL_BASE = "https://127.0.0.1:8443";
const VERIFY_NAME = "netflix.com";
const VERIFY_TYPE = "A";

const epLocal = document.getElementById("ep-local");
const epCustom = document.getElementById("ep-custom");
const customInput = document.getElementById("custom-url");
const statusNode = document.getElementById("status");

function baseUrl() {
  if (epLocal.checked) return LOCAL_BASE;
  const v = (customInput.value || "").trim().replace(/\/$/, "");
  return v || null;
}

function dohEndpoint(base) {
  return base + "/dns-query";
}

function trrPrefsBlock(base) {
  const ep = dohEndpoint(base);
  return [
    "# Paste each setting in about:config (search pref name, double-click to edit)",
    "network.trr.mode = 3",
    "network.trr.uri = " + ep,
    "network.trr.custom_uri = " + ep,
    "network.trr.allow-rfc1918 = true",
    "network.trr.bootstrapAddress = 127.0.0.1"
  ].join("\n");
}

function disableBlock() {
  return [
    "# Paste each setting in about:config to disable TRR",
    "network.trr.mode = 5",
    "network.trr.uri =",
    "network.trr.custom_uri ="
  ].join("\n");
}

function verifyUrl(base) {
  return base + "/v1/resolve?name=" + encodeURIComponent(VERIFY_NAME) + "&type=" + VERIFY_TYPE;
}

function verifyCurl(base) {
  return (
    "bash scripts/firefox_doh_verify.sh" +
    " --url " + base +
    " --name " + VERIFY_NAME +
    " --type " + VERIFY_TYPE +
    " --insecure"
  );
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    statusNode.textContent = "Copied " + label + ".";
  } catch {
    statusNode.textContent = "Clipboard write failed.";
  }
}

epLocal.addEventListener("change", () => {
  customInput.disabled = true;
});

epCustom.addEventListener("change", () => {
  customInput.disabled = false;
  customInput.focus();
});

document.getElementById("copy-trr").addEventListener("click", async () => {
  const base = baseUrl();
  if (!base) { statusNode.textContent = "Enter a custom base URL first."; return; }
  await copyText(trrPrefsBlock(base), "TRR prefs");
});

document.getElementById("copy-disable").addEventListener("click", async () => {
  await copyText(disableBlock(), "Disable TRR values");
});

document.getElementById("btn-verify").addEventListener("click", async () => {
  const base = baseUrl();
  if (!base) { statusNode.textContent = "Enter a custom base URL first."; return; }
  try {
    await browser.tabs.create({ url: verifyUrl(base) });
  } catch {
    statusNode.textContent = "Could not open tab. Check the tabs permission.";
  }
});

document.getElementById("copy-curl").addEventListener("click", async () => {
  const base = baseUrl();
  if (!base) { statusNode.textContent = "Enter a custom base URL first."; return; }
  await copyText(verifyCurl(base), "verify curl command");
});
