(function () {
  const { esc, fmtDate, amount, amountText, seal } = UI;
  const store = Store.create();
  UI.init("clients", store);

  const $ = (id) => document.getElementById(id);
  const listEl = $("clients");

  let sales = null;
  let orders = null;
  let loadError = null;
  let clients = [];
  let openKey = null;

  const pct = (part, whole) => (whole ? Math.min(100, Math.floor((part / whole) * 100)) : 100);
  const bar = (value, label, kind) =>
    `<div class="bar ${kind === "pay" ? "bar-pay" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${esc(label)}"><span style="width:${value}%"></span></div>`;

  // ---------- Liste ----------
  function visible() {
    const q = UI.clientKey($("c-search").value);
    return clients.filter((c) => (!q || c.key.includes(q)) && (!$("c-due").checked || c.due > 0));
  }

  function render() {
    if (!sales && !loadError) {
      listEl.innerHTML = '<p class="state" role="status">Lecture du registre et des commandes…</p>';
      return;
    }
    if (!sales) {
      listEl.innerHTML = `
        <div class="state state-error" role="alert">
          <p>Les clients n'ont pas pu être chargés. ${esc(loadError.message)}</p>
          <button class="btn" data-retry>Réessayer</button>
        </div>`;
      return;
    }
    const warn = loadError ? `<p class="meta meta-warn" role="status">Connexion perdue, nouvel essai dans un instant.</p>` : "";
    const list = visible();
    if (!list.length) {
      listEl.innerHTML =
        warn +
        `<p class="state">${
          !clients.length
            ? "Aucun client pour l'instant. Dès qu'une vente ou une commande porte un nom de client, il apparaît ici."
            : $("c-due").checked && !$("c-search").value
            ? "Personne ne doit rien à la forge."
            : "Aucun client ne correspond à cette recherche."
        }</p>`;
      return;
    }
    listEl.innerHTML =
      warn +
      `<ul class="clients">${list
        .map(
          (c) => `
        <li class="client" data-client="${esc(c.key)}">
          <div class="client-main">
            <h2>${esc(c.name)}</h2>
            <p class="meta">Dernière visite le ${fmtDate(c.last)}</p>
            <p class="client-counts">
              ${c.sales.length} vente${c.sales.length > 1 ? "s" : ""} · ${c.orders.length} commande${c.orders.length > 1 ? "s" : ""}${
            c.openOrders ? ` <strong class="client-open">dont ${c.openOrders} en cours</strong>` : ""
          }
            </p>
          </div>
          <dl class="client-money">
            <div><dt>Payé à la forge</dt><dd>${amount(c.paidToForge)}</dd></div>
            ${c.due ? `<div class="pay-short"><dt>Reste dû</dt><dd>${amount(c.due)}</dd></div>` : ""}
          </dl>
          <button class="btn" data-open="${esc(c.key)}" aria-label="Voir la fiche de ${esc(c.name)}">Voir la fiche</button>
        </li>`
        )
        .join("")}</ul>`;
  }

  listEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-retry]")) {
      UI.allowLoginPrompt();
      loadError = null;
      sales = null;
      render();
      return load();
    }
    const card = e.target.closest(".client");
    if (!card || (e.target.closest("button, a") && !e.target.closest("[data-open]"))) return;
    openDetail(card.dataset.client, card.querySelector("[data-open]"));
  });
  $("c-search").addEventListener("input", render);
  $("c-due").addEventListener("change", render);

  // ---------- Fiche client ----------
  function orderBlock(o) {
    const total = UI.orderTotal(o);
    const paid = UI.orderPaid(o);
    const pieces = o.lignes.reduce((t, l) => t + l.qty, 0);
    const made = o.lignes.reduce((t, l) => t + l.done, 0);
    const pMade = pct(made, pieces);
    const pPaid = pct(paid, total);
    const state = o.deliveredAt ? `Livrée le ${fmtDate(o.deliveredAt)}` : made >= pieces ? "Prête à livrer" : "En fabrication";
    return `
      <li class="cf-order">
        <div class="cf-row">
          <strong>${o.lignes.map((l) => `${l.qty} × ${esc(l.name)}`).join(" · ")}</strong>
          <span>${amount(total)}</span>
        </div>
        <p class="meta">${esc(state)} · créée le ${fmtDate(o.createdAt)} par ${esc(o.createdBy)}</p>
        <div class="order-bars">
          <div class="order-bar"><p><span>Fabrication</span><strong>${pMade} %</strong><span class="meta">${made} / ${pieces}</span></p>${bar(pMade, `Fabrication : ${pMade} %`)}</div>
          <div class="order-bar"><p><span>Paiement</span><strong>${pPaid} %</strong><span class="meta">${amountText(paid)} sur ${amountText(total)}</span></p>${bar(pPaid, `Paiement : ${pPaid} %`, "pay")}</div>
        </div>
        <a class="btn btn-quiet cf-link" href="commandes.html#commande=${encodeURIComponent(o.id)}">Suivre cette commande</a>
      </li>`;
  }

  function saleBlock(s) {
    const paid = UI.salePaid(s);
    let pay = "Paiement non noté";
    if (paid) {
      const diff = paid - s.total;
      pay = `Payé ${amountText(paid)}${diff > 0 ? `, rendu ${amountText(diff)}` : diff < 0 ? `, <span class="pay-short">reste dû ${amountText(-diff)}</span>` : ""}`;
    }
    return `
      <li class="cf-sale">
        <div class="cf-row">
          <span>${fmtDate(s.date)} · vendu par <strong>${esc(s.vendeur)}</strong></span>
          <span>${amount(s.total)}</span>
        </div>
        <p class="cf-items">${s.lignes.map((l) => `${l.qty} × ${esc(l.name)}`).join(" · ")}</p>
        <p class="meta">${pay}${s.note ? ` · ${esc(s.note)}` : ""}</p>
      </li>`;
  }

  function renderDetail() {
    const dlg = $("client-dialog");
    const c = clients.find((x) => x.key === openKey);
    if (!c) return dlg.close();
    const sellers = [...new Set(c.sales.map((s) => s.vendeur).concat(c.orders.map((o) => o.createdBy)))];
    dlg.innerHTML = `
      <div class="detail">
        <div class="detail-head">
          ${seal(c.name)}
          <div>
            <h2 id="cd-title">${esc(c.name)}</h2>
            <p class="meta">Dernière visite le ${fmtDate(c.last)}${sellers.length ? ` · servi par ${sellers.map(esc).join(", ")}` : ""}</p>
          </div>
        </div>
        <dl class="detail-dl">
          <div><dt>Ventes au registre</dt><dd>${c.sales.length}</dd></div>
          <div><dt>Commandes</dt><dd>${c.orders.length}${c.openOrders ? ` (${c.openOrders} en cours)` : ""}</dd></div>
          <div><dt>Payé à la forge</dt><dd>${amount(c.paidToForge)}</dd></div>
          ${
            c.due
              ? `<div class="detail-key pay-short"><dt>Reste dû</dt><dd>${amount(c.due)}</dd></div>`
              : `<div class="detail-key"><dt>Reste dû</dt><dd>Rien</dd></div>`
          }
        </dl>

        <h3>Commandes</h3>
        ${c.orders.length ? `<ul class="cf-list">${c.orders.map(orderBlock).join("")}</ul>` : `<p class="detail-empty">Aucune commande.</p>`}

        <h3>Ventes au registre</h3>
        ${c.sales.length ? `<ul class="cf-list">${c.sales.map(saleBlock).join("")}</ul>` : `<p class="detail-empty">Aucune vente.</p>`}

        <div class="row-end">
          <a class="btn" href="commandes.html#nouvelle=${encodeURIComponent(c.name)}">Nouvelle commande pour ${esc(c.name)}</a>
          <button type="button" class="btn btn-primary" data-close>Fermer</button>
        </div>
      </div>`;
  }

  function openDetail(key, from) {
    openKey = key;
    let dlg = $("client-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "client-dialog";
      dlg.className = "wide-dialog";
      dlg.setAttribute("aria-labelledby", "cd-title");
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
      });
      dlg.addEventListener("close", () => {
        openKey = null;
        if (dlg.returnTo && document.contains(dlg.returnTo)) dlg.returnTo.focus();
      });
    }
    dlg.returnTo = from;
    renderDetail();
    dlg.showModal();
    dlg.querySelector("[data-close]").focus();
  }

  // Lien direct : clients.html#client=Kenji
  function openFromHash() {
    const m = location.hash.match(/^#client=(.+)$/);
    if (!m) return;
    const key = UI.clientKey(decodeURIComponent(m[1]));
    history.replaceState(null, "", location.pathname);
    if (!clients.some((c) => c.key === key)) return UI.toast("Ce client n'a pas encore de vente ni de commande");
    openDetail(key, listEl.querySelector(`[data-client="${CSS.escape(key)}"] [data-open]`));
  }

  // ---------- Chargement ----------
  async function load() {
    try {
      const [s, o] = await Promise.all([UI.run(() => store.getSales()), UI.run(() => store.getOrders())]);
      sales = s;
      orders = o;
      loadError = null;
      clients = UI.clientsFrom(sales, orders);
    } catch (e) {
      loadError = e;
    }
    render();
  }

  window.addEventListener("hashchange", openFromHash);
  render();
  load().then(openFromHash);
  UI.poll(load, () => !!document.querySelector("dialog[open]"));
})();
