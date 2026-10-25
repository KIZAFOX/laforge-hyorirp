// En-tête, connexion par compte et petits utilitaires partagés par les deux pages.
(function () {
  let store = null;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const me = () => (Store.getSession() || {}).user || "";

  // Pièce de cuivre d'Edo (mon) : ronde, percée d'un trou carré.
  const MON =
    '<svg class="mon" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 .8a7.2 7.2 0 1 1 0 14.4A7.2 7.2 0 0 1 8 .8zM5.6 5.6v4.8h4.8V5.6z"/></svg>';
  // Pièce d'argent d'Edo (ichibugin) : rectangulaire, avec un cartouche gravé.
  const GIN =
    '<svg class="gin" viewBox="0 0 11 16" aria-hidden="true"><rect x=".5" y=".5" width="10" height="15" rx="1.6"/><rect class="gin-mark" x="2.6" y="3" width="5.8" height="10" rx=".6"/></svg>';

  const SILVER = 100; // 1 pièce d'argent = 100 pièces de cuivre

  // Montant en cuivre affiché en pièces : 125 → 1 argent 25 cuivre.
  function amount(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    const argent = Math.floor(n / SILVER);
    const cuivre = n % SILVER;
    const parts = [];
    if (argent) parts.push(`<span class="amt">${argent}${GIN}<span class="sr-only"> pièce${argent > 1 ? "s" : ""} d'argent</span></span>`);
    if (cuivre || !argent) parts.push(`<span class="amt">${cuivre}${MON}<span class="sr-only"> pièce${cuivre > 1 ? "s" : ""} de cuivre</span></span>`);
    return `<span class="amount">${parts.join("")}</span>`;
  }

  // Version texte, pour les messages et l'export.
  function amountText(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    const argent = Math.floor(n / SILVER);
    const cuivre = n % SILVER;
    const parts = [];
    if (argent) parts.push(`${argent} argent`);
    if (cuivre || !argent) parts.push(`${cuivre} cuivre`);
    return parts.join(" ");
  }

  function price(n) {
    if (n === null || n === undefined || n === "") return '<span class="price price-unset">à fixer</span>';
    return `<span class="price">${amount(n)}</span>`;
  }

  function fmtDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Sceau (hanko) du forgeron : ses deux premières lettres, comme un tampon.
  function seal(name) {
    const letters = (name || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
    return `<span class="seal" aria-hidden="true">${esc(letters)}</span>`;
  }

  function renderAccount() {
    const box = document.getElementById("account-box");
    if (!box) return;
    const user = me();
    box.innerHTML = user
      ? `${seal(user)}<span class="account-who"><small>Connecté</small><strong>${esc(user)}</strong></span>
         <button class="btn btn-quiet" id="switch-account">Changer de compte</button>`
      : `<button class="btn" id="switch-account">Se connecter</button>`;
    box.querySelector("#switch-account").addEventListener("click", async () => {
      const prev = Store.getSession();
      Store.clearSession();
      const ok = await askLogin();
      if (!ok && prev) Store.setSession(prev);
      if (ok || prev) location.reload();
      else renderAccount();
    });
  }

  function init(active, s) {
    store = s;
    const el = document.getElementById("topbar");
    el.innerHTML = `
      <div class="topbar-inner">
        <a class="brand" href="index.html">
          <img class="brand-logo" src="img/logo.png" alt="" width="40" height="40" onerror="this.remove()" />
          <span class="brand-text"><strong>La Forge</strong><small>Hyori RP</small></span>
        </a>
        <nav class="nav" aria-label="Pages">
          <a href="index.html" ${active === "prix" ? 'aria-current="page"' : ""}>Prix</a>
          <a href="registre.html" ${active === "registre" ? 'aria-current="page"' : ""}>Registre</a>
          <a href="commandes.html" ${active === "commandes" ? 'aria-current="page"' : ""}>Commandes</a>
          <a href="tributs.html" ${active === "tributs" ? 'aria-current="page"' : ""}>Tributs</a>
          <a href="clients.html" ${active === "clients" ? 'aria-current="page"' : ""}>Clients</a>
        </nav>
        <div class="account-box" id="account-box"></div>
        <p class="sync ${s.mode === "shared" ? "sync-shared" : ""}">
          ${s.mode === "shared" ? "Registre partagé" : "Mode essai : données gardées dans ce navigateur, token non vérifié"}
        </p>
      </div>`;
    renderAccount();
  }

  // Fenêtre de connexion : choisir son compte, puis donner son token.
  function askLogin(message) {
    return new Promise((resolve) => {
      let dlg = document.getElementById("login-dialog");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "login-dialog";
        dlg.setAttribute("aria-labelledby", "login-title");
        document.body.appendChild(dlg);
      }
      let result = false;
      dlg.onclose = () => resolve(result);

      const pick = () => {
        dlg.innerHTML = `
          <div class="login">
            <h2 id="login-title">Qui tient la forge ?</h2>
            <p class="login-msg">${esc(message || "Choisis ton compte de forgeron.")}</p>
            <ul class="login-accounts">
              ${window.LAFORGE_ACCOUNTS.map(
                (a) => `<li><button type="button" class="account-pick" data-user="${esc(a)}">${seal(a)}<span>${esc(a)}</span></button></li>`
              ).join("")}
            </ul>
            <div class="row-end"><button type="button" class="btn btn-quiet" data-close>Fermer</button></div>
          </div>`;
        dlg.querySelectorAll(".account-pick").forEach((b) => b.addEventListener("click", () => askToken(b.dataset.user)));
        dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close());
        dlg.querySelector(".account-pick")?.focus();
      };

      const askToken = (user) => {
        dlg.innerHTML = `
          <form class="login" novalidate>
            <h2 id="login-title">Entrer comme ${esc(user)}</h2>
            <div class="login-user">${seal(user)}<strong>${esc(user)}</strong></div>
            <div class="field">
              <label for="token-input">Ton token</label>
              <input id="token-input" type="password" autocomplete="current-password" required />
            </div>
            <p class="form-error" role="alert" hidden></p>
            <div class="row-end">
              <button type="button" class="btn btn-quiet" data-back>Autre compte</button>
              <button class="btn btn-primary">Entrer dans la forge</button>
            </div>
          </form>`;
        const form = dlg.querySelector("form");
        const input = form.querySelector("#token-input");
        const err = form.querySelector(".form-error");
        const submit = form.querySelector(".btn-primary");
        form.querySelector("[data-back]").addEventListener("click", pick);
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (!input.value) {
            err.textContent = "Entre le token que tu as reçu.";
            err.hidden = false;
            return input.focus();
          }
          submit.disabled = true;
          submit.textContent = "Vérification…";
          Store.setSession({ user, token: input.value });
          try {
            await store.me();
            result = true;
            dlg.close();
          } catch (ex) {
            Store.clearSession();
            err.textContent = ex.message;
            err.hidden = false;
            submit.disabled = false;
            submit.textContent = "Entrer dans la forge";
            input.select();
          }
        });
        input.focus();
      };

      pick();
      if (!dlg.open) dlg.showModal();
    });
  }

  // Lance un appel à la base ; sans compte valide, ouvre la connexion puis réessaie.
  // Une seule fenêtre à la fois, et après « Fermer » on ne la rouvre plus
  // avant que la personne clique sur « Réessayer » (allowLoginPrompt).
  let pendingLogin = null;
  let declined = false;
  async function run(fn) {
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        if (e.status !== 401 || declined) throw e;
        if (!pendingLogin) {
          const msg = Store.getSession() ? e.message : null;
          Store.clearSession();
          pendingLogin = askLogin(msg).then((ok) => {
            pendingLogin = null;
            renderAccount();
            return ok;
          });
        }
        if (!(await pendingLogin)) {
          declined = true;
          throw e;
        }
      }
    }
  }
  const allowLoginPrompt = () => (declined = false);

  // Rafraîchit les données toutes les 20 s quand la page est visible.
  function poll(fn, shouldSkip) {
    setInterval(() => {
      if (document.visibilityState === "visible" && !shouldSkip()) fn();
    }, 20000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !shouldSkip()) fn();
    });
  }

  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- Articles et variantes ----------
  // Un article à variantes (coloris, modèles) donne un choix par variante : « Casque Rouge ».
  const variantsOf = (it) =>
    String(it.variants || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  function articles(prices) {
    const out = [];
    for (const c of (prices && prices.categories) || [])
      for (const it of c.items) {
        const vs = variantsOf(it);
        if (vs.length)
          vs.forEach((v) => out.push({ key: `${c.id}/${it.id}/${v}`, group: `${it.name} (${c.name})`, name: `${it.name} ${v}`, price: it.price, cat: c.name }));
        else out.push({ key: `${c.id}/${it.id}`, group: c.name, name: it.name, price: it.price, cat: c.name });
      }
    return out;
  }

  function articleOptions(prices, selected) {
    const groups = new Map();
    for (const a of articles(prices)) {
      if (!groups.has(a.group)) groups.set(a.group, []);
      groups.get(a.group).push(a);
    }
    return (
      `<option value="">Choisir un article</option>` +
      [...groups]
        .map(
          ([g, list]) =>
            `<optgroup label="${esc(g)}">${list
              .map(
                (a) =>
                  `<option value="${esc(a.key)}" ${a.key === selected ? "selected" : ""}>${esc(a.name)}${
                    a.price != null ? ` (${esc(amountText(a.price))})` : " (prix à fixer)"
                  }</option>`
              )
              .join("")}</optgroup>`
        )
        .join("") +
      `<option value="autre" ${selected === "autre" ? "selected" : ""}>Autre article (à écrire)</option>`
    );
  }

  const findArticle = (prices, key) => articles(prices).find((a) => a.key === key) || null;
  // Retrouve le choix correspondant à un nom déjà enregistré (« casque rouge » → Casque Rouge)
  const articleByName = (prices, name) => articles(prices).find((a) => a.name.toLocaleLowerCase("fr") === String(name).trim().toLocaleLowerCase("fr")) || null;

  // ---------- Clients ----------
  // Pas de fichier clients à tenir : on les retrouve dans les ventes et les commandes.
  // « kenji » et « Kenji » sont le même client.
  const clientKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");

  const salePaid = (s) => (s.paiement ? s.paiement.argent * SILVER + s.paiement.cuivre : 0);
  const orderTotal = (o) => o.lignes.reduce((t, l) => t + l.qty * l.unit, 0);
  const orderPaid = (o) => o.paiements.reduce((t, p) => t + p.argent * SILVER + p.cuivre, 0);

  function clientsFrom(sales, orders) {
    const map = new Map();
    const get = (name, at) => {
      const key = clientKey(name);
      if (!key) return null;
      let c = map.get(key);
      if (!c) map.set(key, (c = { key, name: "", last: 0, spellings: new Map(), sales: [], orders: [] }));
      const spelled = name.trim().replace(/\s+/g, " ");
      c.spellings.set(spelled, (c.spellings.get(spelled) || 0) + 1);
      c.last = Math.max(c.last, at);
      return c;
    };
    (sales || []).forEach((s) => get(s.client, s.date)?.sales.push(s));
    // Un tribut est dû au village : ce n'est pas un client.
    (orders || []).filter((o) => o.kind !== "tribut").forEach((o) => get(o.client, o.createdAt)?.orders.push(o));
    // Nom affiché : l'orthographe la plus utilisée ; à égalité, « Kenji » plutôt que « KENJI » ou « kenji ».
    const tidy = (s) => (/^\p{Lu}/u.test(s) && s !== s.toLocaleUpperCase("fr") ? 1 : 0);
    for (const c of map.values()) {
      c.name = [...c.spellings].sort((a, b) => b[1] - a[1] || tidy(b[0]) - tidy(a[0]))[0][0];
      delete c.spellings;
      const salesTotal = c.sales.reduce((t, s) => t + s.total, 0);
      // Une vente sans paiement noté est considérée comme réglée sur place.
      const salesDue = c.sales.reduce((t, s) => {
        const p = salePaid(s);
        return t + (p && p < s.total ? s.total - p : 0);
      }, 0);
      const ordersPaid = c.orders.reduce((t, o) => t + orderPaid(o), 0);
      const ordersDue = c.orders.reduce((t, o) => t + Math.max(0, orderTotal(o) - orderPaid(o)), 0);
      c.paidToForge = salesTotal - salesDue + ordersPaid;
      c.due = salesDue + ordersDue;
      c.openOrders = c.orders.filter((o) => !o.deliveredAt).length;
    }
    return [...map.values()].sort((a, b) => b.last - a.last);
  }

  // Remplit la liste de suggestions et affiche sous le champ si le client est connu.
  function clientField(input, hint, getClients) {
    const listId = "client-names";
    let dl = document.getElementById(listId);
    if (!dl) {
      dl = document.createElement("datalist");
      dl.id = listId;
      document.body.appendChild(dl);
    }
    input.setAttribute("list", listId);
    const refresh = () => {
      dl.innerHTML = getClients()
        .map((c) => `<option value="${esc(c.name)}"></option>`)
        .join("");
      update();
    };
    const update = () => {
      const key = clientKey(input.value);
      if (!key) {
        hint.hidden = true;
        return;
      }
      const all = getClients();
      const c = all.find((x) => x.key === key);
      hint.hidden = false;
      if (!c) {
        // Clients dont le nom contient ce qui est tapé : un clic remplit le champ.
        const near = all.filter((x) => x.key.includes(key)).slice(0, 4);
        hint.innerHTML = near.length
          ? `<span>Déjà venu ?</span> ${near
              .map((x) => `<button type="button" class="btn btn-chip" data-pick-client="${esc(x.name)}">${esc(x.name)}</button>`)
              .join("")} <span class="meta">Sinon c'est un nouveau client.</span>`
          : `Nouveau client : il sera retenu pour les prochaines fois.`;
        return;
      }
      const parts = [];
      if (c.sales.length) parts.push(`${c.sales.length} vente${c.sales.length > 1 ? "s" : ""}`);
      if (c.orders.length) parts.push(`${c.orders.length} commande${c.orders.length > 1 ? "s" : ""}${c.openOrders ? ` dont ${c.openOrders} en cours` : ""}`);
      hint.innerHTML =
        `Client connu : ${parts.join(", ")}.` +
        (c.due ? ` <span class="pay-short">Reste dû ${esc(amountText(c.due))}.</span>` : "") +
        ` <a href="clients.html#client=${encodeURIComponent(c.name)}">Voir sa fiche</a>`;
    };
    input.addEventListener("input", update);
    hint.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pick-client]");
      if (!b) return;
      input.value = b.dataset.pickClient;
      update();
      input.focus();
    });
    return { refresh, update };
  }

  const clientLink = (name) => `<a class="client-link" href="clients.html#client=${encodeURIComponent(name)}">${esc(name)}</a>`;

  window.UI = {
    esc, me, SILVER, amount, amountText, price, fmtDate, seal, init, run, allowLoginPrompt, poll, toast,
    clientKey, clientsFrom, clientField, clientLink, salePaid, orderTotal, orderPaid,
    variantsOf, articles, articleOptions, findArticle, articleByName,
  };
})();
