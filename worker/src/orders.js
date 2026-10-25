// Commandes : fabrication suivie ligne par ligne et paiement en plusieurs versements.

export class BadRequest extends Error {}
export class Forbidden extends Error {}

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

// Commande d'un client, ou tribut dû au village
const kindOf = (v) => {
  if (v !== "commande" && v !== "tribut") throw new BadRequest("Type de commande inconnu.");
  return v;
};

const coins = (v, field) => (v === undefined || v === null || v === "" ? 0 : int(v, 0, 1000000, field));

// Routes /api/orders… ; renvoie null si la route ne concerne pas les commandes.
export async function handleOrders(request, db, path, user) {
  if (path === "/api/orders") {
    if (request.method === "GET") return { data: await listOrders(db) };
    if (request.method === "POST") return { data: await addOrder(db, await readBody(request), user), status: 201 };
  }

  let m = path.match(/^\/api\/orders\/([\w-]{1,64})$/);
  if (m) {
    const id = m[1];
    // Tous les forgerons peuvent modifier ou supprimer une commande.
    if (request.method === "PUT") {
      await mustExist(db, id);
      const body = await readBody(request);
      const stmts = [];
      if (body.delivered !== undefined)
        stmts.push(db.prepare("UPDATE orders SET delivered_at = ? WHERE id = ?").bind(body.delivered ? Date.now() : null, id));
      if (body.client !== undefined)
        stmts.push(db.prepare("UPDATE orders SET client = ? WHERE id = ?").bind(str(body.client, 60, "client", true), id));
      if (body.note !== undefined) stmts.push(db.prepare("UPDATE orders SET note = ? WHERE id = ?").bind(str(body.note, 300, "remarque"), id));
      if (body.kind !== undefined) stmts.push(db.prepare("UPDATE orders SET kind = ? WHERE id = ?").bind(kindOf(body.kind), id));
      if (body.lignes !== undefined) stmts.push(...(await replaceLines(db, id, body.lignes)));
      if (stmts.length) await db.batch(stmts);
      return { data: await getOrder(db, id) };
    }
    if (request.method === "DELETE") {
      await mustExist(db, id);
      await db.prepare("DELETE FROM orders WHERE id = ?").bind(id).run();
      return { data: null, status: 204 };
    }
  }

  // Avancement d'une ligne : { delta: +1 } (sûr si plusieurs forgerons cliquent en même temps) ou { done: 12 }
  m = path.match(/^\/api\/orders\/([\w-]{1,64})\/lines\/([\w-]{1,64})$/);
  if (m && request.method === "POST") {
    await mustExist(db, m[1]);
    const body = await readBody(request);
    const stmt =
      body.delta !== undefined
        ? db
            .prepare("UPDATE order_lines SET done = MAX(0, MIN(qty, done + ?)) WHERE id = ? AND order_id = ?")
            .bind(int(body.delta, -100000, 100000, "avancement"), m[2], m[1])
        : db
            .prepare("UPDATE order_lines SET done = MAX(0, MIN(qty, ?)) WHERE id = ? AND order_id = ?")
            .bind(int(body.done, 0, 100000, "avancement"), m[2], m[1]);
    const r = await stmt.run();
    if (!r.meta.changes) throw new BadRequest("Cette ligne n'existe pas dans la commande.");
    return { data: await getOrder(db, m[1]) };
  }

  m = path.match(/^\/api\/orders\/([\w-]{1,64})\/payments$/);
  if (m && request.method === "POST") {
    await mustExist(db, m[1]);
    const body = await readBody(request);
    const argent = coins(body.argent, "pièces d'argent");
    const cuivre = coins(body.cuivre, "pièces de cuivre");
    if (!argent && !cuivre) throw new BadRequest("Indique combien le client a payé.");
    await db
      .prepare("INSERT INTO order_payments (order_id, at, by, argent, cuivre, note) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(m[1], Date.now(), user, argent, cuivre, str(body.note, 200, "remarque"))
      .run();
    return { data: await getOrder(db, m[1]), status: 201 };
  }

  m = path.match(/^\/api\/orders\/([\w-]{1,64})\/payments\/(\d{1,12})$/);
  if (m && request.method === "DELETE") {
    const p = await db.prepare("SELECT id FROM order_payments WHERE id = ? AND order_id = ?").bind(Number(m[2]), m[1]).first();
    if (!p) throw new BadRequest("Ce versement n'existe pas.");
    await db.prepare("DELETE FROM order_payments WHERE id = ?").bind(Number(m[2])).run();
    return { data: await getOrder(db, m[1]) };
  }

  return null;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch (e) {
    throw new BadRequest("Corps de requête illisible.");
  }
}

async function mustExist(db, id) {
  const o = await db.prepare("SELECT id, created_by FROM orders WHERE id = ?").bind(id).first();
  if (!o) throw new BadRequest("Cette commande n'existe plus.");
  return o;
}

function assemble(orders, lines, payments) {
  const byOrder = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.order_id)) map.set(r.order_id, []);
      map.get(r.order_id).push(r);
    }
    return map;
  };
  const L = byOrder(lines);
  const P = byOrder(payments);
  return orders.map((o) => ({
    id: o.id,
    createdAt: o.created_at,
    createdBy: o.created_by,
    client: o.client,
    note: o.note,
    deliveredAt: o.delivered_at,
    kind: o.kind || "commande",
    lignes: (L.get(o.id) || []).map(({ id, name, qty, unit, done }) => ({ id, name, qty, unit, done })),
    paiements: (P.get(o.id) || []).map(({ id, at, by, argent, cuivre, note }) => ({ id, at, by, argent, cuivre, note })),
  }));
}

