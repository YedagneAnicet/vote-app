const PDFDocument = require("pdfkit");
const voteService = require("./voteService");
const adminService = require("./adminService");

const VIOLET = "#2D1B69";
const GRIS = "#635F73";
const BORDURE = "#E1DEF0";
const GRIS_CLAIR = "#F7F6FC";
const OR_CLAIR = "#FDF3E0";
const OR = "#D98A12";

const MARGE_X = 40;
const LARGEUR_PAGE = 555;

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

async function genererPV(res, electionId) {
  const election = await adminService.getElection(electionId);
  const tours = election ? await adminService.listerTours(election.id) : [];
  const electeurs = election ? await adminService.listerElecteurs(election.id) : [];

  const doc = new PDFDocument({ size: "A4", margin: MARGE_X });
  doc.pipe(res);

  doc.fontSize(9).fillColor(GRIS).text("FÉDÉRATION IVOIRIENNE DE TIR À L'ARC", MARGE_X, doc.y, { width: LARGEUR_PAGE, align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(18).fillColor(VIOLET).text("PROCÈS-VERBAL DU SCRUTIN", MARGE_X, doc.y, { width: LARGEUR_PAGE, align: "center" });
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor("#1a1a1a").text(election ? election.titre : "Élection", MARGE_X, doc.y, { width: LARGEUR_PAGE, align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor(GRIS).text(`Document généré le ${formatDate(new Date().toISOString())}`, MARGE_X, doc.y, { width: LARGEUR_PAGE, align: "center" });
  doc.moveDown(1);
  ligneSeparation(doc);

  for (const tour of tours) {
    const resultats = await voteService.resultats(tour.id);

    titreSection(doc, `TOUR ${tour.numero}`);
    doc.fontSize(9).fillColor(GRIS).text(
      `Ouverture : ${formatDate(tour.dateOuverture)}    Clôture : ${formatDate(tour.dateCloture)}`,
      MARGE_X, doc.y, { width: LARGEUR_PAGE }
    );
    doc.moveDown(0.5);
    doc.x = MARGE_X;

    doc.fontSize(10).fillColor("#1a1a1a");
    const stats = [
      ["Électeurs inscrits", resultats.totalElecteurs],
      ["Votes enregistrés", resultats.totalVotants],
      ["Taux de participation", `${resultats.tauxParticipation} %`],
      ["Suffrages exprimés (hors blancs)", resultats.suffragesExprimes],
      ["Votes blancs", `${resultats.blancs} (${resultats.pourcentageBlancs} %)`],
    ];
    stats.forEach(([label, valeur]) => {
      doc.text(`${label} : ${valeur}`, MARGE_X + 10, doc.y, { width: LARGEUR_PAGE - 10 });
    });
    doc.moveDown(0.6);

    if (resultats.enTete && resultats.enTete.voix > 0) {
      const texte = `Candidat en tête : ${resultats.enTete.prenom} ${resultats.enTete.nom} (${resultats.enTete.voix} voix, ${resultats.enTete.pourcentage} %)`;
      const hauteurBoite = 30;
      const y = doc.y;
      doc.roundedRect(MARGE_X, y, LARGEUR_PAGE, hauteurBoite, 6).fill(OR_CLAIR);
      doc.fontSize(10).fillColor(OR).text(texte, MARGE_X + 12, y + 9, { width: LARGEUR_PAGE - 24 });
      doc.y = y + hauteurBoite + 12;
      doc.x = MARGE_X;
    }

    const candidatsAvecBlanc = [
      ...resultats.rows.map((r) => ({ nom: `${r.prenom} ${r.nom}`, voix: r.voix, pct: r.pourcentage })),
      { nom: "Votes blancs", voix: resultats.blancs, pct: resultats.pourcentageBlancs },
    ];
    tableauSimple(doc, ["Candidat", "Voix", "%"], candidatsAvecBlanc.map((c) => [c.nom, String(c.voix), `${c.pct} %`]), [280, 90, 90]);

    doc.x = MARGE_X;
    doc.moveDown(1);
    ligneSeparation(doc);
  }

  titreSection(doc, "Liste des électeurs et statut de vote (tour actif)");
  doc.fontSize(8.5).fillColor(GRIS).text(
    "Le statut indique uniquement si l'électeur a voté ou non au tour en cours. Le choix exprimé reste anonyme.",
    MARGE_X, doc.y, { width: LARGEUR_PAGE }
  );
  doc.moveDown(0.5);
  doc.x = MARGE_X;

  const lignesElecteurs = electeurs.map((e) => [e.numeroLicence, `${e.prenom} ${e.nom}`, e.aVote ? "A voté" : "N'a pas voté"]);
  tableauSimple(doc, ["N° Licence", "Électeur", "Statut"], lignesElecteurs, [140, 240, 90], { paginer: true });

  doc.x = MARGE_X;
  doc.moveDown(2);
  if (doc.y > 680) doc.addPage();
  ligneSeparation(doc);
  doc.moveDown(1);
  doc.fontSize(10).fillColor("#1a1a1a");
  const yBase = doc.y;
  doc.text("Le/La Président(e) de la Commission électorale", MARGE_X, yBase, { width: 240 });
  doc.text("Signature :", MARGE_X, yBase + 50);
  doc.text("Un membre de la Commission", 320, yBase, { width: 240 });
  doc.text("Signature :", 320, yBase + 50);

  doc.end();
}

function titreSection(doc, texte) {
  doc.fontSize(13).fillColor(VIOLET).text(texte, MARGE_X, doc.y, { width: LARGEUR_PAGE });
  doc.moveDown(0.4);
  doc.x = MARGE_X;
}

function ligneSeparation(doc) {
  const y = doc.y;
  doc.moveTo(MARGE_X, y).lineTo(MARGE_X + LARGEUR_PAGE, y).strokeColor(BORDURE).lineWidth(1).stroke();
  doc.moveDown(0.6);
  doc.x = MARGE_X;
}

function tableauSimple(doc, entetes, lignes, largeurs, options = {}) {
  const hauteurLigne = 20;
  function dessinerEntete() {
    let x = MARGE_X;
    doc.roundedRect(MARGE_X, doc.y, largeurs.reduce((a, b) => a + b, 0), hauteurLigne, 0).fill(VIOLET);
    const yTexte = doc.y + 5;
    doc.fillColor("#ffffff").fontSize(9);
    entetes.forEach((e, i) => { doc.text(e, x + 6, yTexte, { width: largeurs[i] - 8 }); x += largeurs[i]; });
    doc.y += hauteurLigne; doc.x = MARGE_X; doc.fillColor("#1a1a1a");
  }
  dessinerEntete();
  lignes.forEach((ligne, idx) => {
    if (options.paginer && doc.y > 760) { doc.addPage(); doc.x = MARGE_X; dessinerEntete(); }
    const y = doc.y;
    if (idx % 2 === 0) doc.rect(MARGE_X, y, largeurs.reduce((a, b) => a + b, 0), hauteurLigne).fill(GRIS_CLAIR);
    doc.fillColor("#1a1a1a").fontSize(9);
    let x = MARGE_X;
    ligne.forEach((valeur, i) => { doc.text(String(valeur), x + 6, y + 5, { width: largeurs[i] - 8 }); x += largeurs[i]; });
    doc.y = y + hauteurLigne; doc.x = MARGE_X;
  });
  doc.moveDown(0.5); doc.x = MARGE_X;
}

module.exports = { genererPV };
