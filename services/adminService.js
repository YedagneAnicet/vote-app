const bcrypt = require("bcryptjs");
const db = require("../db/database");

function authentifierAdmin(identifiant, motDePasse) {
	const admin = db.prepare("SELECT * FROM admins WHERE identifiant = ?").get((identifiant || "").trim());
	if (!admin) return {succes: false};
	const valide = bcrypt.compareSync(motDePasse || "", admin.motDePasseHache);
	if (!valide) return {succes: false};
	return {succes: true, admin};
}

// --- Élection ---
function getElectionAdmin() {
	return db.prepare("SELECT * FROM election WHERE id = 1").get();
}

function modifierElection({ titre, dateOuverture, dateCloture, statut }) {
	db.prepare(
			`INSERT INTO election (id, titre, dateOuverture, dateCloture, statut)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       titre = excluded.titre,
       dateOuverture = excluded.dateOuverture,
       dateCloture = excluded.dateCloture,
       statut = excluded.statut`
	).run(
			(titre || "").trim(),
			(dateOuverture || "").trim(),
			(dateCloture || "").trim(),
			statut === "fermee" ? "fermee" : "ouverte"
	);
}

// --- Candidats ---
function listerCandidats() {
	return db.prepare("SELECT * FROM candidats ORDER BY valide DESC, nom ASC").all();
}

function ajouterCandidat({nom, prenom, club, photoUrl}) {
	db.prepare("INSERT INTO candidats (nom, prenom, club, photoUrl, valide) VALUES (?, ?, ?, ?, 1)").run(
			(nom || "").trim().toUpperCase(),
			(prenom || "").trim(),
			(club || "").trim(),
			(photoUrl || "").trim()
	);
}

function basculerCandidat(id) {
	db.prepare("UPDATE candidats SET valide = 1 - valide WHERE id = ?").run(id);
}

function modifierCandidat(id, {nom, prenom, club, photoUrl}) {
	db.prepare("UPDATE candidats SET nom = ?, prenom = ?, club = ?, photoUrl = ? WHERE id = ?").run(
			(nom || "").trim().toUpperCase(),
			(prenom || "").trim(),
			(club || "").trim(),
			(photoUrl || "").trim(),
			id
	);
}

// --- Électeurs ---
function listerElecteurs() {
	return db
			.prepare(
					`SELECT e.id, e.numeroLicence, e.nom, e.prenom, e.telephone, e.codeAcces, e.aVote
                     FROM electeurs e
                     ORDER BY e.nom ASC, e.prenom ASC`
			)
			.all();
}

function ajouterElecteur({numeroLicence, nom, prenom, dateNaissance, telephone}) {
	const code = genererCodeUnique();
	db.prepare(
			`INSERT INTO electeurs (numeroLicence, nom, prenom, dateNaissance, telephone, codeAcces)
             VALUES (?, ?, ?, ?, ?, ?)`
	).run(
			(numeroLicence || "").trim(),
			(nom || "").trim().toUpperCase(),
			(prenom || "").trim(),
			(dateNaissance || "").trim(),
			(telephone || "").trim(),
			code
	);
	return code;
}

function modifierElecteur(id, {numeroLicence, nom, prenom, dateNaissance, telephone}) {
	db.prepare(
			`UPDATE electeurs
             SET numeroLicence = ?,
                 nom = ?,
                 prenom = ?,
                 dateNaissance = ?,
                 telephone = ?
             WHERE id = ?`
	).run(
			(numeroLicence || "").trim(),
			(nom || "").trim().toUpperCase(),
			(prenom || "").trim(),
			(dateNaissance || "").trim(),
			(telephone || "").trim(),
			id
	);
}

function genererCodeUnique() {
	const existe = db.prepare("SELECT 1 FROM electeurs WHERE codeAcces = ?");
	let code;
	do {
		code = Math.floor(100000 + Math.random() * 900000).toString();
	} while (existe.get(code));
	return code;
}

function reinitialiserScrutinComplet() {
	// Remet TOUT à zéro : tous les bulletins, tout le journal de vote, tous les électeurs.
	// À utiliser uniquement pour nettoyer des données de test avant l'ouverture réelle du scrutin.
	db.prepare("DELETE FROM bulletins").run();
	db.prepare("DELETE FROM journal_votes").run();
	db.prepare("UPDATE electeurs SET aVote = 0").run();
}

module.exports = {
	authentifierAdmin,
	listerCandidats,
	ajouterCandidat,
	basculerCandidat,
	modifierCandidat,
	listerElecteurs,
	ajouterElecteur,
	modifierElecteur,
	reinitialiserScrutinComplet,
	getElectionAdmin,
	modifierElection
};