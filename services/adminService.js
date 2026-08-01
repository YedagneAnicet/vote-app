const bcrypt = require("bcryptjs");
const { db } = require("../db/database");

async function authentifierAdmin(identifiant, motDePasse) {
  const r = await db.execute({
    sql: "SELECT * FROM admins WHERE identifiant = ?",
    args: [(identifiant || "").trim()],
  });
  const admin = r.rows[0];
  if (!admin) return { succes: false };
  const valide = bcrypt.compareSync(motDePasse || "", admin.motDePasseHache);
  if (!valide) return { succes: false };
  return { succes: true, admin };
}

// --- Élection ---
async function getElectionAdmin() {
  const r = await db.execute("SELECT * FROM election WHERE id = 1");
  return r.rows[0] || null;
}

async function modifierElection({ titre, dateOuverture, dateCloture, statut }) {
  await db.execute({
    sql: `INSERT INTO election (id, titre, dateOuverture, dateCloture, statut)
          VALUES (1, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            titre = excluded.titre,
            dateOuverture = excluded.dateOuverture,
            dateCloture = excluded.dateCloture,
            statut = excluded.statut`,
    args: [
      (titre || "").trim(),
      (dateOuverture || "").trim(),
      (dateCloture || "").trim(),
      statut === "fermee" ? "fermee" : "ouverte",
    ],
  });
}

// --- Candidats ---
async function listerCandidats() {
  const r = await db.execute("SELECT * FROM candidats ORDER BY valide DESC, nom ASC");
  return r.rows;
}

async function ajouterCandidat({ nom, prenom, club, photoUrl }) {
  await db.execute({
    sql: "INSERT INTO candidats (nom, prenom, club, photoUrl, valide) VALUES (?, ?, ?, ?, 1)",
    args: [(nom || "").trim().toUpperCase(), (prenom || "").trim(), (club || "").trim(), (photoUrl || "").trim()],
  });
}

async function basculerCandidat(id) {
  await db.execute({ sql: "UPDATE candidats SET valide = 1 - valide WHERE id = ?", args: [id] });
}

async function modifierCandidat(id, { nom, prenom, club, photoUrl }) {
  await db.execute({
    sql: "UPDATE candidats SET nom = ?, prenom = ?, club = ?, photoUrl = ? WHERE id = ?",
    args: [(nom || "").trim().toUpperCase(), (prenom || "").trim(), (club || "").trim(), (photoUrl || "").trim(), id],
  });
}

// --- Électeurs ---
async function listerElecteurs() {
  const r = await db.execute(
    "SELECT id, numeroLicence, nom, prenom, telephone, codeAcces, aVote FROM electeurs ORDER BY nom ASC, prenom ASC"
  );
  return r.rows;
}

async function genererCodeUnique() {
  let code;
  let existe = true;
  while (existe) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const r = await db.execute({ sql: "SELECT 1 FROM electeurs WHERE codeAcces = ?", args: [code] });
    existe = r.rows.length > 0;
  }
  return code;
}

async function ajouterElecteur({ numeroLicence, nom, prenom, dateNaissance, telephone }) {
  const code = await genererCodeUnique();
  await db.execute({
    sql: `INSERT INTO electeurs (numeroLicence, nom, prenom, dateNaissance, telephone, codeAcces)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      (numeroLicence || "").trim(),
      (nom || "").trim().toUpperCase(),
      (prenom || "").trim(),
      (dateNaissance || "").trim(),
      (telephone || "").trim(),
      code,
    ],
  });
  return code;
}

async function modifierElecteur(id, { numeroLicence, nom, prenom, dateNaissance, telephone }) {
  await db.execute({
    sql: `UPDATE electeurs SET numeroLicence = ?, nom = ?, prenom = ?, dateNaissance = ?, telephone = ? WHERE id = ?`,
    args: [
      (numeroLicence || "").trim(),
      (nom || "").trim().toUpperCase(),
      (prenom || "").trim(),
      (dateNaissance || "").trim(),
      (telephone || "").trim(),
      id,
    ],
  });
}

async function reinitialiserScrutinComplet() {
  await db.execute("DELETE FROM bulletins");
  await db.execute("DELETE FROM journal_votes");
  await db.execute("UPDATE electeurs SET aVote = 0");
}

module.exports = {
  authentifierAdmin,
  getElectionAdmin,
  modifierElection,
  listerCandidats,
  ajouterCandidat,
  basculerCandidat,
  modifierCandidat,
  listerElecteurs,
  ajouterElecteur,
  modifierElecteur,
  reinitialiserScrutinComplet,
};
