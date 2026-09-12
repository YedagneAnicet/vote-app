const bcrypt = require("bcryptjs");
const {db} = require("../db/database");

async function listerAdmins() {
	const r = await db.execute("SELECT id, identifiant FROM admins ORDER BY identifiant ASC");
	return r.rows;
}

async function compterAdmins() {
	const r = await db.execute("SELECT COUNT(*) AS n FROM admins");
	return Number(r.rows[0].n);
}

async function creerAdmin(identifiant, motDePasse) {
	const hache = bcrypt.hashSync(motDePasse, 10);
	await db.execute({
		sql: `INSERT INTO admins (identifiant, motDePasseHache)
              VALUES (?, ?)
              ON CONFLICT(identifiant) DO UPDATE SET motDePasseHache = excluded.motDePasseHache`,
		args: [identifiant, hache],
	});
}

async function authentifierAdmin(identifiant, motDePasse) {
	const r = await db.execute({
		sql: "SELECT * FROM admins WHERE identifiant = ?",
		args: [(identifiant || "").trim()],
	});
	const admin = r.rows[0];
	if (!admin) return {succes: false};
	const valide = bcrypt.compareSync(motDePasse || "", admin.motDePasseHache);
	if (!valide) return {succes: false};
	return {succes: true, admin};
}

// --- Élections (plusieurs simultanément) ---

function genererSlugBase(titre) {
	return (titre || "election")
			.toLowerCase()
			.normalize("NFD").replace(/[\u0300-\u036f]/g, "") // retire les accents
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "election";
}

async function genererSlugUnique(titre) {
	const base = genererSlugBase(titre);
	let slug = base;
	let i = 2;
	while (true) {
		const r = await db.execute({sql: "SELECT 1 FROM elections WHERE slug = ?", args: [slug]});
		if (r.rows.length === 0) return slug;
		slug = `${base}-${i}`;
		i++;
	}
}

async function listerElections() {
	const r = await db.execute("SELECT * FROM elections ORDER BY dateCreation DESC");
	return r.rows;
}

async function getElection(id) {
	const r = await db.execute({sql: "SELECT * FROM elections WHERE id = ?", args: [id]});
	return r.rows[0] || null;
}

/** Crée une élection indépendante (n'affecte aucune autre élection déjà ouverte). */
async function creerElection(titre) {
	const slug = await genererSlugUnique(titre);
	await db.execute({
		sql: "INSERT INTO elections (titre, slug, statut) VALUES (?, ?, 'active')",
		args: [(titre || "").trim(), slug],
	});
	const r = await db.execute({sql: "SELECT * FROM elections WHERE slug = ?", args: [slug]});
	return r.rows[0];
}

async function modifierElectionTitre(id, titre) {
	await db.execute({sql: "UPDATE elections SET titre = ? WHERE id = ?", args: [(titre || "").trim(), id]});
}

async function archiverElection(id) {
	await db.execute({sql: "UPDATE elections SET statut = 'archivee' WHERE id = ?", args: [id]});
}

async function reactiverElection(id) {
	await db.execute({sql: "UPDATE elections SET statut = 'active' WHERE id = ?", args: [id]});
}

// --- Tours (scopés à une élection précise) ---
async function listerTours(electionId) {
	const r = await db.execute({sql: "SELECT * FROM tours WHERE electionId = ? ORDER BY numero ASC", args: [electionId]});
	return r.rows;
}

async function getTour(electionId, numero) {
	const r = await db.execute({sql: "SELECT * FROM tours WHERE electionId = ? AND numero = ?", args: [electionId, numero]});
	return r.rows[0] || null;
}

async function getTourActif(electionId) {
	const r = await db.execute({sql: "SELECT * FROM tours WHERE electionId = ? ORDER BY numero DESC LIMIT 1", args: [electionId]});
	return r.rows[0] || null;
}

async function creerTour1SiAbsent(electionId, {dateOuverture, dateCloture}) {
	const existant = await getTour(electionId, 1);
	if (existant) return existant;

	await db.execute({
		sql: "INSERT INTO tours (electionId, numero, dateOuverture, dateCloture, statut) VALUES (?, 1, ?, ?, 'ouverte')",
		args: [electionId, dateOuverture, dateCloture],
	});
	const tour = await getTour(electionId, 1);

	const candidats = await listerCandidats(electionId);
	for (const c of candidats.filter((c) => c.valide)) {
		await db.execute({
			sql: "INSERT OR IGNORE INTO candidats_tours (tourId, candidatId) VALUES (?, ?)",
			args: [tour.id, c.id],
		});
	}
	return tour;
}

async function modifierTourActif(electionId, {dateOuverture, dateCloture, statut}) {
	const tour = await getTourActif(electionId);
	if (!tour) return;
	await db.execute({
		sql: `UPDATE tours
              SET dateOuverture = ?,
                  dateCloture   = ?,
                  statut        = ?
              WHERE id = ?`,
		args: [(dateOuverture || "").trim(), (dateCloture || "").trim(), statut === "fermee" ? "fermee" : "ouverte", tour.id],
	});
}

