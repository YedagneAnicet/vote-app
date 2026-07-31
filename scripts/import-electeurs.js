/**
 * Importe les électeurs depuis un fichier CSV et génère un code d'accès unique pour chacun.
 * Format CSV attendu (avec en-tête) :
 *   numeroLicence,nom,prenom,dateNaissance,telephone
 *
 * Usage : node scripts/import-electeurs.js chemin/vers/electeurs.csv
 *
 * Produit un fichier codes-generes.csv à côté du fichier source, contenant
 * les codes à transmettre à chaque électeur (par SMS ou WhatsApp), à ne PAS
 * partager publiquement.
 */
const fs = require("fs");
const path = require("path");
const db = require("../db/database");

const fichier = process.argv[2];
if (!fichier) {
  console.error("Usage : node scripts/import-electeurs.js chemin/vers/electeurs.csv");
  process.exit(1);
}

function genererCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // code à 6 chiffres
}

function genererCodeUnique() {
  const existe = db.prepare("SELECT 1 FROM electeurs WHERE codeAcces = ?");
  let code;
  do {
    code = genererCode();
  } while (existe.get(code));
  return code;
}

const contenu = fs.readFileSync(fichier, "utf-8").trim().split("\n");
const entetes = contenu[0].split(",").map((h) => h.trim());
const lignes = contenu.slice(1);

const insert = db.prepare(`
  INSERT INTO electeurs (numeroLicence, nom, prenom, dateNaissance, telephone, codeAcces)
  VALUES (@numeroLicence, @nom, @prenom, @dateNaissance, @telephone, @codeAcces)
  ON CONFLICT(numeroLicence) DO UPDATE SET
    nom=excluded.nom, prenom=excluded.prenom, dateNaissance=excluded.dateNaissance,
    telephone=excluded.telephone
`);

const sorties = ["nom,prenom,telephone,codeAcces"];
let compteur = 0;

const transaction = db.transaction(() => {
  for (const ligne of lignes) {
    if (!ligne.trim()) continue;
    const valeurs = ligne.split(",").map((v) => v.trim());
    const electeur = {};
    entetes.forEach((h, i) => (electeur[h] = valeurs[i] || ""));
    electeur.codeAcces = genererCodeUnique();

    insert.run(electeur);
    sorties.push([electeur.nom, electeur.prenom, electeur.telephone, electeur.codeAcces].join(","));
    compteur++;
  }
});
transaction();

const cheminSortie = path.join(path.dirname(fichier), "codes-generes.csv");
fs.writeFileSync(cheminSortie, sorties.join("\n"));

console.log(`${compteur} électeur(s) importé(s) ou mis à jour.`);
console.log(`Codes d'accès générés dans : ${cheminSortie}`);
console.log("⚠️  Ce fichier contient des codes confidentiels : ne pas diffuser publiquement.");
