# Plateforme de vote

Application web (Node.js + Express + Turso) permettant de gérer **plusieurs élections en ligne, simultanément**, avec suivi des tours de scrutin, génération des codes d'accès électeurs, résultats en direct et export du procès-verbal en PDF.

Tout se gère depuis un dashboard admin, **aucun script en ligne de commande n'est nécessaire**, y compris pour la toute première configuration.

---

## Sommaire

1. [Fonctionnement en résumé](#fonctionnement-en-résumé)
2. [Installation locale](#installation-locale)
3. [Prise en main depuis le dashboard](#prise-en-main-depuis-le-dashboard)
4. [Élections multiples et simultanées](#élections-multiples-et-simultanées)
5. [Résultats publics en direct](#résultats-publics-en-direct)
6. [Sécurité](#sécurité--points-essentiels-avant-louverture-dun-scrutin)
7. [Déploiement (Render + Turso)](#déploiement-render--turso)
8. [Structure du projet](#structure-du-projet)
9. [Modèle de données](#modèle-de-données-résumé)

---

## Fonctionnement en résumé

| Aspect | Détail |
|---|---|
| **Multi-élections** | Chaque élection a sa propre URL publique (`/e/<slug>/login`), ses propres candidats et ses propres électeurs. Plusieurs élections peuvent tourner en même temps sans interférence. |
| **Multi-tours** | Une élection peut avoir plusieurs tours (1er, 2e...), chacun avec ses candidats qualifiés, ses dates et ses résultats propres. |
| **Connexion électeur** | Code d'accès personnel généré automatiquement, à transmettre par SMS/WhatsApp avant le scrutin. |
| **Vote** | Choix d'un candidat (ou vote blanc), puis validation. La session est détruite immédiatement après le vote. |
| **Unicité du vote** | Garantie **par tour** par une contrainte UNIQUE en base (`journal_votes`) + une transaction atomique. Un double clic ou une reconnexion ne permet jamais un second vote sur le même tour. |
| **Anonymat** | Le bulletin exprimé n'est **jamais lié** à l'identité de l'électeur : une table séparée retient uniquement *qui* a voté, jamais *pour qui*. |
| **Persistance** | Données stockées sur **Turso** (SQLite hébergé), indépendant du serveur applicatif : aucune perte en cas de redémarrage. |

---

## Installation locale

```bash
npm install
cp .env.example .env
node server.js
```

Ouvrez `http://localhost:3000/admin/setup`. Cette page ne s'affiche que tant qu'aucun compte administrateur n'existe. Créez votre premier compte (identifiant + mot de passe), vous êtes ensuite redirigé vers la connexion.

---

## Prise en main depuis le dashboard

Une fois connecté à `/admin` :

### 1. Créer une élection
Onglet **Élections** → titre de l'élection. Un lien public unique est généré automatiquement (ex. `/e/election-du-tresorier/login`).

### 2. Ajouter les candidats
Onglet **Candidatures** → nom, prénom, club, photo.

### 3. Ajouter les électeurs
Onglet **Électeurs** → deux options :
- Ajout manuel, un par un
- **Import CSV** (bouton dédié), avec les colonnes :
  ```
  numeroLicence,nom,prenom,dateNaissance,telephone
  ```

Un code d'accès à 6 chiffres est généré automatiquement pour chaque électeur. Le bouton **Messages WhatsApp** télécharge un fichier texte prêt à copier-coller : un message personnalisé par électeur, avec son code et le lien de vote.

### 4. Configurer les tours
Onglet **Élection** → créez le tour 1 (dates d'ouverture/clôture). Une fois le scrutin terminé, un bouton permet de **lancer un nouveau tour** en sélectionnant les candidats qualifiés.

### 5. Suivre les résultats
Onglet **Résultats** → participation en direct, classement par tour, téléchargement du **procès-verbal en PDF** (bouton 📄 PV).

### 6. Gérer les accès
Onglet **Comptes** → ajoutez d'autres comptes administrateur si besoin (toute la commission peut avoir son propre accès).

---

## Élections multiples et simultanées

Rien n'empêche d'avoir plusieurs élections ouvertes en même temps (ex. *Président des Athlètes* + *Trésorier*). Chacune dispose de :

- son propre lien public (`/e/<slug>/...`)
- ses propres candidats et électeurs (aucun partage entre élections)
- ses propres codes d'accès (un code n'est valable que pour l'élection à laquelle il appartient)

La page d'accueil publique (`/`) liste automatiquement toutes les élections actuellement ouvertes.

Une élection peut être **archivée** (bouton dans l'onglet Élections) une fois terminée. Ses résultats et son PV restent consultables indéfiniment, elle disparaît juste de la page d'accueil publique.

---

## Résultats publics en direct

**URL** : `/e/<slug>/tendances`, page publique, sans connexion.

- **Pendant le vote** : affiche uniquement « le vote est en cours », pour ne pas influencer les électeurs qui n'ont pas encore voté.
- **Après clôture** : affiche un graphique de l'évolution des votes dans le temps, ainsi que le classement final.

---

## Sécurité : points essentiels avant l'ouverture d'un scrutin

- [ ] Changez `SESSION_SECRET` dans `.env` / variables d'environnement (valeur aléatoire longue, jamais celle de l'exemple).
- [ ] Servez l'application uniquement en HTTPS.
- [ ] Ne partagez jamais le fichier de messages WhatsApp publiquement (il contient les codes d'accès individuels) : un message par électeur, en privé.
- [ ] Le compte administrateur donne accès à **toutes** les élections : n'en créez que pour les personnes de confiance de la commission électorale.

---

## Déploiement (Render + Turso)

### 1. Créer la base Turso
Base de données persistante, gratuite, sans carte bancaire.
- Créez une base sur [turso.tech](https://turso.tech)
- Récupérez l'URL (`libsql://...`) et un jeton d'accès

### 2. Créer le service Render
Hébergement gratuit, à partir de votre dépôt Git.
- **Build Command** : `npm install`
- **Start Command** : `npm start`

### 3. Configurer les variables d'environnement
Dans Render, définissez :

| Variable | Valeur |
|---|---|
| `SESSION_SECRET` | Chaîne aléatoire longue |
| `TURSO_DATABASE_URL` | URL fournie par Turso |
| `TURSO_AUTH_TOKEN` | Jeton fourni par Turso |

### 4. Premier lancement
Ouvrez `https://votre-app.onrender.com/admin/setup` pour créer votre compte administrateur, puis configurez vos élections depuis le dashboard.

---

## Structure du projet

```
vote/
├── server.js                    # point d'entrée Express
├── db/
│   └── database.js              # connexion Turso/libSQL + schéma
├── services/
│   ├── voteService.js           # logique métier publique (auth, vote, résultats)
│   ├── adminService.js          # logique métier admin (élections, tours, candidats, électeurs)
│   └── pdfService.js            # génération du procès-verbal PDF
├── routes/
│   ├── vote.js                  # routes publiques (accueil, /e/:slug/...)
│   └── admin.js                 # routes du dashboard admin
├── views/                       # pages EJS publiques (login, vote, tendances...)
│   └── admin/                   # pages EJS du dashboard admin
└── public/
    └── css/style.css            # style
```

---

## Modèle de données (résumé)

| Table | Rôle |
|---|---|
| `elections` | Une ligne par élection, avec son `slug` unique |
| `candidats`, `electeurs` | Propres à une élection (`electionId`) |
| `tours` | Les rounds de vote d'une élection (`electionId`, `numero`) |
| `candidats_tours` | Quels candidats sont qualifiés pour quel tour |
| `bulletins` | Les votes exprimés, **anonymes** (aucune référence à l'électeur) |
| `journal_votes` | Qui a voté à quel tour (`UNIQUE(tourId, electeurId)`), sans lien avec le choix exprimé |
| `admins` | Comptes du dashboard |