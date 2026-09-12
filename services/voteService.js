const { db } = require("../db/database");

const ERREURS = {
  ELECTION_FERMEE: "ELECTION_FERMEE",
  IDENTIFIANTS_INVALIDES: "IDENTIFIANTS_INVALIDES",
  DEJA_VOTE: "DEJA_VOTE",
  CANDIDAT_INVALIDE: "CANDIDAT_INVALIDE",
};

async function getElectionBySlug(slug) {
  const r = await db.execute({ sql: "SELECT * FROM elections WHERE slug = ?", args: [slug] });
  return r.rows[0] || null;
}

/** Toutes les élections publiquement ouvertes (visibles sur la page d'accueil). */
async function listerElectionsOuvertes() {
  const r = await db.execute("SELECT * FROM elections WHERE statut = 'active' ORDER BY dateCreation DESC");
  return r.rows;
}

// --- Tours (scopés à une élection précise) ---

async function getTourActif(electionId) {
  const r = await db.execute({
    sql: "SELECT * FROM tours WHERE electionId = ? ORDER BY numero DESC LIMIT 1",
    args: [electionId],
  });
  return r.rows[0] || null;
}

async function estDansLaPeriodeDeVote(electionId) {
  const tour = await getTourActif(electionId);
  if (!tour || tour.statut !== "ouverte") return false;
  const maintenant = new Date();
  return maintenant >= new Date(tour.dateOuverture) && maintenant <= new Date(tour.dateCloture);
}

async function estClotureeDefinitivement(electionId) {
  const tour = await getTourActif(electionId);
  if (!tour) return false;
  if (tour.statut === "fermee") return true;
  return new Date() > new Date(tour.dateCloture);
}

async function authentifier(electionId, codeAcces) {
  const tour = await getTourActif(electionId);
  if (!tour) return { succes: false, erreur: ERREURS.IDENTIFIANTS_INVALIDES };

  const r = await db.execute({
    sql: "SELECT * FROM electeurs WHERE electionId = ? AND codeAcces = ?",
    args: [electionId, (codeAcces || "").trim()],
  });
  const electeur = r.rows[0];
  if (!electeur) return { succes: false, erreur: ERREURS.IDENTIFIANTS_INVALIDES };

  const rv = await db.execute({
    sql: "SELECT 1 FROM journal_votes WHERE electeurId = ? AND tourId = ?",
    args: [electeur.id, tour.id],
  });
  if (rv.rows.length > 0) return { succes: false, erreur: ERREURS.DEJA_VOTE };

  return { succes: true, electeur };
}

async function listerCandidatsValides(electionId) {
  const tour = await getTourActif(electionId);
  if (!tour) return [];
  const r = await db.execute({
    sql: `SELECT c.id, c.nom, c.prenom, c.club, c.photoUrl
          FROM candidats c
          JOIN candidats_tours ct ON ct.candidatId = c.id
          WHERE ct.tourId = ? AND c.valide = 1`,
    args: [tour.id],
  });
  return r.rows;
}

async function voter(electionId, electeurId, choix) {
  if (!(await estDansLaPeriodeDeVote(electionId))) {
    return { succes: false, erreur: ERREURS.ELECTION_FERMEE };
  }
  const tour = await getTourActif(electionId);

  let candidatId = null;
  let type = "blanc";

  if (choix !== "blanc") {
    const rc = await db.execute({
      sql: `SELECT c.id FROM candidats c
            JOIN candidats_tours ct ON ct.candidatId = c.id
            WHERE c.id = ? AND ct.tourId = ? AND c.valide = 1`,
      args: [choix, tour.id],
    });
    if (!rc.rows[0]) return { succes: false, erreur: ERREURS.CANDIDAT_INVALIDE };
    candidatId = rc.rows[0].id;
    type = "candidat";
  }

  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO journal_votes (tourId, electeurId) VALUES (?, ?)",
      args: [tour.id, electeurId],
    });
    await tx.execute({
      sql: "INSERT INTO bulletins (tourId, candidatId, type) VALUES (?, ?, ?)",
      args: [tour.id, candidatId, type],
    });
    await tx.commit();
    return { succes: true };
  } catch (e) {
    await tx.rollback();
    const dejaVote = /UNIQUE/i.test(e.message || "");
    return { succes: false, erreur: dejaVote ? ERREURS.DEJA_VOTE : "ERREUR_INCONNUE" };
  }
}

async function tendances(tourId) {
  const r0 = await db.execute({ sql: "SELECT * FROM tours WHERE id = ?", args: [tourId] });
  const tour = r0.rows[0];
  if (!tour) return { series: [], serieBlanc: { nom: "Votes blancs", valeurs: [0] }, totalPoints: 1 };

  const rb = await db.execute({
    sql: "SELECT type, candidatId FROM bulletins WHERE tourId = ? ORDER BY horodatage ASC, id ASC",
    args: [tour.id],
  });
  const rc = await db.execute({
    sql: `SELECT c.id, c.nom, c.prenom FROM candidats c
          JOIN candidats_tours ct ON ct.candidatId = c.id
          WHERE ct.tourId = ? AND c.valide = 1 ORDER BY c.nom ASC`,
    args: [tour.id],
  });

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

/** Résultats pour un tour donné (id de tour requis). */
async function resultats(tourId) {
  const r0 = await db.execute({ sql: "SELECT * FROM tours WHERE id = ?", args: [tourId] });
  const tour = r0.rows[0];

  if (!tour) {
    return {
      rows: [], blancs: 0, pourcentageBlancs: 0, suffragesExprimes: 0,
      totalVotants: 0, totalElecteurs: 0, tauxParticipation: 0, enTete: null,
    };
  }

  const rc = await db.execute({
    sql: `SELECT c.id, c.nom, c.prenom, c.photoUrl,
                 (SELECT COUNT(*) FROM bulletins b WHERE b.candidatId = c.id AND b.type = 'candidat' AND b.tourId = ?) AS voix
          FROM candidats c
          JOIN candidats_tours ct ON ct.candidatId = c.id
          WHERE ct.tourId = ? AND c.valide = 1
          ORDER BY voix DESC`,
    args: [tour.id, tour.id],
  });

  const rBlancs = await db.execute({ sql: "SELECT COUNT(*) AS n FROM bulletins WHERE type = 'blanc' AND tourId = ?", args: [tour.id] });
  const rVotants = await db.execute({ sql: "SELECT COUNT(*) AS n FROM journal_votes WHERE tourId = ?", args: [tour.id] });
  const rElecteurs = await db.execute({ sql: "SELECT COUNT(*) AS n FROM electeurs WHERE electionId = ?", args: [tour.electionId] });

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
    rows, blancs, pourcentageBlancs, suffragesExprimes, totalVotants, totalElecteurs,
    tauxParticipation, enTete: rows[0] || null,
  };
}

module.exports = {
  ERREURS,
  getElectionBySlug,
  listerElectionsOuvertes,
  getTourActif,
  estDansLaPeriodeDeVote,
  estClotureeDefinitivement,
  authentifier,
  listerCandidatsValides,
  voter,
  resultats,
  tendances,
};
