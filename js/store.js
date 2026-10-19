// Accès aux données : l'API SQLite partagée si elle est configurée,
// sinon le navigateur (mode d'essai).
(function () {
  const DEFAULT_PRICES = {
    updatedAt: null,
    updatedBy: null,
    categories: [
      {
        id: "samourai",
        name: "Samouraï",
        kanji: "侍",
        note: "Réservé aux samouraïs, qualité excellente uniquement.",
        featured: true,
        items: [
          { id: "armure-complete", name: "Armure complète", price: 100, note: "" },
          { id: "piece-armure", name: "Pièce d'armure (au choix)", price: 25, note: "" },
          { id: "katana", name: "Katana", price: 85, note: "" },
          { id: "reparation-samourai", name: "Réparation", price: null, note: "Prix pas encore fixé" },
        ],
      },
      {
        id: "outils",
        name: "Outils",
        kanji: "道具",
        note: "",
        featured: false,
        items: [
          { id: "outil-bien", name: "Outil (qualité bien ou moins)", price: 15, note: "" },
          { id: "outil-excellent", name: "Outil (qualité excellente)", price: 25, note: "" },
          { id: "reparation", name: "Réparation", price: 15, note: "" },
          { id: "reparation-mineurs", name: "Réparation (mineurs)", price: 5, note: "Tarif réservé aux mineurs" },
        ],
      },
      {
        id: "divers",
        name: "Divers",
        kanji: "雑貨",
        note: "",
        featured: false,
        items: [
          { id: "cadenas", name: "Cadenas", price: 20, note: "" },
          { id: "couteau", name: "Couteau", price: 5, note: "" },
          { id: "cisaille", name: "Cisaille", price: 5, note: "" },
          { id: "chaudron", name: "Chaudron", price: 25, note: "" },
          { id: "seau", name: "Seau", price: 5, note: "" },
        ],
      },
    ],
  };

  const LS = { prices: "laforge.prices", sales: "laforge.sales", history: "laforge.history", session: "laforge.session" };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const read = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.error(e);
    }
  };

  // Session = compte choisi + son token, gardés sur cet appareil.
  const getSession = () => read(LS.session, null);
  const setSession = (s) => write(LS.session, s);
  const clearSession = () => {
    try {
      localStorage.removeItem(LS.session);
    } catch (e) {}
  };
  const unauthorized = (msg) => Object.assign(new Error(msg), { status: 401 });

  // Même logique d'historique que le serveur (worker/src/index.js)
  function diffPrices(oldP, newP, by, at) {
    const old = oldP.categories.flatMap((c) => c.items);
    const oldById = new Map(old.map((i) => [i.id, i]));
    const out = [];
    const kept = new Set();
    newP.categories.forEach((c) =>
      c.items.forEach((i) => {
        kept.add(i.id);
        const b = oldById.get(i.id);
        if (!b) out.push({ at, by, item: i.name, kind: "ajout", old_price: null, new_price: i.price });
        else if (b.price !== i.price) out.push({ at, by, item: i.name, kind: "prix", old_price: b.price, new_price: i.price });
      })
    );
    old.forEach((o) => {
      if (!kept.has(o.id)) out.push({ at, by, item: o.name, kind: "retrait", old_price: o.price, new_price: null });
    });
    return out;
  }

  // Mode essai : pas de serveur, donc le token n'est pas vérifié.
  function localStore() {
    const who = () => {
      const s = getSession();
      if (!s || !window.LAFORGE_ACCOUNTS.includes(s.user)) throw unauthorized("Choisis ton compte pour entrer dans la forge.");
      return s.user;
    };
    return {
      mode: "local",
      async me() {
        return { user: who() };
      },
      async getPrices() {
        who();
        const p = read(LS.prices, clone(DEFAULT_PRICES));
        p.history = read(LS.history, []);
        return p;
      },
      async savePrices(p) {
        const by = who();
        const at = Date.now();
        const old = read(LS.prices, clone(DEFAULT_PRICES));
        const next = {
          updatedAt: at,
          updatedBy: by,
          categories: p.categories.map((c) => ({ ...c, items: c.items.filter((i) => i.name.trim()) })),
        };
        write(LS.history, [...diffPrices(old, next, by, at).reverse(), ...read(LS.history, [])].slice(0, 30));
        write(LS.prices, next);
        return this.getPrices();
      },
      async getSales() {
        who();
        return read(LS.sales, []).sort((a, b) => b.date - a.date);
      },
      async addSale(s) {
        const sale = { ...s, vendeur: who(), id: uid(), date: Date.now(), total: s.lignes.reduce((t, l) => t + l.qty * l.unit, 0) };
        write(LS.sales, [...read(LS.sales, []), sale]);
        return sale;
      },
      async deleteSale(id) {
        const user = who();
        const all = read(LS.sales, []);
        const sale = all.find((s) => s.id === id);
        if (sale && sale.vendeur !== user) throw Object.assign(new Error("Tu ne peux effacer que tes propres ventes."), { status: 403 });
        write(LS.sales, all.filter((s) => s.id !== id));
      },
    };
  }

  function apiStore(base) {
    async function req(method, path, body) {
      const s = getSession();
      if (!s) throw unauthorized("Choisis ton compte pour entrer dans la forge.");
      let res;
      try {
        res = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Forge-User": encodeURIComponent(s.user),
            "X-Forge-Token": encodeURIComponent(s.token),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        const err = new Error("Impossible de joindre le serveur de la forge. Vérifie ta connexion puis réessaie.");
        err.status = 0;
        throw err;
      }
      if (!res.ok) {
        let msg = "";
        try {
          msg = (await res.json()).error;
        } catch (e) {}
        const err = new Error(msg || `Le serveur a répondu ${res.status}.`);
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    }

    return {
      mode: "shared",
      me: () => req("GET", "/api/me"),
      getPrices: () => req("GET", "/api/prices"),
      savePrices: (p) => req("PUT", "/api/prices", { categories: p.categories }),
      getSales: () => req("GET", "/api/sales"),
      addSale: (s) => req("POST", "/api/sales", s),
      deleteSale: (id) => req("DELETE", "/api/sales/" + encodeURIComponent(id)),
    };
  }

  window.Store = {
    clone,
    uid,
    getSession,
    setSession,
    clearSession,
    create() {
      const base = (window.LAFORGE_API || "").replace(/\/+$/, "");
      return base ? apiStore(base) : localStore();
    },
  };
})();
