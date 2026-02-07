(function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function randomNonce() {
    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(8);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    }
    return Math.random().toString(16).slice(2);
  }

  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      mode: "cors",
      credentials: "omit",
      cache: "no-store"
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { json = null; }
    return { ok: r.ok, status: r.status, json, text };
  }

  function setMsg(el, msg, cls) {
    el.textContent = msg;
    el.className = "ddns-optin-message " + (cls || "");
  }

  function buildCategoryUI(form, categories) {
    // If you want categories in the form, inject them here.
    // Keeps shortcode HTML simple.
    if (!categories || !categories.length) return;

    const wrap = document.createElement("div");
    wrap.className = "ddns-optin-cats";
    wrap.innerHTML = `<div class="ddns-optin-cats-title">Select Categories</div>`;
    categories.forEach((c) => {
      const id = "ddns-cat-" + c.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const label = document.createElement("label");
      label.className = "ddns-optin-cat";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "ddns_optin_categories";
      input.value = c;
      input.id = id;
      input.checked = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c));
      wrap.appendChild(label);
    });

    // insert before message span
    const msg = $(".ddns-optin-message", form);
    if (msg) form.insertBefore(wrap, msg);
  }

  function initForm(form) {
    const msg = $(".ddns-optin-message", form);
    const cfg = window.DDNS_OPTIN_CFG || {};
    const endpoint = (cfg.endpoint || "").trim();
    const siteId = (cfg.site_id || "").trim();
    const categories = Array.isArray(cfg.categories) ? cfg.categories : [];

    if (!endpoint || !siteId) {
      setMsg(msg, "Opt-in is not configured (missing endpoint or site_id).", "ddns-bad");
      return;
    }

    // Inject categories (optional UI)
    buildCategoryUI(form, categories);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const emailEl = $('input[name="ddns_optin_email"]', form);
      const email = (emailEl ? emailEl.value : "").trim();

      // Collect selected categories (if present)
      const selected = $all('input[name="ddns_optin_categories"]:checked', form).map(x => x.value);

      setMsg(msg, "Submitting…", "ddns-warn");

      const payload = {
        site_id: siteId,
        email,
        categories: selected.length ? selected : categories,
        ts: Math.floor(Date.now() / 1000),
        nonce: randomNonce() + "-" + Date.now(),
        page_url: location.href
      };

      const res = await postJSON(endpoint, payload);

      if (res.ok && res.json && res.json.ok) {
        setMsg(msg, "Thanks — you're opted in.", "ddns-good");
        form.reset();
      } else {
        setMsg(msg, "Submission failed. Please try again later.", "ddns-bad");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    $all('form[data-ddns-optin="1"]').forEach(initForm);
  });
})();
