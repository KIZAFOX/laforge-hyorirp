-- Commandes : à lancer une fois sur la base en ligne (npm run db:commandes).
-- Sans risque si on le relance : les tables existantes ne sont pas touchées.

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL,
  client       TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  delivered_at INTEGER              -- NULL = pas encore livrée
);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_lines (
  id       TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  qty      INTEGER NOT NULL,
  unit     INTEGER NOT NULL,        -- prix unitaire en cuivre
  done     INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_lines_order ON order_lines(order_id);

CREATE TABLE IF NOT EXISTS order_payments (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  at       INTEGER NOT NULL,
  by       TEXT NOT NULL,
  argent   INTEGER NOT NULL DEFAULT 0,
  cuivre   INTEGER NOT NULL DEFAULT 0,
  note     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS order_payments_order ON order_payments(order_id);
