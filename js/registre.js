(function () {
  const { esc, fmtDate, amount, amountText, seal } = UI;
  const store = Store.create();
  UI.init("registre", store);

  const $ = (id) => document.getElementById(id);
  const form = $("sale-form");
  const linesEl = $("lines");
  const formError = $("form-error");

  let prices = { categories: [] };
  let sales = null;
  let salesError = null;
  let lines = [newLine()];
  let orders = [];

  // Suggestions de clients déjà venus (ventes + commandes)
  const clientBox = UI.clientField($("f-client"), $("f-client-hint"), () => UI.clientsFrom(sales, orders));

  // Le vendeur est toujours le compte connecté.
  function renderSeller() {
    $("f-vendeur").innerHTML = UI.me()
      ? `${seal(UI.me())}<span>Vendue par <strong>${esc(UI.me())}</strong></span>`
      : `<span>Connecte-toi pour inscrire une vente.</span>`;
  }

  // ---------- Formulaire ----------
  function newLine() {
    return { key: "", name: "", qty: 1, unit: "" };
  }

  function findItem(key) {
    for (const c of prices.categories) for (const it of c.items) if (c.id + "/" + it.id === key) return { cat: c, item: it };
    return null;
  }

  function itemOptions(selected) {
    return (
      `<option value="">Choisir un article</option>` +
      prices.categories
        .map(
          (c) =>
            `<optgroup label="${esc(c.name)}">${c.items
              .map((it) => {
                const key = c.id + "/" + it.id;
                const p = it.price != null ? ` (${amountText(it.price)})` : " (prix à fixer)";
                return `<option value="${esc(key)}" ${key === selected ? "selected" : ""}>${esc(it.name)}${p}</option>`;
              })
              .join("")}</optgroup>`
        )
        .join("") +
      `<option value="autre" ${selected === "autre" ? "selected" : ""}>Autre article (à écrire)</option>`
    );
  }

  function renderLines() {
    linesEl.innerHTML = lines
      .map(
        (l, i) => `
      <div class="line">
        ${
          l.key === "autre"
            ? `<input data-i="${i}" data-f="name" value="${esc(l.name)}" maxlength="100" aria-label="Nom de l'article ${i + 1}" placeholder="Nom de l'article" />`
            : `<select data-i="${i}" data-f="key" aria-label="Article ${i + 1}">${itemOptions(l.key)}</select>`
        }
        <input data-i="${i}" data-f="qty" type="number" min="1" step="1" inputmode="numeric" value="${esc(l.qty)}" aria-label="Quantité de l'article ${i + 1}" />
        <input data-i="${i}" data-f="unit" type="number" min="0" step="1" inputmode="numeric" value="${esc(l.unit)}" aria-label="Prix unitaire en cuivre de l'article ${i + 1}" placeholder="0" />
        <button type="button" class="btn btn-quiet btn-danger btn-x" data-del="${i}" aria-label="Retirer l'article ${i + 1}" ${lines.length === 1 ? "disabled" : ""}>×</button>
      </div>`
      )
      .join("");
    renderTotal();
  }

  const lineTotal = (l) => (Math.max(0, Math.round(Number(l.qty))) || 0) * (Math.max(0, Math.round(Number(l.unit))) || 0);
  const formTotal = () => lines.reduce((s, l) => s + lineTotal(l), 0);
  const coins = (id) => Math.max(0, Math.round(Number($(id).value))) || 0;
  const paidTotal = () => coins("f-argent") * UI.SILVER + coins("f-cuivre");

  function renderTotal() {
    $("f-total").innerHTML = amount(formTotal());
    renderPayment();
  }

  // Monnaie à rendre (ou reste à payer) selon les pièces données par le client.
  function renderPayment() {
    const total = formTotal();
    const paid = paidTotal();
    const out = $("pay-status");
    out.classList.remove("pay-short");
    if (!paid) out.innerHTML = "1 pièce d'argent vaut 100 pièces de cuivre.";
    else if (paid >= total) out.innerHTML = `Monnaie à rendre : <strong>${amount(paid - total)}</strong>`;
    else {
      out.classList.add("pay-short");
      out.innerHTML = `Reste à payer : <strong>${amount(total - paid)}</strong>`;
    }
  }
  ["f-argent", "f-cuivre"].forEach((id) => $(id).addEventListener("input", renderPayment));

  linesEl.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.f !== "key") return;
    const i = +t.dataset.i;
    const l = lines[i];
    l.key = t.value;
    const found = l.key && l.key !== "autre" ? findItem(l.key) : null;
    l.name = found ? `${found.item.name} (${found.cat.name})` : "";
    l.unit = found && found.item.price != null ? found.item.price : "";
    renderLines();
    const next = linesEl.querySelector(l.key === "autre" ? `[data-i="${i}"][data-f="name"]` : `[data-i="${i}"][data-f="qty"]`);
    next?.focus();
  });

  linesEl.addEventListener("input", (e) => {
    const t = e.target;
    const l = lines[+t.dataset.i];
    if (!l || t.dataset.f === "key") return;
    l[t.dataset.f] = t.value;
    renderTotal();
  });

  linesEl.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-del]");
    if (!b) return;
    const i = +b.dataset.del;
    lines.splice(i, 1);
    renderLines();
    linesEl.querySelector(`[data-i="${Math.max(0, i - 1)}"]`)?.focus();
  });

  $("add-line").addEventListener("click", () => {
    lines.push(newLine());
    renderLines();
    linesEl.querySelector(`[data-i="${lines.length - 1}"]`)?.focus();
  });

  function showFormError(msg) {
    formError.textContent = msg;
    formError.hidden = !msg;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError("");
    const valid = lines.filter((l) => l.name.trim());
    if (!valid.length) {
      showFormError("Choisis au moins un article.");
      return linesEl.querySelector("select, input")?.focus();
    }
    if (valid.some((l) => !(Number(l.qty) >= 1))) return showFormError("Chaque quantité doit être d'au moins 1.");

    const sale = {
      client: $("f-client").value.trim(),
      note: $("f-note").value.trim(),
      paiement: { argent: coins("f-argent"), cuivre: coins("f-cuivre") },
      lignes: valid.map((l) => ({
        name: l.name.trim(),
        qty: Math.round(Number(l.qty)),
        unit: Math.max(0, Math.round(Number(l.unit))) || 0,
      })),
    };
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Inscription…";
    try {
      const saved = await UI.run(() => store.addSale(sale));
      lines = [newLine()];
      $("f-client").value = "";
      clientBox.update();
      $("f-note").value = "";
      $("f-argent").value = "";
      $("f-cuivre").value = "";
      renderLines();
      UI.toast(`Vente de ${amountText(saved.total)} inscrite au registre`);
      await loadSales();
    } catch (err) {
      showFormError("La vente n'a pas été inscrite. " + err.message);
    }
    btn.disabled = false;
    btn.textContent = "Inscrire au registre";
  });

  // ---------- Registre ----------
  const fltVendeur = $("flt-vendeur");
  const fltSearch = $("flt-search");

  function filtered() {
    const v = fltVendeur.value;
    const q = fltSearch.value.trim().toLowerCase();
    return (sales || []).filter((s) => {
      if (v && s.vendeur !== v) return false;
      if (!q) return true;
      return [s.vendeur, s.client, s.note, ...s.lignes.map((l) => l.name)].join(" ").toLowerCase().includes(q);
    });
  }

  function renderSales() {
    const out = $("sales");
    if (!sales && !salesError) {
      out.innerHTML = '<p class="state" role="status">Ouverture du registre…</p>';
      return;
    }
    if (!sales) {
      out.innerHTML = `
        <div class="state state-error" role="alert">
          <p>Le registre n'a pas pu être chargé. ${esc(salesError.message)}</p>
          <button class="btn" data-retry>Réessayer</button>
        </div>`;
      $("summary").innerHTML = "";
      return;
    }

    const vendeurs = [...new Set(sales.map((s) => s.vendeur))].sort((a, b) => a.localeCompare(b, "fr"));
    const current = fltVendeur.value;
    fltVendeur.innerHTML =
      `<option value="">Tous</option>` + vendeurs.map((v) => `<option ${v === current ? "selected" : ""}>${esc(v)}</option>`).join("");

    const list = filtered();

    // Comptes par vendeur
    const byV = new Map();
    list.forEach((s) => {
      const d = byV.get(s.vendeur) || { n: 0, total: 0 };
      d.n++;
      d.total += s.total;
      byV.set(s.vendeur, d);
    });
    const grand = list.reduce((t, s) => t + s.total, 0);
    $("summary").innerHTML = list.length
      ? `
        <div class="account-total">
          <span class="account-label">${fltVendeur.value || fltSearch.value ? "Total filtré" : "Total du registre"}</span>
          <strong>${amount(grand)}</strong>
          <span class="account-sub">${list.length} vente${list.length > 1 ? "s" : ""}</span>
        </div>
        <ul class="account-list">
          ${[...byV]
            .sort((a, b) => b[1].total - a[1].total)
            .map(
              ([v, d]) => `
            <li class="account">
              ${seal(v)}
              <span class="account-name">${esc(v)}</span>
              <strong>${amount(d.total)}</strong>
              <span class="account-sub">${d.n} vente${d.n > 1 ? "s" : ""}</span>
            </li>`
            )
            .join("")}
        </ul>`
      : "";

    const warn = salesError ? `<p class="meta meta-warn" role="status">Connexion perdue, nouvel essai dans un instant.</p>` : "";

    if (!list.length) {
      out.innerHTML =
        warn +
        `<p class="state">${
          sales.length ? "Aucune vente ne correspond à ce filtre." : "Le registre est vide. La première vente inscrite apparaîtra ici."
        }</p>`;
      return;
    }

    out.innerHTML =
      warn +
      `<ol class="entries">${list
        .map(
          (s) => `
        <li class="entry" data-sale="${esc(s.id)}">
          ${seal(s.vendeur)}
          <div class="entry-main">
            <p class="entry-head">
              <strong>${esc(s.vendeur)}</strong>
              ${s.client ? `<span>à ${UI.clientLink(s.client)}</span>` : ""}
              <time datetime="${new Date(s.date).toISOString()}">${fmtDate(s.date)}</time>
            </p>
            <ul class="entry-lines">
              ${s.lignes.map((l) => `<li><span>${l.qty} × ${esc(l.name)}</span><span class="entry-unit">${amountText(l.unit)} l'unité</span></li>`).join("")}
            </ul>
            ${paymentLine(s)}
            ${s.note ? `<p class="entry-note">${esc(s.note)}</p>` : ""}
          </div>
          <div class="entry-side">
            <span class="entry-total">${amount(s.total)}</span>
            <span class="entry-actions">
              <button class="btn btn-quiet" data-detail="${esc(s.id)}" aria-label="Détails de la vente de ${esc(s.vendeur)} du ${fmtDate(s.date)}">Détails</button>
              ${s.vendeur === UI.me() ? `<button class="btn btn-quiet btn-danger" data-del-sale="${esc(s.id)}" aria-label="Effacer la vente de ${esc(s.vendeur)} du ${fmtDate(s.date)}">Effacer</button>` : ""}
            </span>
          </div>
        </li>`
        )
        .join("")}</ol>`;
  }

  const paidOf = (s) => (s.paiement ? s.paiement.argent * UI.SILVER + s.paiement.cuivre : 0);

  function paymentLine(s) {
    const paid = paidOf(s);
    if (!paid) return "";
    const given = [s.paiement.argent ? `${s.paiement.argent} argent` : "", s.paiement.cuivre ? `${s.paiement.cuivre} cuivre` : ""]
      .filter(Boolean)
      .join(" et ");
    const rest =
      paid >= s.total
        ? paid > s.total
          ? `, rendu ${amountText(paid - s.total)}`
          : ""
        : `, <span class="pay-short">reste dû ${amountText(s.total - paid)}</span>`;
    return `<p class="entry-pay">Payé ${given}${rest}</p>`;
  }

  $("sales").addEventListener("click", async (e) => {
    if (e.target.closest("[data-retry]")) {
      UI.allowLoginPrompt();
      salesError = null;
      renderSales();
      await loadPrices();
      renderSeller();
      return loadSales();
    }
    const del = e.target.closest("button[data-del-sale]");
    if (del) return removeSale(sales.find((x) => x.id === del.dataset.delSale), del);
    // Un clic n'importe où sur la ligne (hors bouton ou lien) ouvre la fiche.
    const row = e.target.closest("[data-detail], .entry");
    if (!row || (e.target.closest("button, a") && !e.target.closest("[data-detail]"))) return;
    const s = sales.find((x) => x.id === (row.dataset.detail || row.dataset.sale));
    if (s) openDetail(s, row.closest(".entry").querySelector("[data-detail]"));
  });

  async function removeSale(s, btn) {
    if (!s || !confirm(`Effacer la vente de ${s.vendeur} du ${fmtDate(s.date)} (${amountText(s.total)}) ?`)) return false;
    btn.disabled = true;
    try {
      await UI.run(() => store.deleteSale(s.id));
      UI.toast("Vente effacée du registre");
      await loadSales();
      fltSearch.focus();
      return true;
    } catch (err) {
      alert("La vente n'a pas été effacée. " + err.message);
      btn.disabled = false;
      return false;
    }
  }

  // ---------- Fiche détail d'une vente ----------
  function openDetail(s, returnFocus) {
    let dlg = $("sale-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "sale-dialog";
      dlg.setAttribute("aria-labelledby", "detail-title");
      document.body.appendChild(dlg);
      // Clic sur le fond sombre : ferme la fiche.
      dlg.addEventListener("click", (e) => e.target === dlg && dlg.close());
    }
    const paid = paidOf(s);
    const p = s.paiement || { argent: 0, cuivre: 0 };
    const long = new Date(s.date).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

    let payment;
    if (!paid) payment = `<p class="detail-empty">Le paiement n'a pas été noté pour cette vente.</p>`;
    else {
      const diff = paid - s.total;
      payment = `
        <dl class="detail-dl">
          <div><dt>Pièces d'argent données</dt><dd>${p.argent}${p.argent ? ` <span class="detail-sub">(${p.argent * UI.SILVER} cuivre)</span>` : ""}</dd></div>
          <div><dt>Pièces de cuivre données</dt><dd>${p.cuivre}</dd></div>
          <div><dt>Total donné</dt><dd>${amount(paid)}</dd></div>
          ${
            diff >= 0
              ? `<div class="detail-key"><dt>Monnaie rendue</dt><dd>${diff ? amount(diff) : "Compte juste, rien à rendre"}</dd></div>`
              : `<div class="detail-key pay-short"><dt>Reste dû</dt><dd>${amount(-diff)}</dd></div>`
          }
        </dl>`;
    }

    dlg.innerHTML = `
      <div class="detail">
        <div class="detail-head">
          ${seal(s.vendeur)}
          <div>
            <h2 id="detail-title">Vente de ${esc(s.vendeur)}</h2>
            <p class="meta">${esc(long)}</p>
          </div>
        </div>
        <dl class="detail-dl">
          <div><dt>Client</dt><dd>${s.client ? UI.clientLink(s.client) : '<span class="detail-sub">Non précisé</span>'}</dd></div>
        </dl>
        <h3>Articles</h3>
        <div class="detail-table-wrap">
          <table class="detail-lines">
            <thead><tr><th scope="col">Article</th><th scope="col" class="num">Qté</th><th scope="col" class="num">Prix u.</th><th scope="col" class="num">Total</th></tr></thead>
            <tbody>
              ${s.lignes
                .map(
                  (l) =>
                    `<tr><td>${esc(l.name)}</td><td class="num">${l.qty}</td><td class="num">${amount(l.unit)}</td><td class="num">${amount(l.qty * l.unit)}</td></tr>`
                )
                .join("")}
            </tbody>
            <tfoot><tr><th scope="row" colspan="3">Total de la vente</th><td class="num">${amount(s.total)}</td></tr></tfoot>
          </table>
        </div>
        <h3>Paiement</h3>
        ${payment}
        ${s.note ? `<h3>Remarque</h3><p class="detail-note">${esc(s.note)}</p>` : ""}
        <div class="row-end">
          ${s.vendeur === UI.me() ? `<button type="button" class="btn btn-quiet btn-danger" data-detail-del>Effacer cette vente</button>` : ""}
          <button type="button" class="btn btn-primary" data-detail-close>Fermer</button>
        </div>
      </div>`;

    dlg.querySelector("[data-detail-close]").addEventListener("click", () => dlg.close());
    dlg.querySelector("[data-detail-del]")?.addEventListener("click", async (e) => {
      if (await removeSale(s, e.currentTarget)) dlg.close();
    });
    dlg.onclose = () => returnFocus && document.contains(returnFocus) && returnFocus.focus();
    dlg.showModal();
    dlg.querySelector("[data-detail-close]").focus();
  }

  fltVendeur.addEventListener("change", renderSales);
  fltSearch.addEventListener("input", renderSales);

  $("export").addEventListener("click", () => {
    const list = filtered();
    if (!list.length) return UI.toast("Rien à télécharger avec ce filtre");
    const rows = [["Date", "Vendeur", "Client", "Articles", "Total (cuivre)", "Total", "Payé argent", "Payé cuivre", "Rendu (cuivre)", "Remarque"]];
    list.forEach((s) => {
      const paid = paidOf(s);
      rows.push([
        fmtDate(s.date),
        s.vendeur,
        s.client,
        s.lignes.map((l) => `${l.qty} x ${l.name} (${l.unit})`).join(" + "),
        s.total,
        amountText(s.total),
        s.paiement ? s.paiement.argent : 0,
        s.paiement ? s.paiement.cuivre : 0,
        paid ? paid - s.total : "",
        s.note,
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `registre-forge-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- Chargement ----------
  async function loadSales() {
    try {
      sales = await UI.run(() => store.getSales());
      salesError = null;
    } catch (e) {
      salesError = e;
    }
    renderSales();
    clientBox.refresh();
  }

  // Les commandes ne servent ici qu'à reconnaître les clients.
  async function loadOrders() {
    try {
      orders = await UI.run(() => store.getOrders());
      clientBox.refresh();
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPrices() {
    try {
      prices = await UI.run(() => store.getPrices());
    } catch (e) {
      // Sans la liste, on peut toujours écrire l'article à la main.
      console.error(e);
    }
    // Ne pas écraser une ligne en cours de saisie
    if (!linesEl.contains(document.activeElement)) renderLines();
  }

  renderLines();
  renderSeller();
  renderSales();
  loadPrices().then(() => {
    renderSeller();
    return loadSales().then(loadOrders);
  });
  UI.poll(() => {
    loadSales();
    loadPrices();
    loadOrders();
  }, () => document.querySelector("dialog[open]"));
})();
