const express = require("express");
const router = express.Router();
const adminService = require("../services/adminService");
const voteService = require("../services/voteService");

function requireAdmin(req, res, next) {
	if (!req.session.adminId) return res.redirect("/admin/login");
	next();
}

router.get("/login", (req, res) => {
	if (req.session.adminId) return res.redirect("/admin/candidats");
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
	res.redirect("/admin/candidats");
});

router.post("/logout", requireAdmin, (req, res) => {
	req.session.destroy(() => res.redirect("/admin/login"));
});

router.use(requireAdmin);

// --- Élection ---
router.get("/election", async (req, res) => {
	res.render("admin/election", {
		election: await adminService.getElectionAdmin(),
		adminNom: req.session.adminNom,
		erreur: null,
	});
});

router.post("/election", async (req, res) => {
	await adminService.modifierElection(req.body);
	res.redirect("/admin/election");
});

// --- Candidats ---
router.get("/candidats", async (req, res) => {
	res.render("admin/candidats", {candidats: await adminService.listerCandidats(), adminNom: req.session.adminNom});
});

router.post("/candidats", async (req, res) => {
	await adminService.ajouterCandidat(req.body);
	res.redirect("/admin/candidats");
});

router.post("/candidats/:id/basculer", async (req, res) => {
	await adminService.basculerCandidat(req.params.id);
	res.redirect("/admin/candidats");
});

router.post("/candidats/:id", async (req, res) => {
	await adminService.modifierCandidat(req.params.id, req.body);
	res.redirect("/admin/candidats");
});

// --- Électeurs ---
router.get("/electeurs", async (req, res) => {
	res.render("admin/electeurs", {electeurs: await adminService.listerElecteurs(), adminNom: req.session.adminNom});
});

router.post("/electeurs", async (req, res) => {
	await adminService.ajouterElecteur(req.body);
	res.redirect("/admin/electeurs");
});

router.post("/electeurs/:id", async (req, res) => {
	await adminService.modifierElecteur(req.params.id, req.body);
	res.redirect("/admin/electeurs");
});

// --- Résultats ---
router.get("/resultats", async (req, res) => {
	res.render("admin/resultats", {...(await voteService.resultats()), adminNom: req.session.adminNom});
});

router.post("/resultats/reinitialiser-tout", async (req, res) => {
	await adminService.reinitialiserScrutinComplet();
	res.redirect("/admin/resultats");
});

router.get("/pv", async (req, res) => {
	const pdfService = require("../services/pdfService");
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", "attachment; filename=proces-verbal-scrutin.pdf");
	await pdfService.genererPV(res);
});

module.exports = router;