const PDFDocument = require("pdfkit");
const voteService = require("./voteService");
const adminService = require("./adminService");

const VIOLET = "#2D1B69";
const GRIS = "#635F73";
const BORDURE = "#E1DEF0";
const VERT = "#228B22";
const GRIS_CLAIR = "#F7F6FC";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
}

/**
 * Génère le PDF du procès-verbal (résultats + liste des électeurs avec statut)
 * et l'écrit directement dans le flux de réponse HTTP fourni.
 */
async function genererPV(res) {
  const election = await voteService.getElection();
  const resultats = await voteService.resultats();
  const electeurs = await adminService.listerElecteurs();

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  doc.pipe(res);

  // ─── En-tête ───
  doc
    .fontSize(9)
    .fillColor(GRIS)
    .text("COMMISSION DES ATHLETES", { align: "center" });
  doc
    .moveDown(0.3)
    .fontSize(18)
    .fillColor(VIOLET)
    .text("PROCÈS-VERBAL DU SCRUTIN", { align: "center" });
  doc
    .moveDown(0.2)
    .fontSize(11)
    .fillColor("#1a1a1a")
    .text(election ? election.titre : "Élection", { align: "center" });

  doc.moveDown(0.5);
  doc
    .fontSize(9)
    .fillColor(GRIS)
    .text(`Ouverture : ${formatDate(election?.dateOuverture)}    Clôture : ${formatDate(election?.dateCloture)}`, {
      align: "center",
    })
    .text(`Document généré le ${formatDate(new Date().toISOString())}`, { align: "center" });

  doc.moveDown(1);
  ligneSeparation(doc);

  // ─── Section 1 : Résultats ───
  titreSection(doc, "1. Résultats du scrutin");

  doc.fontSize(10).fillColor("#1a1a1a");
  const stats = [
    ["Électeurs inscrits", resultats.totalElecteurs],
    ["Votes enregistrés", resultats.totalVotants],
    ["Taux de participation", `${resultats.tauxParticipation} %`],
    ["Suffrages exprimés (hors blancs)", resultats.suffragesExprimes],
    ["Votes blancs", `${resultats.blancs} (${resultats.pourcentageBlancs} %)`],
  ];
  stats.forEach(([label, valeur]) => {
    doc.text(`${label} : `, { continued: true, indent: 10 }).fillColor(VIOLET).text(`${valeur}`, { continued: false }).fillColor("#1a1a1a");
  });

  doc.moveDown(0.8);

  // Tableau des candidats
  const candidatsAvecBlanc = [
    ...resultats.rows.map((r) => ({ nom: `${r.prenom} ${r.nom}`, voix: r.voix, pct: r.pourcentage })),
    { nom: "Votes blancs", voix: resultats.blancs, pct: resultats.pourcentageBlancs },
  ];
  tableauSimple(doc, ["Candidat", "Voix", "%"], candidatsAvecBlanc.map((c) => [c.nom, String(c.voix), `${c.pct} %`]), [280, 90, 90]);

  if (resultats.enTete && resultats.enTete.voix > 0) {
    doc.moveDown(0.6);
    doc
      .fontSize(10)
      .fillColor(VERT)
      .text(`Candidat en tête : ${resultats.enTete.prenom} ${resultats.enTete.nom} (${resultats.enTete.voix} voix, ${resultats.enTete.pourcentage} %)`);
    doc.fillColor("#1a1a1a");
  }

  doc.moveDown(1.2);
  ligneSeparation(doc);

  // ─── Section 2 : Liste des électeurs ───
  titreSection(doc, "2. Liste des électeurs et statut de vote");
  doc
    .fontSize(8.5)
    .fillColor(GRIS)
    .text("Le statut indique si l'électeur a voté ou non");
  doc.moveDown(0.5);

  const lignesElecteurs = electeurs.map((e) => [
    e.numeroLicence,
    `${e.prenom} ${e.nom}`,
    e.aVote ? "A voté" : "N'a pas voté",
  ]);
  tableauSimple(doc, ["N° Licence", "Électeur", "Statut"], lignesElecteurs, [140, 240, 90], { paginer: true, doc });

  // ─── Signatures ───
  doc.moveDown(2);
  if (doc.y > 680) doc.addPage();
  ligneSeparation(doc);
  doc.moveDown(1);
  doc.fontSize(10).fillColor("#1a1a1a");
  const yBase = doc.y;
  doc.text("Le/La Président(e) de la Commission électorale", 40, yBase, { width: 240 });
  doc.text("Signature :", 40, yBase + 50);
  doc.text("Un membre de la Commission", 320, yBase, { width: 240 });
  doc.text("Signature :", 320, yBase + 50);

  doc.end();
}

function titreSection(doc, texte) {
  doc.fontSize(13).fillColor(VIOLET).text(texte);
  doc.moveDown(0.4);
}

function ligneSeparation(doc) {
  const y = doc.y;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(BORDURE).lineWidth(1).stroke();
  doc.moveDown(0.6);
}

function tableauSimple(doc, entetes, lignes, largeurs, options = {}) {
  const xDepart = 40;
  const hauteurLigne = 20;

  function dessinerEntete() {
    let x = xDepart;
    doc.rect(xDepart, doc.y, largeurs.reduce((a, b) => a + b, 0), hauteurLigne).fill(VIOLET);
    const yTexte = doc.y + 5;
    doc.fillColor("#ffffff").fontSize(9);
    entetes.forEach((e, i) => {
      doc.text(e, x + 6, yTexte, { width: largeurs[i] - 8 });
      x += largeurs[i];
    });
    doc.y += hauteurLigne;
    doc.fillColor("#1a1a1a");
  }

  dessinerEntete();

  lignes.forEach((ligne, idx) => {
    if (options.paginer && doc.y > 760) {
      doc.addPage();
      dessinerEntete();
    }
    const y = doc.y;
    if (idx % 2 === 0) {
      doc.rect(xDepart, y, largeurs.reduce((a, b) => a + b, 0), hauteurLigne).fill(GRIS_CLAIR);
    }
    doc.fillColor("#1a1a1a").fontSize(9);
    let x = xDepart;
    ligne.forEach((valeur, i) => {
      doc.text(String(valeur), x + 6, y + 5, { width: largeurs[i] - 8 });
      x += largeurs[i];
    });
    doc.y = y + hauteurLigne;
  });

  doc.moveDown(0.5);
}

module.exports = { genererPV };