async function lancerNouveauTour(electionId, {dateOuverture, dateCloture, candidatIds}) {
	const tourPrecedent = await getTourActif(electionId);
	if (tourPrecedent && tourPrecedent.statut !== "fermee") {
		await db.execute({sql: "UPDATE tours SET statut = 'fermee' WHERE id = ?", args: [tourPrecedent.id]});
	}

	const nouveauNumero = tourPrecedent ? tourPrecedent.numero + 1 : 1;
	await db.execute({
		sql: "INSERT INTO tours (electionId, numero, dateOuverture, dateCloture, statut) VALUES (?, ?, ?, ?, 'ouverte')",
		args: [electionId, nouveauNumero, (dateOuverture || "").trim(), (dateCloture || "").trim()],
	});
	const tour = await getTour(electionId, nouveauNumero);

	for (const candidatId of candidatIds) {
		await db.execute({
			sql: "INSERT OR IGNORE INTO candidats_tours (tourId, candidatId) VALUES (?, ?)",
			args: [tour.id, candidatId],
		});
	}
	return tour;
}

// --- Candidats (scopés à une élection précise) ---
async function listerCandidats(electionId) {
	const r = await db.execute({sql: "SELECT * FROM candidats WHERE electionId = ? ORDER BY valide DESC, nom ASC", args: [electionId]});
	return r.rows;
}

async function listerCandidatsDuTour(tourId) {
	const r = await db.execute({
		sql: `SELECT c.*
              FROM candidats c
                       JOIN candidats_tours ct ON ct.candidatId = c.id
              WHERE ct.tourId = ?
              ORDER BY c.nom ASC`,
		args: [tourId],
	});
	return r.rows;
}

async function ajouterCandidat(electionId, {nom, prenom, club, photoUrl}) {
	await db.execute({
		sql: "INSERT INTO candidats (electionId, nom, prenom, club, photoUrl, valide) VALUES (?, ?, ?, ?, ?, 1)",
		args: [electionId, (nom || "").trim().toUpperCase(), (prenom || "").trim(), (club || "").trim(), (photoUrl || "").trim()],
	});
}

async function basculerCandidat(id) {
	await db.execute({sql: "UPDATE candidats SET valide = 1 - valide WHERE id = ?", args: [id]});
}

async function modifierCandidat(id, {nom, prenom, club, photoUrl}) {
	await db.execute({
		sql: "UPDATE candidats SET nom = ?, prenom = ?, club = ?, photoUrl = ? WHERE id = ?",
		args: [(nom || "").trim().toUpperCase(), (prenom || "").trim(), (club || "").trim(), (photoUrl || "").trim(), id],
	});
}

// --- Électeurs (scopés à une élection précise) ---
async function listerElecteurs(electionId) {
	const r = await db.execute({
		sql: "SELECT id, numeroLicence, nom, prenom, telephone, codeAcces, messageEnvoye FROM electeurs WHERE electionId = ? ORDER BY nom ASC, prenom ASC",
		args: [electionId],
	});

	const tour = await getTourActif(electionId);
	if (!tour) return r.rows.map((e) => ({...e, aVote: 0}));

	const rv = await db.execute({sql: "SELECT electeurId FROM journal_votes WHERE tourId = ?", args: [tour.id]});
	const ontVote = new Set(rv.rows.map((row) => row.electeurId));
	return r.rows.map((e) => ({...e, aVote: ontVote.has(e.id) ? 1 : 0}));
}

/**
 * Importe plusieurs électeurs à la fois depuis le contenu texte d'un CSV
 * (numeroLicence,nom,prenom,dateNaissance,telephone). Les codes déjà
 * existants pour un même numéro de licence ne sont pas régénérés.
 */
