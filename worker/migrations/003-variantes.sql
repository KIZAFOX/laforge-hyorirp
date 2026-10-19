-- Variantes d'articles (coloris des armures, modèles de katana).
-- À lancer UNE fois sur la base en ligne : npm run db:variantes

ALTER TABLE items ADD COLUMN variants TEXT NOT NULL DEFAULT '';

-- Coloris des armures et modèles de katana
UPDATE items SET variants = 'Bleu,Noir,Rouge,Brun' WHERE id = 'armure-complete';
UPDATE items SET variants = 'Neon Blade,Black Ice' WHERE id = 'katana';

-- « Pièce d'armure (au choix) » devient quatre articles à 25, chacun en quatre coloris
DELETE FROM items WHERE id = 'piece-armure';
INSERT OR IGNORE INTO items (id, category_id, name, price, note, position, variants) VALUES
  ('casque',    'samourai', 'Casque',    25, '', 1, 'Bleu,Noir,Rouge,Brun'),
  ('plastron',  'samourai', 'Plastron',  25, '', 2, 'Bleu,Noir,Rouge,Brun'),
  ('jambieres', 'samourai', 'Jambières', 25, '', 3, 'Bleu,Noir,Rouge,Brun'),
  ('bottes',    'samourai', 'Bottes',    25, '', 4, 'Bleu,Noir,Rouge,Brun');
UPDATE items SET position = 0 WHERE id = 'armure-complete';
UPDATE items SET position = 5 WHERE id = 'katana';
UPDATE items SET position = 6 WHERE id = 'reparation-samourai';
