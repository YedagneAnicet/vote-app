const express = require("express");
const router = express.Router();
const voteService = require("../services/voteService");

function requireAuth(req, res, next) {
  if (!req.session.electeurId) return res.redirect("/login");
  next();
}

router.get("/", (req, res) => res.redirect("/login"));

router.get("/login", (req, res) => {
  const election = voteService.getElection();
  res.render("login", { erreur: null, election });
});

router.post("/login", (req, res) => {
  const { codeAcces } = req.body;
  const election = voteService.getElection();

  if (!voteService.estDansLaPeriodeDeVote()) {
    return res.render("login", { erreur: "Le vote n'est pas ouvert actuellement.", election });
  }

  const resultat = voteService.authentifier(codeAcces || "");

  if (!resultat.succes) {
    const message =
      resultat.erreur === "DEJA_VOTE"
        ? "Vous avez déjà voté."
        : "Code d'accès invalide.";
    return res.render("login", { erreur: message, election });
  }

  req.session.electeurId = resultat.electeur.id;
  req.session.electeurNom = `${resultat.electeur.prenom} ${resultat.electeur.nom}`;
  res.redirect("/vote");
});

router.get("/vote", requireAuth, (req, res) => {
  if (!voteService.estDansLaPeriodeDeVote()) {
    req.session.destroy(() => {});
    return res.render("cloture");
  }
  const candidats = voteService.listerCandidatsValides();
  res.render("vote", { candidats, nom: req.session.electeurNom, erreur: null });
});

router.post("/vote", requireAuth, (req, res) => {
  const { candidatId } = req.body;
  const electeurId = req.session.electeurId;

  const choix = candidatId === "blanc" ? "blanc" : parseInt(candidatId, 10);
  const resultat = voteService.voter(electeurId, choix);

  if (!resultat.succes) {
    const messages = {
      ELECTION_FERMEE: "Le vote est clôturé.",
      DEJA_VOTE: "Vous avez déjà voté.",
      CANDIDAT_INVALIDE: "Candidat invalide.",
    };
    const candidats = voteService.listerCandidatsValides();
    return res.render("vote", {
      candidats,
      nom: req.session.electeurNom,
      erreur: messages[resultat.erreur] || "Une erreur est survenue.",
    });
  }

  const nom = req.session.electeurNom;
  req.session.destroy(() => {});
  res.render("merci", { nom });
});

// --- Page publique des tendances (accessible sans connexion) ---
router.get("/tendances", (req, res) => {
	const election = voteService.getElection();
	const cloture = voteService.estClotureeDefinitivement();
	const enCours = voteService.estDansLaPeriodeDeVote();

	if (!cloture) {
		return res.render("tendances", { election, cloture: false, enCours, series: null });
	}

	const { series, serieBlanc, totalPoints } = voteService.tendances();
	const { rows, blancs, pourcentageBlancs, totalVotants, totalElecteurs, tauxParticipation, enTete } =
			voteService.resultats();

	res.render("tendances", {
		election,
		cloture: true,
		enCours,
		series,
		serieBlanc,
		totalPoints,
		rows,
		blancs,
		pourcentageBlancs,
		totalVotants,
		totalElecteurs,
		tauxParticipation,
		enTete,
	});
});

module.exports = router;