async function listOrders(db) {
  const [o, l, p] = await db.batch([
    db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000"),
    db.prepare("SELECT * FROM order_lines ORDER BY position"),
    db.prepare("SELECT * FROM order_payments ORDER BY at"),
  ]);
  return assemble(o.results, l.results, p.results);
}

async function getOrder(db, id) {
  const [o, l, p] = await db.batch([
    db.prepare("SELECT * FROM orders WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM order_lines WHERE order_id = ? ORDER BY position").bind(id),
    db.prepare("SELECT * FROM order_payments WHERE order_id = ? ORDER BY at").bind(id),
  ]);
  return assemble(o.results, l.results, p.results)[0] || null;
}

// Nouvelles lignes d'une commande : une ligne existante garde ses pièces déjà faites
// (sans dépasser sa nouvelle quantité), une ligne retirée disparaît.
async function replaceLines(db, orderId, input) {
  if (!Array.isArray(input) || !input.length || input.length > 60) throw new BadRequest("Une commande doit contenir entre 1 et 60 lignes.");
  const old = (await db.prepare("SELECT id, done FROM order_lines WHERE order_id = ?").bind(orderId).all()).results;
  const doneById = new Map(old.map((l) => [l.id, l.done]));
  const lignes = input.map((l) => {
    const qty = int(l.qty, 1, 100000, "quantité");
    const known = typeof l.id === "string" && doneById.has(l.id);
    return {
      id: known ? l.id : crypto.randomUUID(),
      name: str(l.name, 100, "article", true),
      qty,
      unit: int(l.unit, 0, 1000000, "prix unitaire"),
      done: known ? Math.min(qty, doneById.get(l.id)) : 0,
    };
  });
  return [
    db.prepare("DELETE FROM order_lines WHERE order_id = ?").bind(orderId),
    ...lignes.map((l, i) =>
      db
        .prepare("INSERT INTO order_lines (id, order_id, name, qty, unit, done, position) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(l.id, orderId, l.name, l.qty, l.unit, l.done, i)
    ),
  ];
}

async function addOrder(db, body, user) {
  const client = str(body.client, 60, "client", true);
  const note = str(body.note, 300, "remarque");
  if (!Array.isArray(body.lignes) || !body.lignes.length || body.lignes.length > 60)
    throw new BadRequest("Une commande doit contenir entre 1 et 60 lignes.");
  const lignes = body.lignes.map((l) => ({
    id: crypto.randomUUID(),
    name: str(l.name, 100, "article", true),
    qty: int(l.qty, 1, 100000, "quantité"),
    unit: int(l.unit, 0, 1000000, "prix unitaire"),
  }));
  const id = crypto.randomUUID();
  const now = Date.now();
  const p = body.paiement || {};
  const argent = coins(p.argent, "pièces d'argent");
  const cuivre = coins(p.cuivre, "pièces de cuivre");

  const stmts = [
    db
      .prepare("INSERT INTO orders (id, created_at, created_by, client, note, kind) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, now, user, client, note, kindOf(body.kind || "commande")),
    ...lignes.map((l, i) =>
      db
        .prepare("INSERT INTO order_lines (id, order_id, name, qty, unit, done, position) VALUES (?, ?, ?, ?, ?, 0, ?)")
        .bind(l.id, id, l.name, l.qty, l.unit, i)
    ),
  ];
  if (argent || cuivre)
    stmts.push(
      db
        .prepare("INSERT INTO order_payments (order_id, at, by, argent, cuivre, note) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, now, user, argent, cuivre, "Versé à la commande")
    );
  await db.batch(stmts);
  return getOrder(db, id);
}
