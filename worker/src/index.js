// API de La Forge : prix et registre des ventes stockés dans SQLite (Cloudflare D1).

import { handleOrders, BadRequest, Forbidden } from "./orders.js";

const str = (v, max, field, required = false) => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (required && !s) throw new BadRequest(`Le champ « ${field} » est obligatoire.`);
  if (s.length > max) throw new BadRequest(`Le champ « ${field} » est trop long (${max} caractères max).`);
  return s;
};

const int = (v, min, max, field) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`Valeur invalide pour « ${field} ».`);
  return n;
};

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Forge-User, X-Forge-Token",
      "Access-Control-Max-Age": "86400",
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    const fail = (status, error) => json({ error }, status);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      // Chaque forgeron a son compte (liste ACCOUNTS) et son token (secret TOKEN_<NOM>).
      const accounts = (env.ACCOUNTS || "").split(",").map((a) => a.trim()).filter(Boolean);
      let user = "";
      let token = "";
      try {
        user = decodeURIComponent(request.headers.get("X-Forge-User") || "");
        token = decodeURIComponent(request.headers.get("X-Forge-Token") || "");
      } catch (e) {}
      if (!accounts.includes(user)) return fail(401, "Choisis ton compte pour entrer dans la forge.");
      const expected = env["TOKEN_" + user.toUpperCase()];
      if (!expected || !(await sameSecret(token, expected))) return fail(401, `Token incorrect pour ${user}.`);

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "");
      const db = env.DB;

      if (path === "/api/me" && request.method === "GET") return json({ user, accounts });

      if (path === "/api/prices") {
        if (request.method === "GET") return json(await getPrices(db));
        if (request.method === "PUT") {
          await savePrices(db, await readBody(request), user);
          return json(await getPrices(db));
        }
      }

      if (path === "/api/sales") {
        if (request.method === "GET") return json(await listSales(db, url));
        if (request.method === "POST") return json(await addSale(db, await readBody(request), user), 201);
      }

      const m = path.match(/^\/api\/sales\/([\w-]{1,64})$/);
      if (m && request.method === "DELETE") {
        const sale = await db.prepare("SELECT vendeur FROM sales WHERE id = ?").bind(m[1]).first();
        if (sale && sale.vendeur !== user) return fail(403, "Tu ne peux effacer que tes propres ventes.");
        await db.prepare("DELETE FROM sales WHERE id = ?").bind(m[1]).run();
        return new Response(null, { status: 204, headers: cors });
      }

      const order = await handleOrders(request, db, path, user);
      if (order) return order.status === 204 ? new Response(null, { status: 204, headers: cors }) : json(order.data, order.status || 200);

      return fail(404, "Route inconnue.");
    } catch (e) {
      if (e instanceof BadRequest) return fail(400, e.message);
      if (e instanceof Forbidden) return fail(403, e.message);
      console.error(e);
      return fail(500, "Erreur du serveur de la forge.");
    }
  },
};

// Comparaison à temps constant (via empreintes) pour ne pas laisser deviner le token.
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch (e) {
    throw new BadRequest("Corps de requête illisible.");
  }
}

async function getPrices(db) {
  const [cats, items, meta, hist] = await db.batch([
    db.prepare("SELECT id, name, kanji, note, featured FROM categories ORDER BY position"),
    db.prepare("SELECT id, category_id, name, price, note FROM items ORDER BY position"),
    db.prepare("SELECT key, value FROM meta WHERE key IN ('updated_at', 'updated_by')"),
    db.prepare("SELECT at, by, item, kind, old_price, new_price FROM price_history ORDER BY id DESC LIMIT 30"),
  ]);
  const m = Object.fromEntries(meta.results.map((r) => [r.key, r.value]));
  return {
    updatedAt: m.updated_at ? Number(m.updated_at) : null,
    updatedBy: m.updated_by || null,
    categories: cats.results.map((c) => ({
      id: c.id,
      name: c.name,
      kanji: c.kanji,
      note: c.note,
      featured: !!c.featured,
      items: items.results
        .filter((i) => i.category_id === c.id)
        .map((i) => ({ id: i.id, name: i.name, price: i.price, note: i.note })),
    })),
    history: hist.results,
  };
}

