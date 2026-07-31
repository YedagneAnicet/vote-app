const db = require("../db/database");

const ERREURS = {
  ELECTION_FERMEE: "ELECTION_FERMEE",
  IDENTIFIANTS_INVALIDES: "IDENTIFIANTS_INVALIDES",
  DEJA_VOTE: "DEJA_VOTE",
  CANDIDAT_INVALIDE: "CANDIDAT_INVALIDE",
};

function getElection() {
  return db.prepare("SELECT * FROM election WHERE id = 1").get();
}

function estDansLaPeriodeDeVote() {
  const election = getElection();
  if (!election || election.statut !== "ouverte") return false;
  const maintenant = new Date();
  return maintenant >= new Date(election.dateOuverture) && maintenant <= new Date(election.dateCloture);
}

function authentifier(codeAcces) {
  const electeur = db
    .prepare("SELECT * FROM electeurs WHERE codeAcces = ?")
    .get((codeAcces || "").trim());

  if (!electeur) {
    return { succes: false, erreur: ERREURS.IDENTIFIANTS_INVALIDES };
  }
  if (electeur.aVote === 1) {
    return { succes: false, erreur: ERREURS.DEJA_VOTE };
  }
  return { succes: true, electeur };
}

function listerCandidatsValides() {
  return db.prepare("SELECT id, nom, prenom, club, photoUrl FROM candidats WHERE valide = 1").all();
}

/**
 * Enregistre le vote de façon atomique :
 * - vérifie une dernière fois l'absence de vote (contrainte UNIQUE journal_votes.electeurId)
 * - insère le bulletin (anonyme, sans lien avec l'électeur) — pour un candidat ou en blanc
 * - marque l'électeur comme ayant voté
 * Toute violation de contrainte (double vote concurrent) annule la transaction entière.
 */
const enregistrerVote = db.transaction((electeurId, choix) => {
  let candidatId = null;
  let type = "blanc";

  if (choix !== "blanc") {
    const candidat = db.prepare("SELECT id FROM candidats WHERE id = ? AND valide = 1").get(choix);
    if (!candidat) {
      throw Object.assign(new Error(ERREURS.CANDIDAT_INVALIDE), { code: ERREURS.CANDIDAT_INVALIDE });
    }
    candidatId = candidat.id;
    type = "candidat";
  }

  try {
    db.prepare("INSERT INTO journal_votes (electeurId) VALUES (?)").run(electeurId);
  } catch (e) {
    // Violation de la contrainte UNIQUE => l'électeur a déjà voté (protège aussi contre les doubles clics)
    throw Object.assign(new Error(ERREURS.DEJA_VOTE), { code: ERREURS.DEJA_VOTE });
  }

  db.prepare("INSERT INTO bulletins (candidatId, type) VALUES (?, ?)").run(candidatId, type);
  db.prepare("UPDATE electeurs SET aVote = 1 WHERE id = ?").run(electeurId);
});

function voter(electeurId, choix) {
  if (!estDansLaPeriodeDeVote()) {
    return { succes: false, erreur: ERREURS.ELECTION_FERMEE };
  }
  try {
    enregistrerVote(electeurId, choix);
    return { succes: true };
  } catch (e) {
    return { succes: false, erreur: e.code || "ERREUR_INCONNUE" };
  }
}

function estClotureeDefinitivement() {
	const election = getElection();
	if (!election) return false;
	if (election.statut === "fermee") return true;
	return new Date() > new Date(election.dateCloture);
}

/**
 * Évolution cumulée des votes dans le temps, pour un graphique de tendance.
 * Chaque bulletin déposé fait progresser d'un point les courbes (ordre chronologique,
 * sans exposer l'heure exacte de chaque bulletin individuellement — juste le rang).
 */
function tendances() {
	const bulletins = db
			.prepare(`SELECT type, candidatId FROM bulletins ORDER BY horodatage ASC, id ASC`)
			.all();

	const candidats = db
			.prepare("SELECT id, nom, prenom FROM candidats WHERE valide = 1 ORDER BY nom ASC")
			.all();

	const cumul = {};
	candidats.forEach((c) => (cumul[c.id] = 0));
	let cumulBlanc = 0;

	const series = candidats.map((c) => ({ id: c.id, nom: `${c.prenom} ${c.nom}`, valeurs: [0] }));
	const serieBlanc = { nom: "Votes blancs", valeurs: [0] };

	bulletins.forEach((b) => {
		if (b.type === "blanc") {
			cumulBlanc++;
		} else if (cumul[b.candidatId] !== undefined) {
			cumul[b.candidatId]++;
		}
		series.forEach((s) => s.valeurs.push(cumul[s.id]));
		serieBlanc.valeurs.push(cumulBlanc);
	});

	return { series, serieBlanc, totalPoints: bulletins.length + 1 };
}

function resultats() {
  const rows = db
    .prepare(
      `SELECT c.id, c.nom, c.prenom, c.photoUrl, COUNT(b.id) AS voix
       FROM candidats c
       LEFT JOIN bulletins b ON b.candidatId = c.id AND b.type = 'candidat'
       WHERE c.valide = 1
       GROUP BY c.id
       ORDER BY voix DESC`
    )
    .all();

  const blancs = db.prepare("SELECT COUNT(*) AS n FROM bulletins WHERE type = 'blanc'").get().n;
  const totalVotants = db.prepare("SELECT COUNT(*) AS n FROM journal_votes").get().n;
  const totalElecteurs = db.prepare("SELECT COUNT(*) AS n FROM electeurs").get().n;
  const suffragesExprimes = totalVotants - blancs; // hors blancs, comme en usage électoral

  const rowsAvecPourcentage = rows.map((r) => ({
    ...r,
    pourcentage: totalVotants > 0 ? Math.round((r.voix / totalVotants) * 1000) / 10 : 0,
  }));

  const pourcentageBlancs = totalVotants > 0 ? Math.round((blancs / totalVotants) * 1000) / 10 : 0;
  const tauxParticipation = totalElecteurs > 0 ? Math.round((totalVotants / totalElecteurs) * 1000) / 10 : 0;

  return {
    rows: rowsAvecPourcentage,
    blancs,
    pourcentageBlancs,
    suffragesExprimes,
    totalVotants,
    totalElecteurs,
    tauxParticipation,
    enTete: rowsAvecPourcentage[0] || null,
  };
}

module.exports = {
  ERREURS,
  getElection,
  estDansLaPeriodeDeVote,
  authentifier,
  listerCandidatsValides,
  voter,
  resultats,
	tendances,
	estClotureeDefinitivement,
};
