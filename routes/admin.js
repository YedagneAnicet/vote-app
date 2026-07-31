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
  res.render("admin/login", { erreur: null });
});

router.post("/login", (req, res) => {
  const { identifiant, motDePasse } = req.body;
  const resultat = adminService.authentifierAdmin(identifiant, motDePasse);
  if (!resultat.succes) {
    return res.render("admin/login", { erreur: "Identifiant ou mot de passe incorrect." });
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
router.get("/election", (req, res) => {
	res.render("admin/election", { election: adminService.getElectionAdmin(), adminNom: req.session.adminNom, erreur: null });
});

router.post("/election", (req, res) => {
	adminService.modifierElection(req.body);
	res.redirect("/admin/election");
});

// --- Candidats ---
router.get("/candidats", (req, res) => {
  res.render("admin/candidats", { candidats: adminService.listerCandidats(), adminNom: req.session.adminNom });
});

router.post("/candidats", (req, res) => {
  adminService.ajouterCandidat(req.body);
  res.redirect("/admin/candidats");
});

router.post("/candidats/:id/basculer", (req, res) => {
  adminService.basculerCandidat(req.params.id);
  res.redirect("/admin/candidats");
});

router.post("/candidats/:id", (req, res) => {
  adminService.modifierCandidat(req.params.id, req.body);
  res.redirect("/admin/candidats");
});

// --- Électeurs ---
router.get("/electeurs", (req, res) => {
	res.render("admin/electeurs", { electeurs: adminService.listerElecteurs(), adminNom: req.session.adminNom });
});

router.post("/electeurs", (req, res) => {
	adminService.ajouterElecteur(req.body);
	res.redirect("/admin/electeurs");
});

router.post("/electeurs/:id", (req, res) => {
	adminService.modifierElecteur(req.params.id, req.body);
	res.redirect("/admin/electeurs");
});

// --- Résultats ---
router.get("/resultats", (req, res) => {
  res.render("admin/resultats", { ...voteService.resultats(), adminNom: req.session.adminNom });
});

router.post("/resultats/reinitialiser-tout", (req, res) => {
	adminService.reinitialiserScrutinComplet();
	res.redirect("/admin/resultats");
});

module.exports = router;