async function savePrices(db, body, by) {
  if (!Array.isArray(body.categories) || body.categories.length > 30) throw new BadRequest("Liste de catégories invalide.");

  const seen = new Set();
  const freshId = (id) => {
    let v = typeof id === "string" && /^[\w-]{1,64}$/.test(id) ? id : "";
    if (!v || seen.has(v)) v = crypto.randomUUID();
    seen.add(v);
    return v;
  };

  const categories = body.categories.map((c) => {
    if (!Array.isArray(c.items) || c.items.length > 80) throw new BadRequest("Liste d'articles invalide.");
    return {
      id: freshId(c.id),
      name: str(c.name, 60, "catégorie", true),
      kanji: str(c.kanji, 6, "kanji"),
      note: str(c.note, 200, "remarque"),
      featured: c.featured ? 1 : 0,
      items: c.items
        .filter((i) => typeof i.name === "string" && i.name.trim())
        .map((i) => ({
          id: freshId(i.id),
          name: str(i.name, 80, "article", true),
          price: i.price === null || i.price === "" || i.price === undefined ? null : int(i.price, 0, 1000000, "prix"),
          note: str(i.note, 200, "remarque"),
        })),
    };
  });

  const old = (await db.prepare("SELECT id, name, price FROM items").all()).results;
  const oldById = new Map(old.map((i) => [i.id, i]));
  const now = Date.now();
  const history = [];
  const kept = new Set();
  for (const c of categories)
    for (const i of c.items) {
      const before = oldById.get(i.id);
      kept.add(i.id);
      if (!before) history.push([i.name, "ajout", null, i.price]);
      else if (before.price !== i.price) history.push([i.name, "prix", before.price, i.price]);
    }
  for (const o of old) if (!kept.has(o.id)) history.push([o.name, "retrait", o.price, null]);

  const stmts = [db.prepare("DELETE FROM items"), db.prepare("DELETE FROM categories")];
  categories.forEach((c, ci) => {
    stmts.push(
      db
        .prepare("INSERT INTO categories (id, name, kanji, note, featured, position) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(c.id, c.name, c.kanji, c.note, c.featured, ci)
    );
    c.items.forEach((i, ii) =>
      stmts.push(
        db
          .prepare("INSERT INTO items (id, category_id, name, price, note, position) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(i.id, c.id, i.name, i.price, i.note, ii)
      )
    );
  });
  stmts.push(
    db.prepare("INSERT INTO meta (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(now)),
    db.prepare("INSERT INTO meta (key, value) VALUES ('updated_by', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(by)
  );
  for (const [item, kind, oldPrice, newPrice] of history)
    stmts.push(
      db
        .prepare("INSERT INTO price_history (at, by, item, kind, old_price, new_price) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(now, by, item, kind, oldPrice, newPrice)
    );
  await db.batch(stmts);
}

async function listSales(db, url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 2000, 1), 10000);
  const [sales, lines] = await db.batch([
    db.prepare("SELECT id, date, vendeur, client, note, total, paid_argent, paid_cuivre FROM sales ORDER BY date DESC LIMIT ?").bind(limit),
    db
      .prepare(
        "SELECT sale_id, name, qty, unit FROM sale_lines WHERE sale_id IN (SELECT id FROM sales ORDER BY date DESC LIMIT ?) ORDER BY id"
      )
      .bind(limit),
  ]);
  const bySale = new Map();
  for (const l of lines.results) {
    if (!bySale.has(l.sale_id)) bySale.set(l.sale_id, []);
    bySale.get(l.sale_id).push({ name: l.name, qty: l.qty, unit: l.unit });
  }
  return sales.results.map(({ paid_argent, paid_cuivre, ...s }) => ({
    ...s,
    paiement: { argent: paid_argent, cuivre: paid_cuivre },
    lignes: bySale.get(s.id) || [],
  }));
}

async function addSale(db, body, vendeur) {
  const client = str(body.client, 60, "client");
  const note = str(body.note, 300, "remarque");
  if (!Array.isArray(body.lignes) || !body.lignes.length || body.lignes.length > 50)
    throw new BadRequest("Une vente doit contenir entre 1 et 50 articles.");
  const lignes = body.lignes.map((l) => ({
    name: str(l.name, 100, "article", true),
    qty: int(l.qty, 1, 9999, "quantité"),
    unit: int(l.unit, 0, 1000000, "prix unitaire"),
  }));
  // Paiement facultatif : pièces données par le client (1 argent = 100 cuivre)
  const p = body.paiement || {};
  const coins = (v, field) => (v === undefined || v === null || v === "" ? 0 : int(v, 0, 1000000, field));
  const paiement = { argent: coins(p.argent, "pièces d'argent"), cuivre: coins(p.cuivre, "pièces de cuivre") };
  const sale = {
    id: crypto.randomUUID(),
    date: Date.now(),
    vendeur,
    client,
    note,
    total: lignes.reduce((s, l) => s + l.qty * l.unit, 0),
    paiement,
    lignes,
  };
  await db.batch([
    db
      .prepare("INSERT INTO sales (id, date, vendeur, client, note, total, paid_argent, paid_cuivre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(sale.id, sale.date, vendeur, client, note, sale.total, paiement.argent, paiement.cuivre),
    ...lignes.map((l) =>
      db.prepare("INSERT INTO sale_lines (sale_id, name, qty, unit) VALUES (?, ?, ?, ?)").bind(sale.id, l.name, l.qty, l.unit)
    ),
  ]);
  return sale;
}
