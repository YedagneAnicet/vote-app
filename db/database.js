const {createClient} = require("@libsql/client");
const path = require("path");

// En production (Render + Turso) : définissez TURSO_DATABASE_URL et TURSO_AUTH_TOKEN
// dans les variables d'environnement
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient(authToken ? {url, authToken} : {url});

async function initSchema() {
	const statements = [
		`CREATE TABLE IF NOT EXISTS election
         (
             id            INTEGER PRIMARY KEY CHECK (id = 1),
             titre         TEXT NOT NULL,
             dateOuverture TEXT NOT NULL,
             dateCloture   TEXT NOT NULL,
             statut        TEXT NOT NULL DEFAULT 'ouverte'
         )`,
		`CREATE TABLE IF NOT EXISTS admins
         (
             id              INTEGER PRIMARY KEY AUTOINCREMENT,
             identifiant     TEXT NOT NULL UNIQUE,
             motDePasseHache TEXT NOT NULL
         )`,
		`CREATE TABLE IF NOT EXISTS electeurs
         (
             id            INTEGER PRIMARY KEY AUTOINCREMENT,
             numeroLicence TEXT    NOT NULL UNIQUE,
             nom           TEXT    NOT NULL,
             prenom        TEXT    NOT NULL,
             dateNaissance TEXT,
             telephone     TEXT,
             codeAcces     TEXT    NOT NULL UNIQUE,
             aVote         INTEGER NOT NULL DEFAULT 0
         )`,
		`CREATE TABLE IF NOT EXISTS candidats
         (
             id       INTEGER PRIMARY KEY AUTOINCREMENT,
             nom      TEXT    NOT NULL,
             prenom   TEXT    NOT NULL,
             club     TEXT,
             photoUrl TEXT,
             valide   INTEGER NOT NULL DEFAULT 1
         )`,
		`CREATE TABLE IF NOT EXISTS bulletins
         (
             id         INTEGER PRIMARY KEY AUTOINCREMENT,
             candidatId INTEGER REFERENCES candidats (id),
             type       TEXT NOT NULL DEFAULT 'candidat' CHECK (type IN ('candidat', 'blanc')),
             horodatage TEXT NOT NULL DEFAULT (datetime('now'))
         )`,
		`CREATE TABLE IF NOT EXISTS journal_votes
         (
             id         INTEGER PRIMARY KEY AUTOINCREMENT,
             electeurId INTEGER NOT NULL UNIQUE REFERENCES electeurs (id),
             horodatage TEXT    NOT NULL DEFAULT (datetime('now'))
         )`,
	];
	for (const sql of statements) {
		await db.execute(sql);
	}
}

module.exports = {db, initSchema};