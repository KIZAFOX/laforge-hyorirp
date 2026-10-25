-- Base SQLite (Cloudflare D1) de La Forge.
-- À exécuter une fois : npx wrangler d1 execute laforge --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  kanji     TEXT NOT NULL DEFAULT '',
  note      TEXT NOT NULL DEFAULT '',
  featured  INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price       INTEGER,            -- NULL = prix pas encore fixé
  note        TEXT NOT NULL DEFAULT '',
  position    INTEGER NOT NULL,
  variants    TEXT NOT NULL DEFAULT '' -- coloris ou modèles, séparés par des virgules
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS price_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        INTEGER NOT NULL,
  by        TEXT,
  item      TEXT NOT NULL,
  kind      TEXT NOT NULL,        -- 'prix' | 'ajout' | 'retrait'
  old_price INTEGER,
  new_price INTEGER
);

CREATE TABLE IF NOT EXISTS sales (
  id      TEXT PRIMARY KEY,
  date    INTEGER NOT NULL,
  vendeur TEXT NOT NULL,
  client  TEXT NOT NULL DEFAULT '',
  note    TEXT NOT NULL DEFAULT '',
  total   INTEGER NOT NULL,           -- en cuivre (1 argent = 100 cuivre)
  paid_argent INTEGER NOT NULL DEFAULT 0, -- pièces données par le client
  paid_cuivre INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sales_date ON sales(date DESC);
CREATE INDEX IF NOT EXISTS sales_vendeur ON sales(vendeur);

CREATE TABLE IF NOT EXISTS sale_lines (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  qty     INTEGER NOT NULL,
  unit    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_lines_sale ON sale_lines(sale_id);

-- Prix de départ (ignorés si déjà présents)
INSERT OR IGNORE INTO categories (id, name, kanji, note, featured, position) VALUES
  ('samourai', 'Samouraï', '侍', 'Réservé aux samouraïs, qualité excellente uniquement.', 1, 0),
  ('outils',   'Outils',   '道具', '', 0, 1),
  ('derouillage', 'Dérouillage au vernis', '錆落とし', 'Une touche de vernis par niveau de rouille. Un outil tranchant n''a pas besoin de vernis.', 0, 2),
  ('divers',   'Divers',   '雑貨', '', 0, 3);

INSERT OR IGNORE INTO items (id, category_id, name, price, note, position, variants) VALUES
  ('armure-complete',     'samourai', 'Armure complète',               100,  '', 0, 'Bleu,Noir,Rouge,Brun,Blanc'),
  ('casque',              'samourai', 'Casque',                         25,  '', 1, 'Bleu,Noir,Rouge,Brun,Blanc'),
  ('plastron',            'samourai', 'Plastron',                       25,  '', 2, 'Bleu,Noir,Rouge,Brun,Blanc'),
  ('jambieres',           'samourai', 'Jambières',                      25,  '', 3, 'Bleu,Noir,Rouge,Brun,Blanc'),
  ('bottes',              'samourai', 'Bottes',                         25,  '', 4, 'Bleu,Noir,Rouge,Brun,Blanc'),
  ('katana',              'samourai', 'Katana',                         85,  '', 5, 'Neon Blade,Black Ice,Swift Sheet'),
  ('reparation-samourai', 'samourai', 'Réparation',                     NULL, 'Prix pas encore fixé', 6, ''),
  ('outil-bien',          'outils',   'Outil (qualité bien ou moins)',  15,  '', 0, ''),
  ('outil-excellent',     'outils',   'Outil (qualité excellente)',     25,  '', 1, ''),
  ('reparation',          'outils',   'Réparation',                     15,  '', 2, ''),
  ('reparation-mineurs',  'outils',   'Réparation (mineurs)',            5,  'Tarif réservé aux mineurs', 3, ''),
  ('vernis-emousse',      'derouillage', 'Émoussé',                     30,  '1 touche de vernis', 0, ''),
  ('vernis-rouille',      'derouillage', 'Fortement rouillé',           50,  '2 touches de vernis', 1, ''),
  ('vernis-critique',     'derouillage', 'Rouille critique',            70,  '3 touches de vernis', 2, ''),
  ('cadenas',            'divers',   'Cadenas',                        20,  '', 0, ''),
  ('couteau',             'divers',   'Couteau',                         5,  '', 1, ''),
  ('cisaille',            'divers',   'Cisaille',                        5,  '', 2, ''),
  ('trousseau-cles',      'divers',   'Trousseau de clés',              10,  '', 3, ''),
  ('chaudron',            'divers',   'Chaudron',                       25,  '', 4, ''),
  ('seau',                'divers',   'Seau',                            5,  '', 5, '');

-- Commandes

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  created_by   TEXT NOT NULL,
  client       TEXT NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  delivered_at INTEGER,             -- NULL = pas encore livrée
  kind         TEXT NOT NULL DEFAULT 'commande' -- 'commande' (client) ou 'tribut' (dû au village)
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
