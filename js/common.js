// En-tête, connexion par compte et petits utilitaires partagés par les deux pages.
(function () {
  let store = null;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const me = () => (Store.getSession() || {}).user || "";

  // Pièce de cuivre d'Edo (mon) : ronde, percée d'un trou carré.
  const coin = () =>
    '<svg class="mon" viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 .8a7.2 7.2 0 1 1 0 14.4A7.2 7.2 0 0 1 8 .8zM5.6 5.6v4.8h4.8V5.6z"/></svg><span class="sr-only"> pièces de cuivre</span>';

  function price(n) {
    if (n === null || n === undefined || n === "") return '<span class="price price-unset">à fixer</span>';
    return `<span class="price">${n}${coin()}</span>`;
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

  window.UI = { esc, me, coin, price, fmtDate, seal, init, run, allowLoginPrompt, poll, toast };
})();
