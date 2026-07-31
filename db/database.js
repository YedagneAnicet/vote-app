const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "vote.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS election (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    titre TEXT NOT NULL,
    dateOuverture TEXT NOT NULL,
    dateCloture TEXT NOT NULL,
    statut TEXT NOT NULL DEFAULT 'ouverte'
  );

  CREATE TABLE IF NOT EXISTS electeurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numeroLicence TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    dateNaissance TEXT,
    telephone TEXT,
    codeAcces TEXT NOT NULL UNIQUE,
    aVote INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS candidats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    club TEXT,
    photoUrl TEXT,
    valide INTEGER NOT NULL DEFAULT 1
  );

  -- Bulletins : AUCUNE référence à l'électeur (anonymat du choix exprimé)
  -- candidatId est NULL pour un vote blanc (type = 'blanc')
  CREATE TABLE IF NOT EXISTS bulletins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidatId INTEGER REFERENCES candidats(id),
    type TEXT NOT NULL DEFAULT 'candidat' CHECK (type IN ('candidat', 'blanc')),
    horodatage TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifiant TEXT NOT NULL UNIQUE,
    motDePasseHache TEXT NOT NULL
  );

  -- Journal de vote : garantit l'UNICITE (un électeur = une seule ligne), sans lien avec le choix
  CREATE TABLE IF NOT EXISTS journal_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    electeurId INTEGER NOT NULL UNIQUE REFERENCES electeurs(id),
    horodatage TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
