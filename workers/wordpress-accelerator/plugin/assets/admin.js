(function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function setStatus(el, msg, cls) {
    if (!el) return;
    el.textContent = msg;
    el.className = "ddns-accelerator-status " + (cls || "");
  }

  async function postAjax(action, payload) {
    const cfg = window.DDNS_ACCELERATOR_CFG || {};
    const body = new URLSearchParams(Object.assign({
      action,
      nonce: cfg.nonce || ""
    }, payload || {}));

    const res = await fetch(cfg.ajaxUrl || "", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body
    });

    const data = await res.json();
    return { ok: res.ok && data && data.success, data };
  }

  function updateZoneName() {
    const select = $("#ddns-accelerator-zone-id");
    const hidden = $("#ddns-accelerator-zone-name");
    if (!select || !hidden) return;
    const opt = select.options[select.selectedIndex];
    hidden.value = opt ? opt.textContent.trim() : "";
  }

  async function fetchZones() {
    const tokenInput = $("#ddns-accelerator-cf-token");
    const token = tokenInput ? tokenInput.value.trim() : "";
    const select = $("#ddns-accelerator-zone-id");
    const status = $("#ddns-accelerator-zone-status");

    setStatus(status, "Loading zones…", "ddns-warn");

    const res = await postAjax("ddns_accelerator_list_zones", { token });
    if (!res.ok) {
      const msg = res.data && res.data.data && res.data.data.message ? res.data.data.message : "Zone fetch failed.";
      setStatus(status, msg, "ddns-bad");
      return;
    }

    const zones = (res.data && res.data.data && res.data.data.zones) || [];
    if (select) {
      select.innerHTML = '<option value="">Select a zone</option>';
      zones.forEach((zone) => {
        const opt = document.createElement("option");
        opt.value = zone.id;
        opt.textContent = zone.name;
        select.appendChild(opt);
      });
    }

    updateZoneName();
    setStatus(status, "Zones loaded.", "ddns-good");
  }

  async function installWorker() {
    const status = $("#ddns-accelerator-install-status");
    setStatus(status, "Installing worker…", "ddns-warn");

    const res = await postAjax("ddns_accelerator_install_worker", {});
    if (!res.ok) {
      const msg = res.data && res.data.data && res.data.data.message ? res.data.data.message : "Install failed.";
      setStatus(status, msg, "ddns-bad");
      return;
    }

    setStatus(status, res.data.data.message || "Install queued.", "ddns-good");
  }

  async function runSnapshot() {
    const status = $("#ddns-accelerator-snapshot-status");
    setStatus(status, "Syncing…", "ddns-warn");

    const res = await postAjax("ddns_accelerator_run_snapshot", {});
    if (!res.ok) {
      const msg = res.data && res.data.data && res.data.data.message ? res.data.data.message : "Snapshot failed.";
      setStatus(status, msg, "ddns-bad");
      return;
    }

    setStatus(status, res.data.data.message || "Snapshot complete.", "ddns-good");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const fetchBtn = $("#ddns-accelerator-fetch-zones");
    const installBtn = $("#ddns-accelerator-install-worker");
    const snapshotBtn = $("#ddns-accelerator-run-snapshot");
    const zoneSelect = $("#ddns-accelerator-zone-id");

    if (fetchBtn) fetchBtn.addEventListener("click", fetchZones);
    if (installBtn) installBtn.addEventListener("click", installWorker);
    if (snapshotBtn) snapshotBtn.addEventListener("click", runSnapshot);
    if (zoneSelect) zoneSelect.addEventListener("change", updateZoneName);

    updateZoneName();
  });
})();
