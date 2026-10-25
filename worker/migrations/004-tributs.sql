-- Tributs dus au village : une commande peut être de type 'commande' (client) ou 'tribut'.
-- À lancer UNE fois sur la base en ligne : npm run db:tributs
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'commande';
