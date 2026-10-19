# La Forge, Hyori RP

Site de la forge sur le serveur Minecraft RP **Hyori** :

- **Prix** (`index.html`) : la liste des prix en pièces de cuivre, modifiable, avec l'historique des changements (qui a changé quoi, quand).
- **Registre** (`registre.html`) : chaque vente est inscrite au nom du forgeron connecté. Tout le monde voit les ventes de tout le monde, avec les totaux par forgeron, un filtre, une recherche et un export CSV.

Trois comptes : **Kamon**, **Asahi**, **Kurogane**. Chacun se connecte avec son propre token. Une vente est toujours signée par le compte connecté, et chacun ne peut effacer que ses propres ventes.

## Comment c'est construit

```
GitHub Pages (index.html, registre.html, css/, js/)
        │  appels HTTPS avec le compte + le token
        ▼
Cloudflare Worker (worker/src/index.js)  ──►  Cloudflare D1 = base SQLite
```

GitHub Pages ne sert que des fichiers, il ne peut pas garder de données. La base SQLite vit donc chez Cloudflare (gratuit pour cet usage) et le site l'appelle.

---

## 1. Créer la base SQLite et l'API (une seule fois)

Il faut [Node.js](https://nodejs.org) et un compte Cloudflare gratuit.

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create laforge
```

La dernière commande affiche un `database_id`. Colle-le dans [`worker/wrangler.toml`](worker/wrangler.toml) à la place des zéros. Ensuite :

```bash
npm run db:remote
```

Puis choisis un token pour chaque forgeron (une phrase longue que toi seul connais, différente pour chacun). Chaque commande demande la valeur :

```bash
npx wrangler secret put TOKEN_KAMON
```

```bash
npx wrangler secret put TOKEN_ASAHI
```

```bash
npx wrangler secret put TOKEN_KUROGANE
```

Enfin, mets l'API en ligne :

```bash
npm run deploy
```

Elle affiche une adresse du genre `https://laforge-api.ton-pseudo.workers.dev`. Colle-la dans [`js/config.js`](js/config.js), à la place de `""` dans `LAFORGE_API`.

Envoie ensuite à chaque forgeron **son** token, en message privé.

## 2. Mettre le site en ligne avec GitHub Pages

1. Pousse le dossier sur le dépôt `laforge-hyorirp`.
2. Sur GitHub : **Settings → Pages → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`, **Save**.
3. Le site arrive sur `https://kizafox.github.io/laforge-hyorirp/`.
4. Conseillé : dans `worker/wrangler.toml`, remplace `ALLOWED_ORIGIN = "*"` par `"https://kizafox.github.io"`, puis refais `npm run deploy`.

## Le logo

Le site affiche `img/logo.png` dans l'en-tête et comme icône d'onglet. Dépose le logo du serveur à cet endroit (format carré). Sans fichier, l'en-tête affiche seulement le nom en texte.

## Après une modification du site

Dans `index.html` et `registre.html`, les fichiers CSS et JS sont appelés avec un numéro de version (`style.css?v=4`). Quand tu modifies un fichier de `css/` ou `js/`, augmente ce numéro dans les deux pages (`?v=5`, puis `?v=6`…) : les navigateurs des forgerons chargeront alors la nouvelle version au lieu de garder l'ancienne en cache.

## Monnaie

Les prix sont enregistrés en cuivre et affichés en pièces : **1 pièce d'argent = 100 pièces de cuivre** (125 s'affiche 1 argent 25 cuivre). À chaque vente, on peut noter ce que le client a donné (argent et cuivre) : le site calcule la monnaie à rendre ou ce qui reste dû.

Si ta base en ligne a été créée avant l'ajout des pièces d'argent, lance une fois, dans `worker/`, **avant** le deploy :

```bash
npm run db:paiement
```

## Commandes

La page **Commandes** (`commandes.html`) sert aux grosses commandes à fabriquer : on coche les pièces faites ligne par ligne (barre et % d'avancement) et on note chaque versement du client jusqu'au paiement complet. Tous les forgerons peuvent avancer une commande et noter un versement ; seul celui qui l'a créée peut la supprimer, et chacun ne peut retirer que ses propres versements.

Sur une base en ligne créée avant cette page, lance une fois, dans `worker/`, **avant** le deploy :

```bash
npm run db:commandes
```

## Clients

Il n'y a pas de fichier clients à remplir : la page **Clients** (`clients.html`) les retrouve dans le registre et les commandes. Un nom tapé une fois dans « Client » est proposé les fois suivantes (les majuscules ne comptent pas : « kenji » et « Kenji » sont la même personne). Chaque fiche client montre ce qu'il a payé, ce qu'il doit encore, ses commandes et ses ventes.

Une vente sans paiement noté est considérée comme payée sur place ; seuls les paiements partiels comptent dans « Reste dû ».

## Ajouter ou renommer un forgeron

1. Modifie la liste dans [`js/config.js`](js/config.js) (`LAFORGE_ACCOUNTS`) **et** dans [`worker/wrangler.toml`](worker/wrangler.toml) (`ACCOUNTS`).
2. Crée son token : `npx wrangler secret put TOKEN_<NOM EN MAJUSCULES>`.
3. `npm run deploy`, puis pousse le site.

Pour changer le token d'un forgeron, refais simplement `npx wrangler secret put TOKEN_<NOM>`.

## Tester sur ton PC

Dans un premier terminal :

```bash
cd worker && npm run db:local && npm run dev
```

Dans un second, à la racine du projet :

```bash
python -m http.server 8123
```

Ouvre <http://localhost:8123>. En local, le site parle automatiquement à l'API locale. Les tokens de test sont dans `worker/.dev.vars` (fichier ignoré par git, jamais publié).

Si `LAFORGE_API` est vide, le site passe en **mode essai** : les données restent dans le navigateur et le token n'est pas vérifié. C'est indiqué en haut de la page.

## Où modifier quoi

| Quoi | Où |
|---|---|
| Prix de départ (base neuve) | `worker/schema.sql` |
| Comptes des forgerons | `js/config.js` et `worker/wrangler.toml` |
| Couleurs, polices | variables en haut de `css/style.css` |
| Règles de l'API (droits, limites) | `worker/src/index.js` |
