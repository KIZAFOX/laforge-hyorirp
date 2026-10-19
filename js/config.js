// ------------------------------------------------------------------
//  Configuration de La Forge
// ------------------------------------------------------------------
//
//  LAFORGE_API : adresse du serveur (Cloudflare Worker + base SQLite D1)
//  qui garde les prix et le registre pour tout le monde.
//  Voir le README.md, partie « Base de données partagée ».
//
//  Laisse vide ("") pour un mode d'essai où les données restent
//  uniquement dans ton navigateur.

// Les comptes des forgerons. Doit correspondre à ACCOUNTS dans worker/wrangler.toml.
window.LAFORGE_ACCOUNTS = ["Kamon", "Asahi", "Kurogane"];

window.LAFORGE_API =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8787" // serveur lancé en local avec `npm run dev` dans /worker
    : "https://laforge-api.kiza-dev.workers.dev/"; // ex : "https://laforge-api.ton-pseudo.workers.dev"
