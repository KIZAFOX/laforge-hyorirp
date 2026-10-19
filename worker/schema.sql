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
  position    INTEGER NOT NULL
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
  ('divers',   'Divers',   '雑貨', '', 0, 2);

INSERT OR IGNORE INTO items (id, category_id, name, price, note, position) VALUES
  ('armure-complete',     'samourai', 'Armure complète',               100,  '', 0),
  ('piece-armure',        'samourai', 'Pièce d''armure (au choix)',     25,  '', 1),
  ('katana',              'samourai', 'Katana',                         85,  '', 2),
  ('reparation-samourai', 'samourai', 'Réparation',                     NULL, 'Prix pas encore fixé', 3),
  ('outil-bien',          'outils',   'Outil (qualité bien ou moins)',  15,  '', 0),
  ('outil-excellent',     'outils',   'Outil (qualité excellente)',     25,  '', 1),
  ('reparation',          'outils',   'Réparation',                     15,  '', 2),
  ('reparation-mineurs',  'outils',   'Réparation (mineurs)',            5,  'Tarif réservé aux mineurs', 3),
  ('cadenas',             'divers',   'Cadenas',                        20,  '', 0),
  ('couteau',             'divers',   'Couteau',                         5,  '', 1),
  ('cisaille',            'divers',   'Cisaille',                        5,  '', 2),
  ('chaudron',            'divers',   'Chaudron',                       25,  '', 3),
  ('seau',                'divers',   'Seau',                            5,  '', 4);
