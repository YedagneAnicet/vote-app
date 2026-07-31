# Plateforme de vote — Élection du/de la Président(e) des Athlètes (FIVTA)

Application web légère (Node.js + Express + SQLite) permettant à chaque électeur
de voter **une seule fois** pour élire le/la Président(e) des Athlètes.

## Fonctionnement en résumé

- Chaque électeur se connecte avec son **numéro de licence** + un **code d'accès**
  personnel (généré et à transmettre par SMS/e-mail avant le scrutin).
- Il choisit un candidat et valide : son vote est enregistré, sa session est
  détruite immédiatement après.
- L'unicité du vote est garantie par une **contrainte UNIQUE en base de données**
  sur `journal_votes.electeurId`, combinée à une **transaction atomique** : même
  en cas de double clic ou de tentative de reconnexion, un second vote est
  impossible.
- Le choix exprimé (`bulletins`) n'est **jamais lié** à l'identité de l'électeur :
  seule une table séparée (`journal_votes`) retient qui a voté, sans le choix.

## Installation locale

```bash
npm install
cp .env.example .env      # puis modifiez SESSION_SECRET et ADMIN_KEY
node scripts/init-election.js
node scripts/import-electeurs.js scripts/electeurs-exemple.csv
node server.js
```

L'application est accessible sur `http://localhost:3000`.

## Configuration de l'élection

Modifiez les candidats et les dates dans `scripts/init-election.js`, puis relancez :

```bash
node scripts/init-election.js
```

## Import des électeurs

Préparez un fichier CSV avec les colonnes :

```
numeroLicence,nom,prenom,dateNaissance,email,telephone
```

Puis lancez :

```bash
node scripts/import-electeurs.js chemin/vers/electeurs.csv
```

Un fichier `codes-generes.csv` est produit à côté du fichier source, contenant
le code d'accès de chaque électeur. **Ce fichier est confidentiel** : à utiliser
uniquement pour transmettre individuellement les codes (SMS, e-mail, ou message
privé), jamais à diffuser publiquement (ex. pas dans le groupe WhatsApp).

## Consulter les résultats

```
https://votre-domaine/admin/resultats?cle=VOTRE_ADMIN_KEY
```

`VOTRE_ADMIN_KEY` est la valeur définie dans `.env` (`ADMIN_KEY`). Gardez cette
URL strictement confidentielle.

## Déploiement sur Hostinger (hébergement Node.js infogéré)

1. Dans hPanel Hostinger, créez une application **Node.js** (offre « Node.js
   Hosting »), avec le sous-domaine souhaité (ex. `vote.fivta.net`).
2. Déployez le code du dossier `vote-fivta/` (dépôt Git ou envoi direct des
   fichiers, hors `node_modules/`).
3. Dans les paramètres de l'application, définissez les variables
   d'environnement : `SESSION_SECRET`, `ADMIN_KEY`, `PORT` (souvent imposé par
   Hostinger).
4. Définissez la commande de démarrage : `node server.js`.
5. Une fois l'application démarrée, connectez-vous en SSH ou via la console
   Hostinger pour exécuter une fois :
   ```bash
   node scripts/init-election.js
   node scripts/import-electeurs.js electeurs.csv
   ```
6. Ajoutez un enregistrement DNS (CNAME ou A) chez OVH pour pointer
   `vote.fivta.net` vers l'application Hostinger — le site principal FIVTA
   (WordPress) reste intact sur OVH.

## Sécurité — points essentiels avant l'ouverture du scrutin

- Changez impérativement `SESSION_SECRET` et `ADMIN_KEY` dans `.env` (valeurs
  aléatoires longues, jamais celles de l'exemple).
- Servez l'application uniquement en HTTPS (certificat fourni par Hostinger).
- Ne diffusez jamais `codes-generes.csv` publiquement.
- Sauvegardez le fichier `db/vote.sqlite` après la clôture du scrutin (procès-verbal).

## Structure du projet

```
vote-fivta/
├── server.js                 # point d'entrée Express
├── db/database.js            # connexion SQLite + schéma
├── services/voteService.js   # logique métier (authentification, vote, résultats)
├── routes/vote.js            # routes HTTP
├── views/                    # pages EJS (login, vote, confirmation, résultats)
├── public/css/style.css      # style
└── scripts/
    ├── init-election.js      # configure l'élection + les candidats
    └── import-electeurs.js   # importe les électeurs et génère les codes d'accès
```
