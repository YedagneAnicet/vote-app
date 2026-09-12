const express = require("express");
const multer = require("multer");
const upload = multer({storage: multer.memoryStorage()});
const router = express.Router();
const adminService = require("../services/adminService");
const voteService = require("../services/voteService");

function requireAdmin(req, res, next) {
	if (!req.session.adminId) return res.redirect("/admin/login");
	next();
}

/** Charge l'élection actuellement sélectionnée par l'admin ("élection de travail"). */
async function chargerElectionDeTravail(req, res, next) {
	if (!req.session.adminElectionId) return res.redirect("/admin/elections");
	const election = await adminService.getElection(req.session.adminElectionId);
	if (!election) {
		req.session.adminElectionId = null;
		return res.redirect("/admin/elections");
	}
	req.electionTravail = election;
	next();
}

// --- Premier démarrage : créer le tout premier compte admin depuis l'écran ---
router.get("/setup", async (req, res) => {
	const nbAdmins = await adminService.compterAdmins();
	if (nbAdmins > 0) return res.redirect("/admin/login");
	res.render("admin/setup", {erreur: null});
});

router.post("/setup", async (req, res) => {
	const nbAdmins = await adminService.compterAdmins();
	if (nbAdmins > 0) return res.redirect("/admin/login");

	const {identifiant, motDePasse, motDePasseConfirmation} = req.body;
	if (!identifiant || !motDePasse || motDePasse.length < 8) {
		return res.render("admin/setup", {erreur: "Identifiant requis et mot de passe d'au moins 8 caractères."});
	}
	if (motDePasse !== motDePasseConfirmation) {
		return res.render("admin/setup", {erreur: "Les deux mots de passe ne correspondent pas."});
	}

	await adminService.creerAdmin(identifiant.trim(), motDePasse);
	res.redirect("/admin/login");
});

router.get("/login", async (req, res) => {
	if (req.session.adminId) return res.redirect("/admin/elections");
	const nbAdmins = await adminService.compterAdmins();
	if (nbAdmins === 0) return res.redirect("/admin/setup");
	res.render("admin/login", {erreur: null});
});

router.post("/login", async (req, res) => {
	const {identifiant, motDePasse} = req.body;
	const resultat = await adminService.authentifierAdmin(identifiant, motDePasse);
	if (!resultat.succes) {
		return res.render("admin/login", {erreur: "Identifiant ou mot de passe incorrect."});
	}
	req.session.adminId = resultat.admin.id;
	req.session.adminNom = resultat.admin.identifiant;
	res.redirect("/admin/elections");
});

router.post("/logout", requireAdmin, (req, res) => {
	req.session.destroy(() => res.redirect("/admin/login"));
});

router.use(requireAdmin);

// --- Comptes administrateur ---
router.get("/comptes", async (req, res) => {
	res.render("admin/comptes", {admins: await adminService.listerAdmins(), adminNom: req.session.adminNom, erreur: null});
});

router.post("/comptes", async (req, res) => {
	const {identifiant, motDePasse} = req.body;
	if (!identifiant || !motDePasse || motDePasse.length < 8) {
		return res.render("admin/comptes", {
			admins: await adminService.listerAdmins(),
			adminNom: req.session.adminNom,
			erreur: "Identifiant requis et mot de passe d'au moins 8 caractères.",
		});
	}
	await adminService.creerAdmin(identifiant.trim(), motDePasse);
	res.redirect("/admin/comptes");
});

// --- Élections (plusieurs simultanément) ---
router.get("/elections", async (req, res) => {
	res.render("admin/elections", {
		elections: await adminService.listerElections(),
		electionTravailId: req.session.adminElectionId || null,
		adminNom: req.session.adminNom,
	});
});

router.post("/elections", async (req, res) => {
	const election = await adminService.creerElection(req.body.titre);
	req.session.adminElectionId = election.id;
	res.redirect("/admin/election");
});

router.post("/elections/:id/travailler", async (req, res) => {
	req.session.adminElectionId = parseInt(req.params.id, 10);
	res.redirect("/admin/election");
});

router.post("/elections/:id/titre", async (req, res) => {
	await adminService.modifierElectionTitre(req.params.id, req.body.titre);
	res.redirect("/admin/elections");
});

router.post("/elections/:id/archiver", async (req, res) => {
	await adminService.archiverElection(req.params.id);
	res.redirect("/admin/elections");
});

router.post("/elections/:id/reactiver", async (req, res) => {
	await adminService.reactiverElection(req.params.id);
	res.redirect("/admin/elections");
});

router.post("/tours/:id", chargerElectionDeTravail, async (req, res) => {
	await adminService.modifierTour(req.params.id, req.body);
	res.redirect("/admin/election");
});

// --- Élection de travail / Tours ---
router.get("/election", chargerElectionDeTravail, async (req, res) => {
	const election = req.electionTravail;
	const tours = await adminService.listerTours(election.id);
	const tourActif = await adminService.getTourActif(election.id);
	const candidats = await adminService.listerCandidats(election.id);
	const candidatsDuTourActif = tourActif ? await adminService.listerCandidatsDuTour(tourActif.id) : [];

	res.render("admin/election", {
		election, tours, tourActif, candidats, candidatsDuTourActif,
		adminNom: req.session.adminNom, erreur: null,
	});
});

router.post("/election/titre", chargerElectionDeTravail, async (req, res) => {
	await adminService.modifierElectionTitre(req.electionTravail.id, req.body.titre);
	res.redirect("/admin/election");
});

