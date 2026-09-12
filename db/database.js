const { createClient } = require("@libsql/client");
const path = require("path");

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, "vote.sqlite")}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!process.env.TURSO_DATABASE_URL) {
  console.log(`[db] TURSO_DATABASE_URL absent : utilisation du fichier local ${url}`);
}

const db = createClient(authToken ? { url, authToken } : { url });

async function initSchema() {
  const statements = [
    // Une "élection" = un scrutin complet (ex. Président des Athlètes 2026).
    // Une seule élection est "active" à la fois (celle utilisée par les pages publiques).
    `CREATE TABLE IF NOT EXISTS elections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      statut TEXT NOT NULL DEFAULT 'active',
      dateCreation TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifiant TEXT NOT NULL UNIQUE,
      motDePasseHache TEXT NOT NULL
    )`,
    // Électeurs propres à chaque élection
    `CREATE TABLE IF NOT EXISTS electeurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      electionId INTEGER NOT NULL REFERENCES elections(id),
      numeroLicence TEXT NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      dateNaissance TEXT,
      telephone TEXT,
      codeAcces TEXT NOT NULL,
      UNIQUE (electionId, numeroLicence),
      UNIQUE (electionId, codeAcces)
    )`,
    // Candidats propres à chaque élection
    `CREATE TABLE IF NOT EXISTS candidats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      electionId INTEGER NOT NULL REFERENCES elections(id),
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      club TEXT,
      photoUrl TEXT,
      valide INTEGER NOT NULL DEFAULT 1
    )`,
    // Un "tour" = une période de vote au sein d'une élection (1er tour, 2e tour, ...)
    `CREATE TABLE IF NOT EXISTS tours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      electionId INTEGER NOT NULL REFERENCES elections(id),
      numero INTEGER NOT NULL,
      dateOuverture TEXT NOT NULL,
      dateCloture TEXT NOT NULL,
      statut TEXT NOT NULL DEFAULT 'ouverte',
      UNIQUE (electionId, numero)
    )`,
    // Quels candidats sont éligibles pour quel tour
    `CREATE TABLE IF NOT EXISTS candidats_tours (
      tourId INTEGER NOT NULL REFERENCES tours(id),
      candidatId INTEGER NOT NULL REFERENCES candidats(id),
      PRIMARY KEY (tourId, candidatId)
    )`,
    // Bulletins : AUCUNE référence à l'électeur (anonymat du choix exprimé)
    `CREATE TABLE IF NOT EXISTS bulletins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tourId INTEGER NOT NULL REFERENCES tours(id),
      candidatId INTEGER REFERENCES candidats(id),
      type TEXT NOT NULL DEFAULT 'candidat' CHECK (type IN ('candidat', 'blanc')),
      horodatage TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // Journal de vote : un électeur ne peut voter qu'UNE FOIS PAR TOUR
    `CREATE TABLE IF NOT EXISTS journal_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tourId INTEGER NOT NULL REFERENCES tours(id),
      electeurId INTEGER NOT NULL REFERENCES electeurs(id),
      horodatage TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tourId, electeurId)
    )`,
  ];
  for (const sql of statements) {
    await db.execute(sql);
  }

  const colonnesElecteurs = await db.execute("PRAGMA table_info(electeurs)");
  const aDejaMessageEnvoye = colonnesElecteurs.rows.some((c) => c.name === "messageEnvoye");
  if (!aDejaMessageEnvoye) {
    try {
      await db.execute("ALTER TABLE electeurs ADD COLUMN messageEnvoye INTEGER NOT NULL DEFAULT 0");
    } catch (err) {
      // Deux instances démarrées en même temps (déploiement) peuvent toutes les deux
      // tenter d'ajouter la colonne : on ignore uniquement cette collision précise.
      if (!/duplicate column/i.test(err.message || "")) throw err;
    }
  }
}

module.exports = { db, initSchema };
