# Publier des articles — Directus

## Comment ça marche

Le site reste **entièrement statique**. Directus ne le sert pas : il est
interrogé au moment du build, et le résultat est du HTML déposé chez
Infomaniak. Un visiteur n'atteint jamais Directus.

```
Le client écrit dans Directus
        │  (publication)
        ▼
   webhook  ──►  GitHub Actions
                     │  lit l'API, télécharge les images,
                     │  produit les pages
                     ▼
              dépôt FTP chez Infomaniak
                     │
                     ▼
            jeanmaximehanny.fr
```

Conséquence utile : **si Directus tombe, le site continue de fonctionner**.
Seule la publication d'un nouvel article devient impossible.

Un article vit à un seul endroit — un enregistrement dans Directus. La page,
la card sur l'accueil, les liens « poursuivre la lecture », les métadonnées
Open Graph et les données structurées en sont tous déduits au build par
`scripts/generate-articles.mjs`. C'est pourquoi **le dossier `articles/` n'est
pas dans le dépôt** : il est produit à chaque construction.

## Installation

### 1. Directus sur l'hébergement Infomaniak

Dans le manager Infomaniak, section **Node.js** de l'hébergement Web :

- créer une application Node **22 ou plus** (Directus 12 l'exige) ;
- créer une base **MySQL/MariaDB** dédiée dans la section Bases de données ;
- déployer Directus, puis renseigner ses variables d'environnement :

```
SECRET=<openssl rand -base64 32>
PUBLIC_URL=https://cms.jeanmaximehanny.fr
DB_CLIENT=mysql
DB_HOST=<hôte fourni par Infomaniak>
DB_PORT=3306
DB_DATABASE=<nom de la base>
DB_USER=<utilisateur>
DB_PASSWORD=<mot de passe>
ADMIN_EMAIL=<votre adresse>
ADMIN_PASSWORD=<mot de passe fort>
```

> **Point de vigilance.** Directus dépend d'un module natif, `isolated-vm`, qui
> doit se compiler ou trouver un binaire précompilé à l'installation. Si
> `npm install` échoue là-dessus sur l'hébergement mutualisé, aucune
> configuration ne le rattrapera — il faudra passer par un serveur Cloud
> Infomaniak, ou revenir à un CMS sans base de données. **C'est le premier
> point à tester**, avant tout le reste.

`docker-compose.yml` est fourni à la racine pour le cas où Directus finirait
sur un serveur avec Docker : il monte la même chose avec PostgreSQL.

### 2. Le schéma

Créer un jeton d'administration depuis la fiche de l'utilisateur admin dans
Directus, puis, en local :

```bash
cp env.example .env      # renseigner DIRECTUS_URL
DIRECTUS_ADMIN_TOKEN=xxx npm run cms:setup
```

Crée la collection `articles` et ses treize champs, avec les libellés et les
explications que verra le client. Le script est **idempotent** : on peut le
rejouer après avoir ajouté un champ, il ne touche pas à l'existant.

### 3. Les trois articles déjà écrits

```bash
DIRECTUS_ADMIN_TOKEN=xxx npm run cms:seed
```

Téléverse les images et crée les trois articles. Également idempotent : un slug
déjà présent est ignoré.

Une fois l'injection vérifiée, `scripts/seed-articles.json` et les images
`public/img/article-1..3.webp` n'ont plus de raison d'être dans le dépôt.

### 4. Les comptes

| Compte | Rôle | Ce qu'il peut faire |
|---|---|---|
| vous | Administrateur | tout |
| le client | **Rédacteur** (à créer) | lire et écrire dans `articles`, rien d'autre |
| `build` | **Lecture seule** (à créer) | lire `articles` et les fichiers |

Le jeton statique de `build` est celui qui part dans GitHub. **Ne jamais y
mettre le jeton d'administration** : un secret GitHub compromis donnerait alors
les pleins pouvoirs sur le contenu.

### 5. Le déploiement automatique

Secrets à créer dans le dépôt GitHub (*Settings → Secrets and variables →
Actions*) :

| Secret | Valeur |
|---|---|
| `DIRECTUS_URL` | `https://cms.jeanmaximehanny.fr` |
| `DIRECTUS_TOKEN` | le jeton statique de l'utilisateur `build` |
| `FTP_SERVER` | l'hôte FTP Infomaniak |
| `FTP_USERNAME` / `FTP_PASSWORD` | les identifiants FTP |
| `FTP_TARGET_DIR` | le dossier web, souvent `/web/` |

### 6. Le webhook de publication

Dans Directus, *Paramètres → Flows*, créer un flux :

- **déclencheur** : Event Hook, `items.create` et `items.update` sur `articles` ;
- **opération** : Webhook — `POST` sur
  `https://api.github.com/repos/demotierromainas-stack/site-client-personalbrand/dispatches`
  avec les en-têtes `Authorization: Bearer <PAT GitHub>`,
  `Accept: application/vnd.github+json`, et le corps
  `{"event_type": "directus-publish"}`.

Le PAT GitHub n'a besoin que de la permission **Contents: write** sur ce dépôt.

## Au quotidien

**Le client** ouvre `cms.jeanmaximehanny.fr`, va dans *Articles*, clique `+`,
remplit le formulaire et passe le statut sur **Publié**. Son article est en
ligne une minute plus tard. Tant qu'il est en *Brouillon*, il n'existe nulle
part sur le site.

**En développement** :

```bash
npm run dev        # récupère les articles au démarrage, puis sert le site
npm run articles   # régénère les pages sans lancer Vite
```

Le contenu est figé au démarrage du serveur de dev : un article publié pendant
que `npm run dev` tourne n'apparaîtra qu'après un redémarrage.

La dernière réponse de l'API est gardée dans `.cache/articles.json`. Si Directus
est injoignable, le build local reprend ce cache **en le signalant**. En
intégration continue ce repli est refusé : mieux vaut un déploiement en échec
qu'un site publié avec un contenu périmé.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `Directus a répondu 401` | jeton révoqué, ou l'utilisateur `build` n'a plus le droit de lire |
| `Directus a répondu 403` | le rôle `build` n'a pas accès à la collection `articles` ou aux fichiers |
| `n'a pas de chapo` (ou titre, image…) | un champ obligatoire est vide dans Directus |
| Déploiement interrompu, « aucune page article » | l'API a renvoyé une liste vide — garde-fou volontaire, qui évite d'effacer les articles en ligne |
| Un article publié n'apparaît pas | statut resté sur *Brouillon*, ou date de publication dans le futur |
