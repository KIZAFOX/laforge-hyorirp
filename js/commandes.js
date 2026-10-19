(function () {
  const { esc, fmtDate, amount, amountText, seal } = UI;
  const store = Store.create();
  UI.init("commandes", store);

  const $ = (id) => document.getElementById(id);
  const listEl = $("orders");

  let orders = null;
  let ordersError = null;
  let prices = { categories: [] };
  let filter = "cours";
  let sales = []; // seulement pour reconnaître les clients déjà venus
  const knownClients = () => UI.clientsFrom(sales, orders);

  // ---------- Calculs ----------
  const totalOf = (o) => o.lignes.reduce((s, l) => s + l.qty * l.unit, 0);
  const piecesOf = (o) => o.lignes.reduce((s, l) => s + l.qty, 0);
  const doneOf = (o) => o.lignes.reduce((s, l) => s + l.done, 0);
  const paidOf = (o) => o.paiements.reduce((s, p) => s + p.argent * UI.SILVER + p.cuivre, 0);
  const pct = (part, whole) => (whole ? Math.min(100, Math.floor((part / whole) * 100)) : 100);

  function status(o) {
    if (o.deliveredAt) return { key: "livree", label: `Livrée le ${fmtDate(o.deliveredAt)}` };
    const made = doneOf(o) >= piecesOf(o);
    const paid = paidOf(o) >= totalOf(o);
    if (made && paid) return { key: "prete", label: "Prête et payée, à livrer" };
    if (made) return { key: "prete", label: "Prête, paiement en attente" };
    return { key: "cours", label: "En fabrication" };
  }

  function bar(value, label, kind) {
    return `<div class="bar ${kind === "pay" ? "bar-pay" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${esc(label)}"><span style="width:${value}%"></span></div>`;
  }

  // ---------- Liste ----------
  function visible() {
    const q = $("o-search").value.trim().toLowerCase();
    return (orders || []).filter((o) => {
      if (filter === "cours" && o.deliveredAt) return false;
      if (filter === "livree" && !o.deliveredAt) return false;
      if (!q) return true;
      return [o.client, o.note, o.createdBy, ...o.lignes.map((l) => l.name)].join(" ").toLowerCase().includes(q);
    });
  }

  function renderTabs() {
    const n = { cours: 0, livree: 0, toutes: 0 };
    (orders || []).forEach((o) => {
      n.toutes++;
      n[o.deliveredAt ? "livree" : "cours"]++;
    });
    const names = { cours: "En cours", livree: "Livrées", toutes: "Toutes" };
    $("tabs")
      .querySelectorAll(".tab")
      .forEach((t) => {
        t.setAttribute("aria-pressed", String(t.dataset.filter === filter));
        t.textContent = orders ? `${names[t.dataset.filter]} (${n[t.dataset.filter]})` : names[t.dataset.filter];
      });
  }

  function renderList() {
    renderTabs();
    if (!orders && !ordersError) {
      listEl.innerHTML = '<p class="state" role="status">Ouverture du carnet de commandes…</p>';
      return;
    }
    if (!orders) {
      listEl.innerHTML = `
        <div class="state state-error" role="alert">
          <p>Les commandes n'ont pas pu être chargées. ${esc(ordersError.message)}</p>
          <button class="btn" data-retry>Réessayer</button>
        </div>`;
      return;
    }
    const warn = ordersError ? `<p class="meta meta-warn" role="status">Connexion perdue, nouvel essai dans un instant.</p>` : "";
    const list = visible();
    if (!list.length) {
      const empty = !orders.length
        ? "Aucune commande pour l'instant. Utilise « Nouvelle commande » pour en inscrire une."
        : filter === "livree" && !$("o-search").value
        ? "Aucune commande livrée pour l'instant."
        : filter === "cours" && !$("o-search").value
        ? "Aucune commande en cours : tout a été livré."
        : "Aucune commande ne correspond à cette recherche.";
      listEl.innerHTML = warn + `<p class="state">${empty}</p>`;
      return;
    }

    listEl.innerHTML =
      warn +
      `<ol class="orders">${list
        .map((o) => {
          const total = totalOf(o);
          const pieces = piecesOf(o);
          const made = doneOf(o);
          const paid = paidOf(o);
          const st = status(o);
          const pMade = pct(made, pieces);
          const pPaid = pct(paid, total);
          return `
          <li class="order order-${st.key}" data-order="${esc(o.id)}">
            <div class="order-top">
              <div class="order-who">
                <h2>${UI.clientLink(o.client)}</h2>
                <p class="meta">${seal(o.createdBy)} Créée le ${fmtDate(o.createdAt)} par <strong>${esc(o.createdBy)}</strong></p>
              </div>
              <div class="order-total">
                <span class="order-status">${esc(st.label)}</span>
                <strong>${amount(total)}</strong>
              </div>
            </div>
            <p class="order-items">${o.lignes.map((l) => `${l.qty} × ${esc(l.name)}`).join(" · ")}</p>
            <div class="order-bars">
              <div class="order-bar">
                <p><span>Fabrication</span><strong>${pMade} %</strong><span class="meta">${made} / ${pieces} pièces</span></p>
                ${bar(pMade, `Fabrication : ${pMade} %`)}
              </div>
              <div class="order-bar">
                <p><span>Paiement</span><strong>${pPaid} %</strong><span class="meta">${amountText(paid)} sur ${amountText(total)}</span></p>
                ${bar(pPaid, `Paiement : ${pPaid} %`, "pay")}
              </div>
            </div>
            <div class="order-actions">
              <button class="btn" data-open="${esc(o.id)}" aria-label="Suivre la commande de ${esc(o.client)}">Suivre la commande</button>
            </div>
          </li>`;
        })
        .join("")}</ol>`;
  }

  listEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-retry]")) {
      UI.allowLoginPrompt();
      ordersError = null;
      renderList();
      return load();
    }
    // Clic n'importe où sur la carte (ou sur le bouton) : ouvre la fiche.
    const card = e.target.closest(".order");
    if (!card || (e.target.closest("button, a") && !e.target.closest("[data-open]"))) return;
    openDetail(card.dataset.order, card.querySelector("[data-open]"));
  });

  $("tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    filter = t.dataset.filter;
    renderList();
  });
  $("o-search").addEventListener("input", renderList);

  // ---------- Nouvelle commande ----------
  const itemNames = () => prices.categories.flatMap((c) => c.items.filter((i) => i.price != null).map((i) => ({ name: i.name, price: i.price })));

  function fillDatalist() {
    $("item-names").innerHTML = itemNames()
      .map((i) => `<option value="${esc(i.name)}">${esc(amountText(i.price))}</option>`)
      .join("");
  }

  // « Katana Black Ice » commence par « Katana » : on propose le prix du katana.
  function guessUnit(name) {
    const n = name.trim().toLowerCase();
    let best = null;
    for (const i of itemNames()) {
      const k = i.name.toLowerCase();
      if ((n === k || n.startsWith(k + " ")) && (!best || k.length > best.name.length)) best = i;
    }
    return best ? best.price : null;
  }

  let draft = null;

  function openNew() {
    draft = { lignes: [{ name: "", qty: 1, unit: "" }] };
    let dlg = $("new-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "new-dialog";
      dlg.className = "wide-dialog";
      dlg.setAttribute("aria-labelledby", "new-title");
      document.body.appendChild(dlg);
      wireNew(dlg);
    }
    dlg.innerHTML = `
      <form class="detail" id="new-form" novalidate>
        <h2 id="new-title">Nouvelle commande</h2>
        <div class="field">
          <label for="n-client">Client</label>
          <input id="n-client" maxlength="60" required placeholder="Pour qui est la commande" autocomplete="off" />
          <p class="client-hint" id="n-client-hint" aria-live="polite" hidden></p>
        </div>
        <fieldset class="lines-set">
          <legend>Pièces commandées</legend>
          <div class="nline nline-head" aria-hidden="true"><span>Article</span><span>Qté</span><span>Cuivre/u.</span><span></span></div>
          <div class="lines" id="n-lines"></div>
          <button type="button" class="btn btn-quiet" data-add-line>Ajouter une ligne</button>
        </fieldset>
        <div class="slip-total"><span>Total de la commande</span><strong id="n-total">0</strong></div>
        <fieldset class="pay-set">
          <legend>Déjà payé à la commande <span class="optional">(facultatif)</span></legend>
          <label class="check"><input type="checkbox" id="n-full" /> Payée en entier dès maintenant</label>
          <div class="pay-grid">
            <div class="field"><label for="n-argent">Pièces d'argent</label><input id="n-argent" type="number" min="0" step="1" inputmode="numeric" placeholder="0" /></div>
            <div class="field"><label for="n-cuivre">Pièces de cuivre</label><input id="n-cuivre" type="number" min="0" step="1" inputmode="numeric" placeholder="0" /></div>
          </div>
        </fieldset>
        <div class="field">
          <label for="n-note">Remarque <span class="optional">(facultatif)</span></label>
          <textarea id="n-note" maxlength="300" rows="2" placeholder="ex : livraison au port, couleurs au choix"></textarea>
        </div>
        <p class="form-error" id="n-error" role="alert" hidden></p>
        <div class="row-end">
          <button type="button" class="btn btn-quiet" data-cancel>Annuler</button>
          <button class="btn btn-primary" type="submit">Créer la commande</button>
        </div>
      </form>`;
    renderNewLines();
    UI.clientField($("n-client"), $("n-client-hint"), knownClients).refresh();
    dlg.showModal();
    $("n-client").focus();
  }

  function renderNewLines() {
    $("n-lines").innerHTML = draft.lignes
      .map(
        (l, i) => `
      <div class="nline">
        <input data-i="${i}" data-f="name" list="item-names" value="${esc(l.name)}" maxlength="100" aria-label="Article ${i + 1}" placeholder="ex : Katana Black Ice" />
        <input data-i="${i}" data-f="qty" type="number" min="1" step="1" inputmode="numeric" value="${esc(l.qty)}" aria-label="Quantité de l'article ${i + 1}" />
        <input data-i="${i}" data-f="unit" type="number" min="0" step="1" inputmode="numeric" value="${esc(l.unit)}" aria-label="Prix unitaire en cuivre de l'article ${i + 1}" placeholder="0" />
        <button type="button" class="btn btn-quiet btn-danger btn-x" data-del-line="${i}" aria-label="Retirer la ligne ${i + 1}" ${draft.lignes.length === 1 ? "disabled" : ""}>×</button>
      </div>`
      )
      .join("");
    renderNewTotal();
  }

  const num = (v) => Math.max(0, Math.round(Number(v))) || 0;
  const draftTotal = () => draft.lignes.reduce((s, l) => s + num(l.qty) * num(l.unit), 0);

  function renderNewTotal() {
    $("n-total").innerHTML = amount(draftTotal());
    if ($("n-full").checked) fillFull();
  }

  function fillFull() {
    const t = draftTotal();
    $("n-argent").value = Math.floor(t / UI.SILVER) || "";
    $("n-cuivre").value = t % UI.SILVER || "";
  }

  function wireNew(dlg) {
    dlg.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "n-full") {
        $("n-argent").disabled = $("n-cuivre").disabled = t.checked;
        if (t.checked) fillFull();
        return;
      }
      if (t.dataset.i === undefined) return;
      const l = draft.lignes[+t.dataset.i];
      l[t.dataset.f] = t.value;
      if (t.dataset.f === "name" && (l.unit === "" || l.autoUnit)) {
        const u = guessUnit(t.value);
        l.unit = u ?? "";
        l.autoUnit = u != null;
        dlg.querySelector(`[data-i="${t.dataset.i}"][data-f="unit"]`).value = l.unit;
      }
      if (t.dataset.f === "unit") l.autoUnit = false;
      renderNewTotal();
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-cancel]")) return dlg.close();
      if (e.target.closest("[data-add-line]")) {
        draft.lignes.push({ name: "", qty: 1, unit: "" });
        renderNewLines();
        return dlg.querySelector(`[data-i="${draft.lignes.length - 1}"][data-f="name"]`).focus();
      }
      const del = e.target.closest("[data-del-line]");
      if (del) {
        const i = +del.dataset.delLine;
        draft.lignes.splice(i, 1);
        renderNewLines();
        dlg.querySelector(`[data-i="${Math.max(0, i - 1)}"][data-f="name"]`).focus();
      }
    });
    dlg.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("n-error");
      const show = (msg, focus) => {
        err.textContent = msg;
        err.hidden = false;
        focus?.focus();
      };
      err.hidden = true;
      const client = $("n-client").value.trim();
      const lignes = draft.lignes.filter((l) => l.name.trim());
      if (!client) return show("Indique le nom du client.", $("n-client"));
      if (!lignes.length) return show("Ajoute au moins une pièce à fabriquer.", dlg.querySelector('[data-f="name"]'));
      if (lignes.some((l) => num(l.qty) < 1)) return show("Chaque quantité doit être d'au moins 1.");
      const btn = dlg.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Création…";
      try {
        const o = await UI.run(() =>
          store.addOrder({
            client,
            note: $("n-note").value.trim(),
            lignes: lignes.map((l) => ({ name: l.name.trim(), qty: num(l.qty), unit: num(l.unit) })),
            paiement: { argent: num($("n-argent").value), cuivre: num($("n-cuivre").value) },
          })
        );
        orders = [o, ...(orders || [])];
        filter = "cours";
        dlg.close();
        renderList();
        UI.toast(`Commande de ${o.client} créée`);
      } catch (ex) {
        show("La commande n'a pas été créée. " + ex.message);
        btn.disabled = false;
        btn.textContent = "Créer la commande";
      }
    });
  }

  $("new-order").addEventListener("click", openNew);

  // ---------- Fiche de suivi ----------
  let openId = null;
  let pending = 0;
  let chain = Promise.resolve();
  let returnTo = null;

  const findOrder = (id) => (orders || []).find((o) => o.id === id);

  function replaceOrder(o) {
    orders = orders.map((x) => (x.id === o.id ? o : x));
  }

  function openDetail(id, from) {
    openId = id;
    returnTo = from;
    let dlg = $("order-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "order-dialog";
      dlg.className = "wide-dialog";
      dlg.setAttribute("aria-labelledby", "od-title");
      document.body.appendChild(dlg);
      wireDetail(dlg);
    }
    renderDetail();
    dlg.showModal();
    dlg.querySelector("[data-close]").focus();
  }

  function renderDetail(focusKey) {
    const dlg = $("order-dialog");
    const o = findOrder(openId);
    if (!o) return dlg.close();
    const total = totalOf(o);
    const pieces = piecesOf(o);
    const made = doneOf(o);
    const paid = paidOf(o);
    const rest = total - paid;
    const st = status(o);
    const pMade = pct(made, pieces);
    const pPaid = pct(paid, total);
    const mine = o.createdBy === UI.me();

    dlg.innerHTML = `
      <div class="detail">
        <div class="detail-head">
          ${seal(o.createdBy)}
          <div>
            <h2 id="od-title">Commande de ${UI.clientLink(o.client)}</h2>
            <p class="meta">Créée le ${fmtDate(o.createdAt)} par ${esc(o.createdBy)} · ${esc(st.label)}</p>
          </div>
        </div>
        ${o.note ? `<p class="detail-note">${esc(o.note)}</p>` : ""}

        <h3>Fabrication <span class="h3-side">${pMade} % · ${made} / ${pieces} pièces</span></h3>
        ${bar(pMade, `Fabrication : ${pMade} %`)}
        <ul class="make-list">
          ${o.lignes
            .map((l) => {
              const p = pct(l.done, l.qty);
              const full = l.done >= l.qty;
              return `
            <li class="make ${full ? "make-full" : ""}">
              <div class="make-name">
                <strong>${esc(l.name)}</strong>
                <span class="meta">${amountText(l.unit)} pièce · ${amountText(l.qty * l.unit)} la ligne</span>
              </div>
              <div class="make-ctrl">
                <button type="button" class="btn btn-step" data-step="-1" data-line="${esc(l.id)}" data-key="m-${esc(l.id)}" aria-label="Une pièce de moins pour ${esc(l.name)}" ${l.done <= 0 ? "disabled" : ""}>−</button>
                <label class="make-count">
                  <span class="sr-only">Pièces faites pour ${esc(l.name)}</span>
                  <input type="number" min="0" max="${l.qty}" step="1" inputmode="numeric" value="${l.done}" data-set="${esc(l.id)}" data-key="s-${esc(l.id)}" />
                  <span>/ ${l.qty}</span>
                </label>
                <button type="button" class="btn btn-step" data-step="1" data-line="${esc(l.id)}" data-key="p-${esc(l.id)}" aria-label="Une pièce de plus pour ${esc(l.name)}" ${full ? "disabled" : ""}>+</button>
                <button type="button" class="btn btn-quiet" data-all="${esc(l.id)}" data-key="a-${esc(l.id)}" ${full ? "disabled" : ""}>Tout fait</button>
              </div>
              ${bar(p, `${l.name} : ${p} %`)}
            </li>`;
            })
            .join("")}
        </ul>

        <h3>Paiement <span class="h3-side">${pPaid} %</span></h3>
        ${bar(pPaid, `Paiement : ${pPaid} %`, "pay")}
        <dl class="detail-dl">
          <div><dt>Total de la commande</dt><dd>${amount(total)}</dd></div>
          <div><dt>Déjà payé</dt><dd>${amount(paid)}</dd></div>
          ${
            rest > 0
              ? `<div class="detail-key pay-short"><dt>Reste à payer</dt><dd>${amount(rest)}</dd></div>`
              : rest < 0
              ? `<div class="detail-key"><dt>Trop-perçu à rendre</dt><dd>${amount(-rest)}</dd></div>`
              : `<div class="detail-key"><dt>Payée en entier</dt><dd>Rien à recevoir</dd></div>`
          }
        </dl>
        ${
          o.paiements.length
            ? `<ol class="pay-list">${o.paiements
                .map(
                  (p) => `
              <li>
                <span class="pay-amt">${amount(p.argent * UI.SILVER + p.cuivre)}</span>
                <span class="pay-info">${fmtDate(p.at)}, noté par ${esc(p.by)}${p.note ? ` · ${esc(p.note)}` : ""}<br /><span class="meta">${p.argent} argent et ${p.cuivre} cuivre donnés</span></span>
                ${p.by === UI.me() ? `<button type="button" class="btn btn-quiet btn-danger" data-del-pay="${p.id}" aria-label="Retirer le versement du ${fmtDate(p.at)}">Retirer</button>` : ""}
              </li>`
                )
                .join("")}</ol>`
            : `<p class="detail-empty">Aucun versement noté pour l'instant.</p>`
        }
        ${
          rest > 0
            ? `
        <form class="pay-add" data-pay-form novalidate>
          <p class="pay-add-title">Noter un versement</p>
          <div class="pay-add-grid">
            <div class="field"><label for="op-argent">Pièces d'argent</label><input id="op-argent" type="number" min="0" step="1" inputmode="numeric" placeholder="0" /></div>
            <div class="field"><label for="op-cuivre">Pièces de cuivre</label><input id="op-cuivre" type="number" min="0" step="1" inputmode="numeric" placeholder="0" /></div>
            <div class="field field-full"><label for="op-note">Remarque <span class="optional">(facultatif)</span></label><input id="op-note" maxlength="200" placeholder="ex : 2e versement" /></div>
          </div>
          <p class="form-error" id="op-error" role="alert" hidden></p>
          <div class="row-end">
            <button type="button" class="btn" data-pay-rest data-key="pay-rest">Tout payé (${esc(amountText(rest))})</button>
            <button class="btn btn-primary" data-key="pay-add">Noter le versement</button>
          </div>
        </form>`
            : ""
        }

        <h3>Livraison</h3>
        <p class="detail-empty">${o.deliveredAt ? `Livrée le ${fmtDate(o.deliveredAt)}.` : "Pas encore livrée."}</p>

        <div class="row-end row-wrap">
          ${mine ? `<button type="button" class="btn btn-quiet btn-danger" data-del-order>Supprimer la commande</button>` : ""}
          <button type="button" class="btn" data-deliver data-key="deliver">${o.deliveredAt ? "Remettre en cours" : "Marquer comme livrée"}</button>
          <button type="button" class="btn btn-primary" data-close>Fermer</button>
        </div>
      </div>`;
    if (focusKey) dlg.querySelector(`[data-key="${focusKey}"]:not([disabled])`)?.focus();
  }

  // Les clics sont envoyés l'un après l'autre ; l'écran est mis à jour tout de suite.
  function send(action, focusKey) {
    pending++;
    chain = chain
      .then(() => UI.run(action))
      .then((o) => {
        pending--;
        if (o && !pending) {
          replaceOrder(o);
          if (openId === o.id) renderDetail(focusKey);
          renderList();
        }
      })
      .catch((err) => {
        pending--;
        UI.toast(err.message);
        load();
      });
    return chain;
  }

  function localStep(o, lineId, fn) {
    const l = o.lignes.find((x) => x.id === lineId);
    l.done = Math.max(0, Math.min(l.qty, fn(l)));
  }

  function wireDetail(dlg) {
    dlg.addEventListener("click", async (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      const o = findOrder(openId);
      if (!o) return;

      const step = e.target.closest("[data-step]");
      if (step) {
        const d = +step.dataset.step;
        localStep(o, step.dataset.line, (l) => l.done + d);
        renderDetail(step.dataset.key);
        return send(() => store.stepLine(o.id, step.dataset.line, { delta: d }), step.dataset.key);
      }
      const all = e.target.closest("[data-all]");
      if (all) {
        localStep(o, all.dataset.all, (l) => l.qty);
        renderDetail(`m-${all.dataset.all}`);
        return send(() => store.stepLine(o.id, all.dataset.all, { done: o.lignes.find((l) => l.id === all.dataset.all).qty }), `m-${all.dataset.all}`);
      }
      if (e.target.closest("[data-pay-rest]")) {
        const rest = totalOf(o) - paidOf(o);
        return send(
          () => store.addPayment(o.id, { argent: Math.floor(rest / UI.SILVER), cuivre: rest % UI.SILVER, note: "Solde de la commande" }),
          "deliver"
        ).then(() => UI.toast("Commande payée en entier"));
      }
      const delPay = e.target.closest("[data-del-pay]");
      if (delPay) {
        if (!confirm("Retirer ce versement ?")) return;
        return send(() => store.deletePayment(o.id, Number(delPay.dataset.delPay)), "deliver");
      }
      if (e.target.closest("[data-deliver]")) {
        return send(() => store.updateOrder(o.id, { delivered: !o.deliveredAt }), "deliver").then(() =>
          UI.toast(o.deliveredAt ? "Commande remise en cours" : "Commande marquée comme livrée")
        );
      }
      if (e.target.closest("[data-del-order]")) {
        if (!confirm(`Supprimer la commande de ${o.client} ? Le suivi et les versements notés seront perdus.`)) return;
        try {
          await UI.run(() => store.deleteOrder(o.id));
          orders = orders.filter((x) => x.id !== o.id);
          dlg.close();
          renderList();
          UI.toast("Commande supprimée");
          $("new-order").focus();
        } catch (err) {
          alert("La commande n'a pas été supprimée. " + err.message);
        }
      }
    });

    // Nombre exact de pièces faites, tapé à la main
    dlg.addEventListener("change", (e) => {
      const t = e.target.closest("[data-set]");
      if (!t) return;
      const o = findOrder(openId);
      const v = Math.round(Number(t.value)) || 0;
      localStep(o, t.dataset.set, () => v);
      renderDetail(t.dataset.key);
      send(() => store.stepLine(o.id, t.dataset.set, { done: Math.max(0, v) }), t.dataset.key);
    });

    dlg.addEventListener("submit", (e) => {
      if (!e.target.matches("[data-pay-form]")) return;
      e.preventDefault();
      const o = findOrder(openId);
      const argent = num($("op-argent").value);
      const cuivre = num($("op-cuivre").value);
      if (!argent && !cuivre) {
        const err = $("op-error");
        err.textContent = "Indique combien le client a payé.";
        err.hidden = false;
        return $("op-argent").focus();
      }
      send(() => store.addPayment(o.id, { argent, cuivre, note: $("op-note").value.trim() }), "pay-add").then(() =>
        UI.toast(`Versement de ${amountText(argent * UI.SILVER + cuivre)} noté`)
      );
    });

    dlg.addEventListener("close", () => {
      openId = null;
      if (returnTo && document.contains(returnTo)) returnTo.focus();
    });
  }

  // ---------- Chargement ----------
  async function load() {
    try {
      orders = await UI.run(() => store.getOrders());
      ordersError = null;
    } catch (e) {
      ordersError = e;
    }
    renderList();
    if (openId && !pending && orders) renderDetail();
  }

  async function loadPrices() {
    try {
      prices = await UI.run(() => store.getPrices());
      fillDatalist();
    } catch (e) {
      // Sans la liste des prix, on écrit simplement le prix à la main.
      console.error(e);
    }
  }

  async function loadSales() {
    try {
      sales = await UI.run(() => store.getSales());
    } catch (e) {
      console.error(e);
    }
  }

  // Lien direct vers une commande (depuis la fiche d'un client) : commandes.html#commande=<id>
  function openFromHash() {
    // Nouvelle commande pour un client connu : commandes.html#nouvelle=Kenji
    const n = location.hash.match(/^#nouvelle=(.+)$/);
    if (n) {
      history.replaceState(null, "", location.pathname);
      openNew();
      $("n-client").value = decodeURIComponent(n[1]);
      $("n-client").dispatchEvent(new Event("input", { bubbles: true }));
      return dialogFocusFirstLine();
    }
    const m = location.hash.match(/^#commande=([\w-]+)$/);
    if (!m || !orders) return;
    const o = findOrder(m[1]);
    if (!o) return UI.toast("Cette commande n'existe plus");
    filter = o.deliveredAt ? "livree" : "cours";
    renderList();
    history.replaceState(null, "", location.pathname);
    openDetail(o.id, listEl.querySelector(`[data-order="${o.id}"] [data-open]`));
  }

  window.addEventListener("hashchange", openFromHash);
  const dialogFocusFirstLine = () => $("new-dialog").querySelector('[data-i="0"][data-f="name"]').focus();

  renderList();
  loadPrices()
    .then(load)
    .then(loadSales)
    .then(openFromHash);
  UI.poll(() => {
    load();
    loadPrices();
    loadSales();
  }, () => !!document.querySelector("dialog[open]") || pending > 0);
})();
