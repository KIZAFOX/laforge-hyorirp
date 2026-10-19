-- À lancer UNE fois sur une base créée avant l'ajout des pièces d'argent :
--   npm run db:paiement
ALTER TABLE sales ADD COLUMN paid_argent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN paid_cuivre INTEGER NOT NULL DEFAULT 0;
