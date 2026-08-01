/**
 * Importe les électeurs depuis un fichier CSV et génère un code d'accès unique pour chacun.
 * Format CSV attendu (avec en-tête) : numeroLicence,nom,prenom,dateNaissance,telephone
 * Usage : node scripts/import-electeurs.js chemin/vers/electeurs.csv
 */
const fs = require("fs");
const path = require("path");
const {db, initSchema} = require("../db/database");

const fichier = process.argv[2];
if (!fichier) {
	console.error("Usage : node scripts/import-electeurs.js chemin/vers/electeurs.csv");
	process.exit(1);
}

async function genererCodeUnique() {
	let code, existe = true;
	while (existe) {
		code = Math.floor(100000 + Math.random() * 900000).toString();
		const r = await db.execute({sql: "SELECT 1 FROM electeurs WHERE codeAcces = ?", args: [code]});
		existe = r.rows.length > 0;
	}
	return code;
}

(async () => {
	await initSchema();

	const contenu = fs.readFileSync(fichier, "utf-8").trim().split("\n");
	const entetes = contenu[0].split(",").map((h) => h.trim());
	const lignes = contenu.slice(1);

	const sorties = ["nom,prenom,telephone,codeAcces"];
	let compteur = 0;

	for (const ligne of lignes) {
		if (!ligne.trim()) continue;
		const valeurs = ligne.split(",").map((v) => v.trim());
		const electeur = {};
		entetes.forEach((h, i) => (electeur[h] = valeurs[i] || ""));
		const code = await genererCodeUnique();

		await db.execute({
			sql: `INSERT INTO electeurs (numeroLicence, nom, prenom, dateNaissance, telephone, codeAcces)
                  VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(numeroLicence) DO
            UPDATE SET
                nom=excluded.nom, prenom=excluded.prenom, dateNaissance=excluded.dateNaissance, telephone=excluded.telephone`,
			args: [electeur.numeroLicence, electeur.nom, electeur.prenom, electeur.dateNaissance, electeur.telephone, code],
		});

		sorties.push([electeur.nom, electeur.prenom, electeur.telephone, code].join(","));
		compteur++;
	}

	const cheminSortie = path.join(path.dirname(fichier), "codes-generes.csv");
	fs.writeFileSync(cheminSortie, sorties.join("\n"));

	console.log(`${compteur} électeur(s) importé(s) ou mis à jour.`);
	console.log(`Codes d'accès générés dans : ${cheminSortie}`);
	console.log("⚠️  Ce fichier contient des codes confidentiels : ne pas diffuser publiquement.");
	console.log("⚠️  Note : pour un électeur déjà existant, son code d'accès n'est PAS régénéré (préservé).");
	process.exit(0);
})();