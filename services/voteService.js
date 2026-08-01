const { db } = require("../db/database");

const ERREURS = {
  ELECTION_FERMEE: "ELECTION_FERMEE",
  IDENTIFIANTS_INVALIDES: "IDENTIFIANTS_INVALIDES",
  DEJA_VOTE: "DEJA_VOTE",
  CANDIDAT_INVALIDE: "CANDIDAT_INVALIDE",
};

async function getElection() {
  const r = await db.execute("SELECT * FROM election WHERE id = 1");
  return r.rows[0] || null;
}

async function estDansLaPeriodeDeVote() {
  const election = await getElection();
  if (!election || election.statut !== "ouverte") return false;
  const maintenant = new Date();
  return maintenant >= new Date(election.dateOuverture) && maintenant <= new Date(election.dateCloture);
}

async function estClotureeDefinitivement() {
  const election = await getElection();
  if (!election) return false;
  if (election.statut === "fermee") return true;
  return new Date() > new Date(election.dateCloture);
}

async function authentifier(codeAcces) {
  const r = await db.execute({
    sql: "SELECT * FROM electeurs WHERE codeAcces = ?",
    args: [(codeAcces || "").trim()],
  });
  const electeur = r.rows[0];
  if (!electeur) return { succes: false, erreur: ERREURS.IDENTIFIANTS_INVALIDES };
  if (electeur.aVote === 1) return { succes: false, erreur: ERREURS.DEJA_VOTE };
  return { succes: true, electeur };
}

async function listerCandidatsValides() {
  const r = await db.execute("SELECT id, nom, prenom, club, photoUrl FROM candidats WHERE valide = 1");
  return r.rows;
}

/**
 * Enregistre le vote de façon atomique via une transaction interactive :
 * - vérifie une dernière fois l'absence de vote (contrainte UNIQUE journal_votes.electeurId)
 * - insère le bulletin (anonyme, sans lien avec l'électeur) — pour un candidat ou en blanc
 * - marque l'électeur comme ayant voté
 * Toute violation de contrainte (double vote concurrent) annule la transaction entière.
 */
async function voter(electeurId, choix) {
  if (!(await estDansLaPeriodeDeVote())) {
    return { succes: false, erreur: ERREURS.ELECTION_FERMEE };
  }

  let candidatId = null;
  let type = "blanc";

  if (choix !== "blanc") {
    const rc = await db.execute({ sql: "SELECT id FROM candidats WHERE id = ? AND valide = 1", args: [choix] });
    if (!rc.rows[0]) return { succes: false, erreur: ERREURS.CANDIDAT_INVALIDE };
    candidatId = rc.rows[0].id;
    type = "candidat";
  }

  const tx = await db.transaction("write");
  try {
    // Insertion dans journal_votes : la contrainte UNIQUE(electeurId) protège contre le double vote,
    // y compris en cas de requêtes concurrentes (double clic, deux onglets).
    await tx.execute({ sql: "INSERT INTO journal_votes (electeurId) VALUES (?)", args: [electeurId] });
    await tx.execute({
      sql: "INSERT INTO bulletins (candidatId, type) VALUES (?, ?)",
      args: [candidatId, type],
    });
    await tx.execute({ sql: "UPDATE electeurs SET aVote = 1 WHERE id = ?", args: [electeurId] });
    await tx.commit();
    return { succes: true };
  } catch (e) {
    await tx.rollback();
    const dejaVote = /UNIQUE/i.test(e.message || "");
    return { succes: false, erreur: dejaVote ? ERREURS.DEJA_VOTE : "ERREUR_INCONNUE" };
  }
}

/**
 * Évolution cumulée des votes dans le temps, pour un graphique de tendance.
 */
async function tendances() {
  const rb = await db.execute("SELECT type, candidatId FROM bulletins ORDER BY horodatage ASC, id ASC");
  const rc = await db.execute("SELECT id, nom, prenom FROM candidats WHERE valide = 1 ORDER BY nom ASC");

  const cumul = {};
  rc.rows.forEach((c) => (cumul[c.id] = 0));
  let cumulBlanc = 0;

  const series = rc.rows.map((c) => ({ id: c.id, nom: `${c.prenom} ${c.nom}`, valeurs: [0] }));
  const serieBlanc = { nom: "Votes blancs", valeurs: [0] };

  rb.rows.forEach((b) => {
    if (b.type === "blanc") {
      cumulBlanc++;
    } else if (cumul[b.candidatId] !== undefined) {
      cumul[b.candidatId]++;
    }
    series.forEach((s) => s.valeurs.push(cumul[s.id]));
    serieBlanc.valeurs.push(cumulBlanc);
  });

  return { series, serieBlanc, totalPoints: rb.rows.length + 1 };
}

async function resultats() {
  const rc = await db.execute(`
    SELECT c.id, c.nom, c.prenom, c.photoUrl,
           (SELECT COUNT(*) FROM bulletins b WHERE b.candidatId = c.id AND b.type = 'candidat') AS voix
    FROM candidats c
    WHERE c.valide = 1
    ORDER BY voix DESC
  `);

  const rBlancs = await db.execute("SELECT COUNT(*) AS n FROM bulletins WHERE type = 'blanc'");
  const rVotants = await db.execute("SELECT COUNT(*) AS n FROM journal_votes");
  const rElecteurs = await db.execute("SELECT COUNT(*) AS n FROM electeurs");

  const blancs = Number(rBlancs.rows[0].n);
  const totalVotants = Number(rVotants.rows[0].n);
  const totalElecteurs = Number(rElecteurs.rows[0].n);
  const suffragesExprimes = totalVotants - blancs;

  const rows = rc.rows.map((r) => ({
    ...r,
    voix: Number(r.voix),
    pourcentage: totalVotants > 0 ? Math.round((Number(r.voix) / totalVotants) * 1000) / 10 : 0,
  }));

  const pourcentageBlancs = totalVotants > 0 ? Math.round((blancs / totalVotants) * 1000) / 10 : 0;
  const tauxParticipation = totalElecteurs > 0 ? Math.round((totalVotants / totalElecteurs) * 1000) / 10 : 0;

  return {
    rows,
    blancs,
    pourcentageBlancs,
    suffragesExprimes,
    totalVotants,
    totalElecteurs,
    tauxParticipation,
    enTete: rows[0] || null,
  };
}

module.exports = {
  ERREURS,
  getElection,
  estDansLaPeriodeDeVote,
  estClotureeDefinitivement,
  authentifier,
  listerCandidatsValides,
  voter,
  resultats,
  tendances,
};