async function importerElecteursCSV(electionId, contenuCSV) {
	const lignes = contenuCSV.trim().split("\n");
	const entetes = lignes[0].split(",").map((h) => h.trim());
	const donnees = lignes.slice(1);

	let compteur = 0;
	const resultats = [];

	for (const ligne of donnees) {
		if (!ligne.trim()) continue;
		const valeurs = ligne.split(",").map((v) => v.trim());
		const e = {};
		entetes.forEach((h, i) => (e[h] = valeurs[i] || ""));
		if (!e.numeroLicence || !e.nom || !e.prenom) continue;

		const existant = await db.execute({
			sql: "SELECT codeAcces FROM electeurs WHERE electionId = ? AND numeroLicence = ?",
			args: [electionId, e.numeroLicence],
		});

		let code;
		if (existant.rows[0]) {
			code = existant.rows[0].codeAcces;
			await db.execute({
				sql: `UPDATE electeurs
                      SET nom           = ?,
                          prenom        = ?,
                          dateNaissance = ?,
                          telephone     = ?
                      WHERE electionId = ?
                        AND numeroLicence = ?`,
				args: [
					e.nom.toUpperCase(), e.prenom, e.dateNaissance || "", e.telephone || "",
					electionId, e.numeroLicence,
				],
			});
		}
		else {
			code = await genererCodeUnique(electionId);
			await db.execute({
				sql: `INSERT INTO electeurs (electionId, numeroLicence, nom, prenom, dateNaissance, telephone, codeAcces)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
				args: [electionId, e.numeroLicence, e.nom.toUpperCase(), e.prenom, e.dateNaissance || "", e.telephone || "", code],
			});
		}

		resultats.push({numeroLicence: e.numeroLicence, nom: e.nom.toUpperCase(), prenom: e.prenom, telephone: e.telephone || "", codeAcces: code});
		compteur++;
	}

	return {compteur, resultats};
}

async function genererCodeUnique(electionId) {
	let code;
	let existe = true;
	while (existe) {
		code = Math.floor(100000 + Math.random() * 900000).toString();
		const r = await db.execute({sql: "SELECT 1 FROM electeurs WHERE electionId = ? AND codeAcces = ?", args: [electionId, code]});
		existe = r.rows.length > 0;
	}
	return code;
}

async function ajouterElecteur(electionId, {numeroLicence, nom, prenom, dateNaissance, telephone}) {
	const code = await genererCodeUnique(electionId);
	await db.execute({
		sql: `INSERT INTO electeurs (electionId, numeroLicence, nom, prenom, dateNaissance, telephone, codeAcces)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
		args: [
			electionId,
			(numeroLicence || "").trim(),
			(nom || "").trim().toUpperCase(),
			(prenom || "").trim(),
			(dateNaissance || "").trim(),
			(telephone || "").trim(),
			code,
		],
	});
	return code;
}

async function modifierTour(tourId, {dateOuverture, dateCloture, statut}) {
	await db.execute({
		sql: `UPDATE tours
              SET dateOuverture = ?,
                  dateCloture   = ?,
                  statut        = ?
              WHERE id = ?`,
		args: [(dateOuverture || "").trim(), (dateCloture || "").trim(), statut === "fermee" ? "fermee" : "ouverte", tourId],
	});
}

async function modifierElecteur(id, {numeroLicence, nom, prenom, dateNaissance, telephone}) {
	await db.execute({
		sql: `UPDATE electeurs
              SET numeroLicence = ?,
                  nom           = ?,
                  prenom        = ?,
                  dateNaissance = ?,
                  telephone     = ?
              WHERE id = ?`,
		args: [
			(numeroLicence || "").trim(),
			(nom || "").trim().toUpperCase(),
			(prenom || "").trim(),
			(dateNaissance || "").trim(),
			(telephone || "").trim(),
			id,
		],
	});
}

/**
 * Convertit un numéro local ivoirien (ex. 07 78 36 67 33) au format attendu par wa.me
 * (indicatif sans "+"). Depuis la réforme de 2021, le numéro à 10 chiffres est utilisé
 * tel quel à l'international : le 0 de tête n'est PAS retiré (contrairement à la France).
 */
function normaliserTelephoneWhatsapp(telephone) {
	const chiffres = (telephone || "").replace(/[^0-9]/g, "");
	if (!chiffres) return null;
	if (chiffres.startsWith("00")) return chiffres.slice(2);
	if (chiffres.startsWith("225")) return chiffres;
	if (chiffres.length === 10) return "225" + chiffres;
	return chiffres;
}

function genererMessageElecteur(electeur, titreElection, lienVote) {
	return `Bonjour ${electeur.prenom},

Voici votre code d'accès personnel pour voter à l'élection "${titreElection}" :

Code : ${electeur.codeAcces}

Lien pour voter : ${lienVote}

Ce code est personnel et à usage unique. Ne le partagez avec personne.

Merci pour votre participation !`;
}

function genererLienWhatsapp(electeur, titreElection, lienVote) {
	const tel = normaliserTelephoneWhatsapp(electeur.telephone);
	if (!tel) return null;
	const texte = encodeURIComponent(genererMessageElecteur(electeur, titreElection, lienVote));
	return `https://wa.me/${tel}?text=${texte}`;
}

async function marquerMessageEnvoye(id) {
	await db.execute({sql: "UPDATE electeurs SET messageEnvoye = 1 WHERE id = ?", args: [id]});
}

async function reinitialiserScrutinComplet(electionId) {
	const tour = await getTourActif(electionId);
	if (!tour) return;
	await db.execute({sql: "DELETE FROM bulletins WHERE tourId = ?", args: [tour.id]});
	await db.execute({sql: "DELETE FROM journal_votes WHERE tourId = ?", args: [tour.id]});
}

module.exports = {
	authentifierAdmin,
	listerAdmins,
	compterAdmins,
	creerAdmin,
	listerElections,
	getElection,
	creerElection,
	modifierElectionTitre,
	archiverElection,
	reactiverElection,
	listerTours,
	getTour,
	getTourActif,
	creerTour1SiAbsent,
	modifierTourActif,
	lancerNouveauTour,
	listerCandidats,
	listerCandidatsDuTour,
	ajouterCandidat,
	basculerCandidat,
	modifierCandidat,
	listerElecteurs,
	ajouterElecteur,
	importerElecteursCSV,
	modifierElecteur,
	modifierTour,
	reinitialiserScrutinComplet,
	normaliserTelephoneWhatsapp,
	genererMessageElecteur,
	genererLienWhatsapp,
	marquerMessageEnvoye,
};
