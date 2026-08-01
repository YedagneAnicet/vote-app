/**
 * Initialise (ou met à jour) l'élection et les candidats.
 * Usage : node scripts/init-election.js
 */
const {db, initSchema} = require("../db/database");

const ELECTION = {
	titre: "Élection Président(e) des Athlètes - Tir à l'Arc",
	dateOuverture: "2026-08-02T09:00:00",
	dateCloture: "2026-08-02T19:00:00",
};

const CANDIDATS = [
	{nom: "AKPAH", prenom: "Bedi Paul Donatien", club: "Les Archers de Kéroual", photoUrl: "/images/candidats/akpah.png"},
	{nom: "EYENI", prenom: "Mongomin N'Diamoi Franck Olivier", club: "Arc Club de Nîmes", photoUrl: "/images/candidats/eyeni.png"},
	{nom: "OBO", prenom: "Rike Cedric Idriss Rubinel", club: "Association Sportive des Archers d'Abidjan", photoUrl: "/images/candidats/obo.png"},
	{nom: "YEDAGNE", prenom: "Ekpobi Anne-Marie Éléonord", club: "Toupah Arc Club", photoUrl: "/images/candidats/yedagne.png"},
];

(async () => {
	await initSchema();

	await db.execute({
		sql: `INSERT INTO election (id, titre, dateOuverture, dateCloture, statut)
              VALUES (1, ?, ?, ?, 'ouverte') ON CONFLICT(id) DO
        UPDATE SET titre=excluded.titre, dateOuverture=excluded.dateOuverture, dateCloture=excluded.dateCloture`,
		args: [ELECTION.titre, ELECTION.dateOuverture, ELECTION.dateCloture],
	});

	await db.execute("DELETE FROM candidats");
	for (const c of CANDIDATS) {
		await db.execute({
			sql: "INSERT INTO candidats (nom, prenom, club, photoUrl, valide) VALUES (?, ?, ?, ?, 1)",
			args: [c.nom, c.prenom, c.club, c.photoUrl],
		});
	}

	console.log(`Élection configurée : "${ELECTION.titre}"`);
	console.log(`Ouverture : ${ELECTION.dateOuverture}  |  Clôture : ${ELECTION.dateCloture}`);
	console.log(`${CANDIDATS.length} candidat(s) enregistré(s).`);
	process.exit(0);
})();