router.post("/election/tour-actif", chargerElectionDeTravail, async (req, res) => {
	await adminService.modifierTourActif(req.electionTravail.id, req.body);
	res.redirect("/admin/election");
});

router.post("/election/creer-tour1", chargerElectionDeTravail, async (req, res) => {
	await adminService.creerTour1SiAbsent(req.electionTravail.id, {
		dateOuverture: req.body.dateOuverture,
		dateCloture: req.body.dateCloture,
	});
	res.redirect("/admin/election");
});

router.post("/election/nouveau-tour", chargerElectionDeTravail, async (req, res) => {
	let candidatIds = req.body.candidatIds || [];
	if (!Array.isArray(candidatIds)) candidatIds = [candidatIds];
	candidatIds = candidatIds.map((id) => parseInt(id, 10));

	await adminService.lancerNouveauTour(req.electionTravail.id, {
		dateOuverture: req.body.dateOuverture,
		dateCloture: req.body.dateCloture,
		candidatIds,
	});
	res.redirect("/admin/election");
});

// --- Candidats ---
router.get("/candidats", chargerElectionDeTravail, async (req, res) => {
	res.render("admin/candidats", {
		candidats: await adminService.listerCandidats(req.electionTravail.id),
		election: req.electionTravail,
		adminNom: req.session.adminNom,
	});
});

router.post("/candidats", chargerElectionDeTravail, async (req, res) => {
	await adminService.ajouterCandidat(req.electionTravail.id, req.body);
	res.redirect("/admin/candidats");
});

router.post("/candidats/:id/basculer", chargerElectionDeTravail, async (req, res) => {
	await adminService.basculerCandidat(req.params.id);
	res.redirect("/admin/candidats");
});

router.post("/candidats/:id", chargerElectionDeTravail, async (req, res) => {
	await adminService.modifierCandidat(req.params.id, req.body);
	res.redirect("/admin/candidats");
});

// --- Électeurs ---
router.get("/electeurs", chargerElectionDeTravail, async (req, res) => {
	const lienVote = `${req.protocol}://${req.get("host")}/e/${req.electionTravail.slug}/login`;
	const electeurs = await adminService.listerElecteurs(req.electionTravail.id);
	res.render("admin/electeurs", {
		electeurs: electeurs.map((e) => ({
			...e,
			lienWhatsapp: adminService.genererLienWhatsapp(e, req.electionTravail.titre, lienVote),
		})),
		election: req.electionTravail,
		adminNom: req.session.adminNom,
	});
});

router.post("/electeurs", chargerElectionDeTravail, async (req, res) => {
	await adminService.ajouterElecteur(req.electionTravail.id, req.body);
	res.redirect("/admin/electeurs");
});

router.post("/electeurs/:id/message-envoye", async (req, res) => {
	await adminService.marquerMessageEnvoye(req.params.id);
	res.sendStatus(204);
});

router.post("/electeurs/import-csv", chargerElectionDeTravail, upload.single("fichierCsv"), async (req, res) => {
	if (!req.file) return res.redirect("/admin/electeurs");
	const contenu = req.file.buffer.toString("utf-8");
	const {compteur} = await adminService.importerElecteursCSV(req.electionTravail.id, contenu);
	res.redirect(`/admin/electeurs?importes=${compteur}`);
});

router.get("/electeurs/messages.txt", chargerElectionDeTravail, async (req, res) => {
	const electeurs = await adminService.listerElecteurs(req.electionTravail.id);
	const lienVote = `${req.protocol}://${req.get("host")}/e/${req.electionTravail.slug}/login`;

	const messages = electeurs.map((e) => `━━━━━━━━━━━━━━━━━━━━
Destinataire : ${e.prenom} ${e.nom}${e.telephone ? " (" + e.telephone + ")" : " (aucun numéro)"}

${adminService.genererMessageElecteur(e, req.electionTravail.titre, lienVote)}
`);

	res.setHeader("Content-Type", "text/plain; charset=utf-8");
	res.setHeader("Content-Disposition", "attachment; filename=messages-electeurs.txt");
	res.send(messages.join("\n"));
});

router.post("/electeurs/:id", chargerElectionDeTravail, async (req, res) => {
	await adminService.modifierElecteur(req.params.id, req.body);
	res.redirect("/admin/electeurs");
});

// --- Résultats ---
router.get("/resultats", chargerElectionDeTravail, async (req, res) => {
	const electionId = req.query.election ? parseInt(req.query.election, 10) : req.electionTravail.id;
	const election = req.query.election ? await adminService.getElection(electionId) : req.electionTravail;

	const tours = await adminService.listerTours(electionId);
	const tourDemande = req.query.tour ? parseInt(req.query.tour, 10) : null;
	const tour = tourDemande ? tours.find((t) => t.numero === tourDemande) : tours[tours.length - 1];

	res.render("admin/resultats", {
		...(await voteService.resultats(tour ? tour.id : null)),
		tours,
		tourAffiche: tour,
		election: req.electionTravail,
		electionAffichee: election,
		adminNom: req.session.adminNom,
	});
});

router.post("/resultats/reinitialiser-tout", chargerElectionDeTravail, async (req, res) => {
	await adminService.reinitialiserScrutinComplet(req.electionTravail.id);
	res.redirect("/admin/resultats");
});

router.get("/pv", chargerElectionDeTravail, async (req, res) => {
	const pdfService = require("../services/pdfService");
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", "attachment; filename=proces-verbal-scrutin.pdf");
	await pdfService.genererPV(res, req.electionTravail.id);
});

module.exports = router;
