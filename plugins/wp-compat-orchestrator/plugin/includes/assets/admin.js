(function () {
  const s = (id) => document.getElementById(id);
  const post = async (action) => {
    const body = new URLSearchParams();
    body.set("action", action);
    body.set("nonce", (window.DDNS_COMPAT_CFG && DDNS_COMPAT_CFG.nonce) || "");
    const r = await fetch((window.DDNS_COMPAT_CFG && DDNS_COMPAT_CFG.ajaxUrl) || "", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
      body
    });
    return r.json();
  };

  function setStatus(msg) { s("ddnsStatus").textContent = "Status: " + msg; }
  function setReport(obj) { s("ddnsReport").textContent = JSON.stringify(obj, null, 2); }

  document.addEventListener("DOMContentLoaded", () => {
    const btnReg = s("ddnsRegister");
    const btnRun = s("ddnsRunCheck");
    const btnPoll = s("ddnsPoll");

    if (btnReg) btnReg.onclick = async () => {
      setStatus("registering…");
      const j = await post("ddns_compat_register");
      if (!j.ok) return setStatus("register failed: " + j.error);
      setStatus("registered site_id=" + j.site.site_id);
      setReport(j);
    };

    if (btnRun) btnRun.onclick = async () => {
      setStatus("exporting + uploading + starting job…");
      const j = await post("ddns_compat_run");
      if (!j.ok) return setStatus("run failed: " + j.error);
      setStatus("job started: " + j.job.id);
      setReport(j);
    };

    if (btnPoll) btnPoll.onclick = async () => {
      setStatus("polling…");
      const j = await post("ddns_compat_poll");
      if (!j.ok) return setStatus("poll failed: " + j.error);
      setStatus("job " + j.job.state);
      setReport(j.job);
    };

    // placeholders
    const w = s("ddnsWallet"); if (w) w.onclick = () => alert("Wallet connect: implement in control-plane UI");
    const p = s("ddnsPay"); if (p) p.onclick = () => alert("Payment: implement in control-plane UI");
    const m = s("ddnsProveMiner"); if (m) m.onclick = () => alert("Miner proof: implement signed challenge flow");
  });
})();
