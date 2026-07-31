/**
 * Crée ou met à jour le compte administrateur (accès au dashboard).
 * Usage : node scripts/create-admin.js identifiant motdepasse
 */
const bcrypt = require("bcryptjs");
const db = require("../db/database");

const [identifiant, motDePasse] = process.argv.slice(2);

if (!identifiant || !motDePasse) {
  console.error("Usage : node scripts/create-admin.js identifiant motdepasse");
  process.exit(1);
}

if (motDePasse.length < 8) {
  console.error("Le mot de passe doit contenir au moins 8 caractères.");
  process.exit(1);
}

const hache = bcrypt.hashSync(motDePasse, 10);

db.prepare(
  `INSERT INTO admins (identifiant, motDePasseHache) VALUES (?, ?)
   ON CONFLICT(identifiant) DO UPDATE SET motDePasseHache = excluded.motDePasseHache`
).run(identifiant, hache);

console.log(`Compte administrateur "${identifiant}" créé/mis à jour.`);
