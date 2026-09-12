const express = require("express");
const router = express.Router();
const voteService = require("../services/voteService");

function requireAuth(req, res, next) {
	if (!req.session.electeurId || req.session.electeurSlug !== req.params.slug) {
		return res.redirect(`/e/${req.params.slug}/login`);
	}
	next();
}

/** Résout le slug en élection ; 404 propre si inconnu. */
async function chargerElection(req, res, next) {
	const election = await voteService.getElectionBySlug(req.params.slug);
	if (!election) return res.status(404).render("election-introuvable");
	req.election = election;
	next();
}

// --- Page d'accueil : liste des élections actuellement ouvertes ---
router.get("/", async (req, res) => {
	const elections = await voteService.listerElectionsOuvertes();
	res.render("accueil", {elections});
});

// Ancienne URL /login sans slug : redirige vers la liste des élections
router.get("/login", (req, res) => res.redirect("/"));

router.get("/e/:slug/login", chargerElection, async (req, res) => {
	const tour = await voteService.getTourActif(req.election.id);
	res.render("login", {erreur: null, election: req.election, tour, slug: req.params.slug});
});

router.post("/e/:slug/login", chargerElection, async (req, res) => {
	const {codeAcces} = req.body;
	const tour = await voteService.getTourActif(req.election.id);

	if (!(await voteService.estDansLaPeriodeDeVote(req.election.id))) {
		return res.render("login", {erreur: "Le vote n'est pas ouvert actuellement.", election: req.election, tour, slug: req.params.slug});
	}

	const resultat = await voteService.authentifier(req.election.id, codeAcces || "");

	if (!resultat.succes) {
		const message =
				resultat.erreur === "DEJA_VOTE"
						? "Vous avez déjà voté à ce tour. Un seul vote est autorisé par électeur et par tour."
						: "Code d'accès invalide.";
		return res.render("login", {erreur: message, election: req.election, tour, slug: req.params.slug});
	}

	req.session.electeurId = resultat.electeur.id;
	req.session.electeurSlug = req.params.slug;
	req.session.electeurNom = `${resultat.electeur.prenom} ${resultat.electeur.nom}`;
	res.redirect(`/e/${req.params.slug}/vote`);
});

router.get("/e/:slug/vote", chargerElection, requireAuth, async (req, res) => {
	if (!(await voteService.estDansLaPeriodeDeVote(req.election.id))) {
		req.session.destroy(() => {
		});
		return res.render("cloture");
	}
	const candidats = await voteService.listerCandidatsValides(req.election.id);
	const tour = await voteService.getTourActif(req.election.id);
	res.render("vote", {candidats, nom: req.session.electeurNom, erreur: null, tour, slug: req.params.slug});
});

router.post("/e/:slug/vote", chargerElection, requireAuth, async (req, res) => {
	const {candidatId} = req.body;
	const electeurId = req.session.electeurId;

	const choix = candidatId === "blanc" ? "blanc" : parseInt(candidatId, 10);
	const resultat = await voteService.voter(req.election.id, electeurId, choix);

	if (!resultat.succes) {
		const messages = {
			ELECTION_FERMEE: "Le vote est clôturé.",
			DEJA_VOTE: "Vous avez déjà voté.",
			CANDIDAT_INVALIDE: "Candidat invalide.",
		};
		const candidats = await voteService.listerCandidatsValides(req.election.id);
		const tour = await voteService.getTourActif(req.election.id);
		return res.render("vote", {
			candidats,
			nom: req.session.electeurNom,
			erreur: messages[resultat.erreur] || "Une erreur est survenue.",
			tour,
			slug: req.params.slug,
		});
	}

	const nom = req.session.electeurNom;
	req.session.destroy(() => {
	});
	res.render("merci", {nom});
});

router.get("/e/:slug/tendances", chargerElection, async (req, res) => {
	const cloture = await voteService.estClotureeDefinitivement(req.election.id);
	const enCours = await voteService.estDansLaPeriodeDeVote(req.election.id);
	const tour = await voteService.getTourActif(req.election.id);

	if (!cloture) {
		return res.render("tendances", {election: req.election, tour, cloture: false, enCours, series: null});
	}

	const {series, serieBlanc, totalPoints} = await voteService.tendances(tour.id);
	const {rows, blancs, pourcentageBlancs, totalVotants, totalElecteurs, tauxParticipation, enTete} =
			await voteService.resultats(tour.id);

	res.render("tendances", {
		election: req.election, tour, cloture: true, enCours, series, serieBlanc, totalPoints,
		rows, blancs, pourcentageBlancs, totalVotants, totalElecteurs, tauxParticipation, enTete,
	});
});

module.exports = router;
