/**
 * Crée ou met à jour le compte administrateur.
 * Usage : node scripts/create-admin.js identifiant motdepasse
 * (Pointez TURSO_DATABASE_URL / TURSO_AUTH_TOKEN en variables d'environnement
 * pour agir sur la base de production plutôt que le fichier local.)
 */
const bcrypt = require("bcryptjs");
const {db, initSchema} = require("../db/database");

const [identifiant, motDePasse] = process.argv.slice(2);

if (!identifiant || !motDePasse) {
	console.error("Usage : node scripts/create-admin.js identifiant motdepasse");
	process.exit(1);
}
if (motDePasse.length < 8) {
	console.error("Le mot de passe doit contenir au moins 8 caractères.");
	process.exit(1);
}

(async () => {
	await initSchema();
	const hache = bcrypt.hashSync(motDePasse, 10);
	await db.execute({
		sql: `INSERT INTO admins (identifiant, motDePasseHache)
              VALUES (?, ?) ON CONFLICT(identifiant) DO
        UPDATE SET motDePasseHache = excluded.motDePasseHache`,
		args: [identifiant, hache],
	});
	console.log(`Compte administrateur "${identifiant}" créé/mis à jour.`);
	process.exit(0);
})();
