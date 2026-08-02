/**
 * Génère un message WhatsApp personnalisé pour chaque électeur, prêt à copier-coller
 * (ou à envoyer via WhatsApp Business API si vous en avez un plus tard).
 *
 * Usage : node scripts/generer-messages.js scripts/codes-generes.csv
 *
 * Produit un fichier messages-electeurs.txt à côté du fichier source.
 */
const fs = require("fs");
const path = require("path");

const fichier = process.argv[2];
if (!fichier) {
	console.error("Usage : node scripts/generer-messages.js chemin/vers/codes-generes.csv");
	process.exit(1);
}

const LIEN_VOTE = "https://vote-app-tsmr.onrender.com/login";
const DATE_VOTE = "dimanche 2 août, de 9h00 à 19h00";

const contenu = fs.readFileSync(fichier, "utf-8").trim().split("\n");
const entetes = contenu[0].split(",").map((h) => h.trim());
const lignes = contenu.slice(1);

const messages = lignes
		.filter((l) => l.trim())
		.map((ligne) => {
			const valeurs = ligne.split(",").map((v) => v.trim());
			const d = {};
			entetes.forEach((h, i) => (d[h] = valeurs[i] || ""));

			return `━━━━━━━━━━━━━━━━━━━━
Destinataire : ${d.prenom} ${d.nom}${d.telephone ? " — " + d.telephone : " — ⚠️ AUCUN NUMERO"}

Bonjour ${d.prenom},
Voici votre code d'accès personnel pour voter à l'élection Président(e) des Athlètes :
🔑 Code : ${d.codeAcces}
📅 Vote ${DATE_VOTE}
🔗 Lien pour voter : ${LIEN_VOTE}
Ce code est personnel et à usage unique — ne le partagez avec personne. Il vous suffit d'entrer ce code sur la page pour accéder au vote.
Merci pour votre participation !
`;
		});

const cheminSortie = path.join(path.dirname(fichier), "messages-electeurs.txt");
fs.writeFileSync(cheminSortie, messages.join("\n"));

console.log(`${messages.length} message(s) généré(s) dans : ${cheminSortie}`);
console.log("Copiez-collez chaque message dans la conversation WhatsApp correspondante.");