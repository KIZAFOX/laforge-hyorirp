(function () {
  const { esc, price, fmtDate } = UI;
  const store = Store.create();
  UI.init("prix", store);

  const root = document.getElementById("prices");
  let prices = null;
  let error = null;
  let draft = null; // copie en cours d'édition (null = lecture)
  let saving = false;

  async function load() {
    try {
      prices = await UI.run(() => store.getPrices());
      error = null;
    } catch (e) {
      error = e;
    }
    if (!draft) render();
  }

  render();
  load();
  UI.poll(load, () => !!draft);

  // ---------- Lecture ----------
  function render() {
    if (draft) return renderEdit();
    if (!prices && !error) {
      root.innerHTML = '<p class="state" role="status">Lecture de la liste des prix…</p>';
      return;
    }
    if (!prices) {
      root.innerHTML = `
        <div class="state state-error" role="alert">
          <p>La liste des prix n'a pas pu être chargée. ${esc(error.message)}</p>
          <button class="btn" data-act="retry">Réessayer</button>
        </div>`;
      return;
    }

    const featured = prices.categories.filter((c) => c.featured);
    const others = prices.categories.filter((c) => !c.featured);
    const stamp = prices.updatedAt
      ? `Mis à jour le ${fmtDate(prices.updatedAt)}${prices.updatedBy ? ` par <strong>${esc(prices.updatedBy)}</strong>` : ""}`
      : "Prix de départ, jamais modifiés";

    root.innerHTML = `
      <div class="board-bar">
        <p class="meta">${stamp}</p>
        ${error ? `<p class="meta meta-warn" role="status">Connexion perdue, nouvel essai dans un instant.</p>` : ""}
        <button class="btn btn-primary" data-act="edit">Modifier les prix</button>
      </div>
      ${
        prices.categories.length
          ? featured.map(noren).join("") + (others.length ? `<div class="planks">${others.map(plank).join("")}</div>` : "")
          : `<p class="state">Aucun prix n'est inscrit pour l'instant. Utilise « Modifier les prix » pour en ajouter.</p>`
      }
      ${historyBlock()}`;
  }

  function kanji(c, cls) {
    return c.kanji ? `<span class="${cls}" lang="ja" aria-hidden="true">${esc(c.kanji)}</span>` : "";
  }

  // Catégorie mise en avant : une bannière indigo façon noren de boutique.
  function noren(c) {
    return `
      <section class="noren" aria-labelledby="cat-${esc(c.id)}">
        <div class="noren-cloth">
          ${kanji(c, "noren-kanji")}
          <div class="noren-body">
            <h2 id="cat-${esc(c.id)}">${esc(c.name)}</h2>
            ${c.note ? `<p class="noren-note">${esc(c.note)}</p>` : ""}
            ${
              c.items.length
                ? `<ul class="tags">${c.items
                    .map(
                      (it) => `
                  <li class="tag">
                    <span class="tag-name">${esc(it.name)}</span>
                    ${price(it.price)}
                    ${it.note ? `<span class="tag-note">${esc(it.note)}</span>` : ""}
                  </li>`
                    )
                    .join("")}</ul>`
                : `<p class="noren-note">Aucun article pour l'instant.</p>`
            }
          </div>
        </div>
      </section>`;
  }

  // Catégorie ordinaire : une page de livre de comptes avec points de conduite.
  function plank(c) {
    return `
      <section class="plank" aria-labelledby="cat-${esc(c.id)}">
        ${kanji(c, "plank-kanji")}
        <div class="plank-body">
          <h2 id="cat-${esc(c.id)}">${esc(c.name)}</h2>
          ${c.note ? `<p class="plank-note">${esc(c.note)}</p>` : ""}
          ${
            c.items.length
              ? `<ul class="rows">${c.items
                  .map(
                    (it) => `
                <li>
                  <span class="row-name">${esc(it.name)}${it.note ? `<small>${esc(it.note)}</small>` : ""}</span>
                  <span class="leader" aria-hidden="true"></span>
                  ${price(it.price)}
                </li>`
                  )
                  .join("")}</ul>`
              : `<p class="plank-note">Aucun article pour l'instant.</p>`
          }
        </div>
      </section>`;
  }

  function historyBlock() {
    const h = prices.history || [];
    if (!h.length) return "";
    const p = (v) => (v === null || v === undefined ? "à fixer" : v);
    const line = (e) => {
      if (e.kind === "ajout") return `<strong>${esc(e.item)}</strong> ajouté à ${p(e.new_price)}`;
      if (e.kind === "retrait") return `<strong>${esc(e.item)}</strong> retiré de la liste`;
      return `<strong>${esc(e.item)}</strong> : ${p(e.old_price)} → ${p(e.new_price)}`;
    };
    return `
      <section class="history" aria-labelledby="hist-title">
        <h2 id="hist-title">Derniers changements de prix</h2>
        <ol>
          ${h
            .slice(0, 12)
            .map(
              (e) => `
            <li>
              <span class="hist-what">${line(e)}</span>
              <span class="hist-who">${fmtDate(e.at)}${e.by ? `, ${esc(e.by)}` : ""}</span>
            </li>`
            )
            .join("")}
        </ol>
      </section>`;
  }

  // ---------- Édition ----------
  function renderEdit() {
    root.innerHTML = `
      <div class="board-bar">
        <p class="meta">Mode édition. Laisse le prix vide s'il n'est pas encore fixé. Les lignes sans nom sont ignorées.</p>
      </div>
      <div class="edit-list">
        ${draft.categories.map(editCat).join("")}
        <button class="btn btn-add" data-act="add-cat">Ajouter une catégorie</button>
      </div>
      <div class="edit-bar">
        <span class="meta">Signé <strong>${esc(UI.me())}</strong> dans l'historique des prix</span>
        <button class="btn" data-act="cancel">Annuler</button>
        <button class="btn btn-primary" data-act="save" ${saving ? "disabled" : ""}>${saving ? "Enregistrement…" : "Enregistrer les prix"}</button>
      </div>`;
  }

  function editCat(c, ci) {
    return `
      <fieldset class="edit-cat">
        <legend class="sr-only">Catégorie ${esc(c.name)}</legend>
        <div class="edit-cat-head">
          <div class="field field-grow">
            <label for="c${ci}-name">Catégorie</label>
            <input id="c${ci}-name" data-c="${ci}" data-f="name" value="${esc(c.name)}" required />
          </div>
          <div class="field field-kanji">
            <label for="c${ci}-kanji">Kanji</label>
            <input id="c${ci}-kanji" data-c="${ci}" data-f="kanji" value="${esc(c.kanji)}" maxlength="6" lang="ja" />
          </div>
          <div class="field field-full">
            <label for="c${ci}-note">Remarque</label>
            <input id="c${ci}-note" data-c="${ci}" data-f="note" value="${esc(c.note)}" />
          </div>
          <label class="check">
            <input type="checkbox" data-c="${ci}" data-f="featured" ${c.featured ? "checked" : ""} />
            Mettre en avant (bannière indigo en haut de la liste)
          </label>
          <button class="btn btn-quiet btn-danger" data-act="del-cat" data-c="${ci}">Supprimer la catégorie</button>
        </div>
        <div class="edit-items" role="group" aria-label="Articles de ${esc(c.name)}">
          <div class="edit-item edit-item-head" aria-hidden="true"><span>Article</span><span>Prix</span><span>Remarque</span><span></span></div>
          ${c.items
            .map(
              (it, ii) => `
            <div class="edit-item">
              <input data-c="${ci}" data-i="${ii}" data-f="name" value="${esc(it.name)}" aria-label="Nom de l'article" placeholder="Nom de l'article" />
              <input data-c="${ci}" data-i="${ii}" data-f="price" type="number" min="0" step="1" inputmode="numeric" value="${it.price ?? ""}" aria-label="Prix de ${esc(it.name)}" placeholder="à fixer" />
              <input data-c="${ci}" data-i="${ii}" data-f="note" value="${esc(it.note)}" aria-label="Remarque sur ${esc(it.name)}" placeholder="Remarque" />
              <button class="btn btn-quiet btn-danger" data-act="del-item" data-c="${ci}" data-i="${ii}" aria-label="Retirer ${esc(it.name)}">Retirer</button>
            </div>`
            )
            .join("")}
          <button class="btn btn-quiet" data-act="add-item" data-c="${ci}">Ajouter un article</button>
        </div>
      </fieldset>`;
  }

  root.addEventListener("input", (e) => {
    const t = e.target;
    if (!draft || t.dataset.c === undefined) return;
    const cat = draft.categories[+t.dataset.c];
    const f = t.dataset.f;
    if (t.dataset.i !== undefined) {
      const item = cat.items[+t.dataset.i];
      item[f] = f === "price" ? (t.value === "" ? null : Math.max(0, Math.round(Number(t.value)))) : t.value;
    } else {
      cat[f] = t.type === "checkbox" ? t.checked : t.value;
    }
  });

  root.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const ci = +b.dataset.c;
    let focus = null;

    if (act === "retry") {
      UI.allowLoginPrompt();
      prices = null;
      error = null;
      render();
      return load();
    }
    if (act === "edit") {
      draft = Store.clone(prices);
      focus = "#c0-name";
    } else if (act === "cancel") {
      draft = null;
      focus = '[data-act="edit"]';
    } else if (act === "add-item") {
      draft.categories[ci].items.push({ id: Store.uid(), name: "", price: null, note: "" });
      focus = `.edit-item input[data-c="${ci}"][data-i="${draft.categories[ci].items.length - 1}"][data-f="name"]`;
    } else if (act === "del-item") {
      draft.categories[ci].items.splice(+b.dataset.i, 1);
      focus = `[data-act="add-item"][data-c="${ci}"]`;
    } else if (act === "add-cat") {
      draft.categories.push({ id: Store.uid(), name: "Nouvelle catégorie", kanji: "", note: "", featured: false, items: [] });
      focus = `#c${draft.categories.length - 1}-name`;
    } else if (act === "del-cat") {
      const c = draft.categories[ci];
      if (!confirm(`Supprimer la catégorie « ${c.name} » et ses ${c.items.length} article(s) ?`)) return;
      draft.categories.splice(ci, 1);
      focus = '[data-act="add-cat"]';
    } else if (act === "save") {
      if (draft.categories.some((c) => !c.name.trim())) return alert("Chaque catégorie doit avoir un nom.");
      saving = true;
      render();
      try {
        prices = await UI.run(() => store.savePrices(draft));
        draft = null;
        error = null;
        UI.toast("Prix enregistrés");
        focus = '[data-act="edit"]';
      } catch (err) {
        alert("Les prix n'ont pas été enregistrés. " + err.message);
      }
      saving = false;
    }
    render();
    if (focus) root.querySelector(focus)?.focus();
  });

})();
