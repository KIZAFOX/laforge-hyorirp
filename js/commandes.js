(function () {
  const { esc, fmtDate, amount, amountText, seal } = UI;
  const store = Store.create();

  // La même page sert aux commandes des clients et aux tributs dus au village
  // (tributs.html a <body data-kind="tribut">). Un tribut ne se paie pas.
  const KIND = document.body.dataset.kind === "tribut" ? "tribut" : "commande";
  const T = KIND === "tribut";
  const W = T
    ? {
        loading: "Ouverture du registre des tributs…",
        loadError: "Les tributs n'ont pas pu être chargés.",
        emptyAll: "Aucun tribut pour l'instant. Utilise « Nouveau tribut » pour en inscrire un.",
        emptyDone: "Aucun tribut remis pour l'instant.",
        emptyOpen: "Aucun tribut en cours : tout a été remis au village.",
        emptySearch: "Aucun tribut ne correspond à cette recherche.",
        tabs: { cours: "En cours", livree: "Remis", toutes: "Tous" },
        follow: "Suivre le tribut",
        newTitle: "Nouveau tribut",
        editTitle: (c) => `Modifier le tribut pour ${esc(c)}`,
        who: "Destinataire",
        whoHint: "ex : Village des mines",
        detailTitle: (c) => `Tribut pour ${esc(c)}`,
        deliveredOn: "Remis au village le",
        notDelivered: "Pas encore remis au village.",
        deliveryTitle: "Remise au village",
        deliver: "Marquer comme remis",
        delivered: "Tribut marqué comme remis",
        reopened: "Tribut remis en cours",
        delete: "Supprimer le tribut",
        confirmDelete: (c) => `Supprimer le tribut pour ${c} ? Le suivi sera perdu.`,
        deleted: "Tribut supprimé",
        created: (c) => `Tribut pour ${c} créé`,
        edited: (c) => `Tribut pour ${c} modifié`,
        move: "Déplacer vers les commandes",
        moved: "Déplacé vers les commandes",
      }
    : {
        loading: "Ouverture du carnet de commandes…",
        loadError: "Les commandes n'ont pas pu être chargées.",
        emptyAll: "Aucune commande pour l'instant. Utilise « Nouvelle commande » pour en inscrire une.",
        emptyDone: "Aucune commande livrée pour l'instant.",
        emptyOpen: "Aucune commande en cours : tout a été livré.",
        emptySearch: "Aucune commande ne correspond à cette recherche.",
        tabs: { cours: "En cours", livree: "Livrées", toutes: "Toutes" },
        follow: "Suivre la commande",
        newTitle: "Nouvelle commande",
        editTitle: (c) => `Modifier la commande de ${esc(c)}`,
        who: "Client",
        whoHint: "Pour qui est la commande",
        detailTitle: (c) => `Commande de ${UI.clientLink(c)}`,
        deliveredOn: "Livrée le",
        notDelivered: "Pas encore livrée.",
        deliveryTitle: "Livraison",
        deliver: "Marquer comme livrée",
        delivered: "Commande marquée comme livrée",
        reopened: "Commande remise en cours",
        delete: "Supprimer la commande",
        confirmDelete: (c) => `Supprimer la commande de ${c} ? Le suivi et les versements notés seront perdus.`,
        deleted: "Commande supprimée",
        created: (c) => `Commande de ${c} créée`,
        edited: (c) => `Commande de ${c} modifiée`,
        move: "Déplacer vers les tributs",
        moved: "Déplacée vers les tributs",
      };
  UI.init(T ? "tributs" : "commandes", store);

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
    if (o.deliveredAt) return { key: "livree", label: `${W.deliveredOn} ${fmtDate(o.deliveredAt)}` };
    const made = doneOf(o) >= piecesOf(o);
    if (T) return made ? { key: "prete", label: "Prêt à remettre au village" } : { key: "cours", label: "En fabrication" };
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
    const names = W.tabs;
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
      listEl.innerHTML = `<p class="state" role="status">${W.loading}</p>`;
      return;
    }
    if (!orders) {
      listEl.innerHTML = `
        <div class="state state-error" role="alert">
          <p>${W.loadError} ${esc(ordersError.message)}</p>
          <button class="btn" data-retry>Réessayer</button>
        </div>`;
      return;
    }
    const warn = ordersError ? `<p class="meta meta-warn" role="status">Connexion perdue, nouvel essai dans un instant.</p>` : "";
    const list = visible();
    if (!list.length) {
      const empty = !orders.length
        ? W.emptyAll
        : filter === "livree" && !$("o-search").value
        ? W.emptyDone
        : filter === "cours" && !$("o-search").value
        ? W.emptyOpen
        : W.emptySearch;
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
                <h2>${T ? esc(o.client) : UI.clientLink(o.client)}</h2>
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
              ${
                T
                  ? ""
                  : `<div class="order-bar">
                <p><span>Paiement</span><strong>${pPaid} %</strong><span class="meta">${amountText(paid)} sur ${amountText(total)}</span></p>
                ${bar(pPaid, `Paiement : ${pPaid} %`, "pay")}
              </div>`
              }
            </div>
            <div class="order-actions">
              <button class="btn" data-open="${esc(o.id)}" aria-label="${W.follow} : ${esc(o.client)}">${W.follow}</button>
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

  // Sans argument : nouvelle commande. Avec une commande : on la modifie (lignes, client, remarque).
  function openNew(editing) {
    // Une ligne déjà enregistrée est remise sur son choix de la liste si son nom y figure.
    const keyFor = (name) => UI.articleByName(prices, name)?.key || "autre";
    draft = editing
      ? { id: editing.id, lignes: editing.lignes.map((l) => ({ id: l.id, key: keyFor(l.name), name: l.name, qty: l.qty, unit: l.unit })) }
      : { lignes: [newLine()] };
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
        <h2 id="new-title">${editing ? W.editTitle(editing.client) : W.newTitle}</h2>
        ${editing ? `<p class="detail-empty">Les pièces déjà faites et les versements notés sont conservés.</p>` : ""}
        <div class="field">
          <label for="n-client">${W.who}</label>
          <input id="n-client" maxlength="60" required placeholder="${W.whoHint}" autocomplete="off" />
          <p class="client-hint" id="n-client-hint" aria-live="polite" hidden></p>
        </div>
        <fieldset class="lines-set">
          <legend>Pièces commandées</legend>
          <div class="nline nline-head" aria-hidden="true"><span>Article</span><span>Qté</span><span>Cuivre/u.</span><span></span></div>
          <div class="lines" id="n-lines"></div>
          <button type="button" class="btn btn-quiet" data-add-line>Ajouter une ligne</button>
        </fieldset>
        <div class="slip-total"><span>Total de la commande</span><strong id="n-total">0</strong></div>
        ${editing || T ? "" : `<fieldset class="pay-set">
          <legend>Déjà payé à la commande <span class="optional">(facultatif)</span></legend>
          <label class="check"><input type="checkbox" id="n-full" /> Payée en entier dès maintenant</label>
          <div class="pay-grid">
            <div class="field"><label for="n-argent">Pièces d'argent</label><input id="n-argent" type="number" min="0" step="1" inputmode="numeric" placeholder="0" /></div>
            <div class="field"><label for="n-cuivre">Pièces de cuivre</label><input id="n-cuivre" type="number" min="0" step="1" inputmode="numeric" placeholder="0" /></div>
          </div>
        </fieldset>`}
        <div class="field">
          <label for="n-note">Remarque <span class="optional">(facultatif)</span></label>
          <textarea id="n-note" maxlength="300" rows="2" placeholder="ex : livraison au port, couleurs au choix"></textarea>
        </div>
        <p class="form-error" id="n-error" role="alert" hidden></p>
        <div class="row-end">
          <button type="button" class="btn btn-quiet" data-cancel>Annuler</button>
          <button class="btn btn-primary" type="submit">${editing ? "Enregistrer les modifications" : T ? "Créer le tribut" : "Créer la commande"}</button>
        </div>
      </form>`;
    if (editing) {
      $("n-client").value = editing.client;
      $("n-note").value = editing.note || "";
    }
    renderNewLines();
    if (T) {
      if (!editing) $("n-client").value = "Village des mines";
    } else UI.clientField($("n-client"), $("n-client-hint"), knownClients).refresh();
    dlg.showModal();
    $("n-client").focus();
  }

  const newLine = () => ({ key: "", name: "", qty: 1, unit: "" });

  function renderNewLines() {
    $("n-lines").innerHTML = draft.lignes
      .map(
        (l, i) => `
      <div class="nline">
        ${
          l.key === "autre"
            ? `<input data-i="${i}" data-f="name" list="item-names" value="${esc(l.name)}" maxlength="100" aria-label="Article ${i + 1}" placeholder="Nom de l'article" />`
            : `<select data-i="${i}" data-f="key" aria-label="Article ${i + 1}">${UI.articleOptions(prices, l.key)}</select>`
        }
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
    if ($("n-full")?.checked) fillFull();
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
      if (t.dataset.f === "key") {
        // Choix dans la liste : nom et prix viennent de l'article
        l.key = t.value;
        const a = l.key && l.key !== "autre" ? UI.findArticle(prices, l.key) : null;
        l.name = a ? a.name : "";
        l.unit = a && a.price != null ? a.price : "";
        renderNewLines();
        return dlg
          .querySelector(l.key === "autre" ? `[data-i="${t.dataset.i}"][data-f="name"]` : `[data-i="${t.dataset.i}"][data-f="qty"]`)
          ?.focus();
      }
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
        draft.lignes.push(newLine());
        renderNewLines();
        return dlg.querySelector(`[data-i="${draft.lignes.length - 1}"]`).focus();
      }
      const del = e.target.closest("[data-del-line]");
      if (del) {
        const i = +del.dataset.delLine;
        draft.lignes.splice(i, 1);
        renderNewLines();
        dlg.querySelector(`[data-i="${Math.max(0, i - 1)}"]`).focus();
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
      if (!client) return show(T ? "Indique à qui le tribut est dû." : "Indique le nom du client.", $("n-client"));
      if (!lignes.length) return show("Ajoute au moins une pièce à fabriquer.", dlg.querySelector('[data-i="0"]'));
      if (lignes.some((l) => num(l.qty) < 1)) return show("Chaque quantité doit être d'au moins 1.");
      const btn = dlg.querySelector('button[type="submit"]');
      btn.disabled = true;
      if (draft.id) {
        btn.textContent = "Enregistrement…";
        try {
          const o = await UI.run(() =>
            store.updateOrder(draft.id, {
              client,
              note: $("n-note").value.trim(),
              lignes: lignes.map((l) => ({ id: l.id, name: l.name.trim(), qty: num(l.qty), unit: num(l.unit) })),
            })
          );
          replaceOrder(o);
          dlg.close();
          renderList();
          if (openId === o.id) renderDetail("edit");
          UI.toast(W.edited(o.client));
        } catch (ex) {
          show("Les modifications n'ont pas été enregistrées. " + ex.message);
          btn.disabled = false;
          btn.textContent = "Enregistrer les modifications";
        }
        return;
      }
      btn.textContent = "Création…";
      try {
        const o = await UI.run(() =>
          store.addOrder({
            client,
            note: $("n-note").value.trim(),
            kind: KIND,
            lignes: lignes.map((l) => ({ name: l.name.trim(), qty: num(l.qty), unit: num(l.unit) })),
            paiement: T ? {} : { argent: num($("n-argent").value), cuivre: num($("n-cuivre").value) },
          })
        );
        orders = [o, ...(orders || [])];
        filter = "cours";
        dlg.close();
        renderList();
        UI.toast(W.created(o.client));
      } catch (ex) {
        show((T ? "Le tribut n'a pas été créé. " : "La commande n'a pas été créée. ") + ex.message);
        btn.disabled = false;
        btn.textContent = T ? "Créer le tribut" : "Créer la commande";
      }
    });
  }

  $("new-order").addEventListener("click", () => openNew());

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

    dlg.innerHTML = `
      <div class="detail">
        <div class="detail-head">
          ${seal(o.createdBy)}
          <div>
            <h2 id="od-title">${W.detailTitle(o.client)}</h2>
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

        ${
          T
            ? `<h3>Valeur du tribut</h3>
        <dl class="detail-dl"><div class="detail-key"><dt>Valeur des pièces au prix de la forge</dt><dd>${amount(total)}</dd></div></dl>
        ${o.paiements.length ? `<p class="detail-empty">Versements notés quand c'était une commande : ${amountText(paid)}.</p>` : ""}`
            : `
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
                <button type="button" class="btn btn-quiet btn-danger" data-del-pay="${p.id}" aria-label="Retirer le versement du ${fmtDate(p.at)}">Retirer</button>
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
        }`
        }

        <h3>${W.deliveryTitle}</h3>
        <p class="detail-empty">${o.deliveredAt ? `${W.deliveredOn} ${fmtDate(o.deliveredAt)}.` : W.notDelivered}</p>

        <div class="row-end row-wrap">
          <button type="button" class="btn btn-quiet btn-danger" data-del-order>${W.delete}</button>
          <button type="button" class="btn btn-quiet" data-move data-key="move">${W.move}</button>
          <button type="button" class="btn" data-edit data-key="edit">${T ? "Modifier le tribut" : "Modifier la commande"}</button>
          <button type="button" class="btn" data-deliver data-key="deliver">${o.deliveredAt ? "Remettre en cours" : W.deliver}</button>
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
          UI.toast(o.deliveredAt ? W.reopened : W.delivered)
        );
      }
      if (e.target.closest("[data-edit]")) return openNew(o);
      // Passe une commande dans les tributs (ou l'inverse) : elle quitte cette page.
      if (e.target.closest("[data-move]")) {
        try {
          await UI.run(() => store.updateOrder(o.id, { kind: T ? "commande" : "tribut" }));
          orders = orders.filter((x) => x.id !== o.id);
          returnTo = $("new-order");
          dlg.close();
          renderList();
          UI.toast(W.moved);
        } catch (err) {
          alert("Le transfert n'a pas été fait. " + err.message);
        }
        return;
      }
      if (e.target.closest("[data-del-order]")) {
        if (!confirm(W.confirmDelete(o.client))) return;
        try {
          await UI.run(() => store.deleteOrder(o.id));
          orders = orders.filter((x) => x.id !== o.id);
          dlg.close();
          renderList();
          UI.toast(W.deleted);
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
      orders = (await UI.run(() => store.getOrders())).filter((o) => (o.kind || "commande") === KIND);
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
  const dialogFocusFirstLine = () => $("new-dialog").querySelector('[data-i="0"]').focus();

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
