# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Le projet est intégralement en français : commentaires, documentation, noms de commits.
S'y tenir.

## Commandes

```bash
npm run dev        # serveur Vite (port 5173), ouvre le navigateur
npm run build      # produit dist/ — interroge Directus au passage
npm run preview    # sert dist/ pour vérifier le build

npm run articles   # régénère articles/ sans lancer Vite
npm run shots      # captures Playwright des 7 pages → shots/ (voir plus bas)
npm run sequence -- <fichier.gif|mp4>   # ré-extrait la séquence du hero (ImageMagick requis)

# CMS, avec un jeton d'admin Directus (voir CMS.md)
DIRECTUS_ADMIN_TOKEN=xxx npm run cms:setup   # crée la collection articles (idempotent)
DIRECTUS_ADMIN_TOKEN=xxx npm run cms:seed    # injecte les 3 articles d'origine
DIRECTUS_ADMIN_TOKEN=xxx npm run cms:roles   # crée les rôles rédacteur / build
DIRECTUS_ADMIN_TOKEN=xxx npm run cms:flow    # crée le webhook de publication
```

**Pas de tests automatisés.** La vérification passe par `npm run shots`, qui charge
chaque page dans Chromium, capture plusieurs positions de scroll et remonte les
erreurs console. `npm run shots -- <url> <page>` cible une seule page (`accueil`,
`procuve`, …) ou une autre origine. Ce que le script ne juge pas : fluidité du smooth
scroll, sensation de la parallaxe, réaction au curseur — ça se teste en vrai.

Prérequis : Node 24 (aligné sur la CI), `.env` copié depuis `env.example`.

## Architecture

Site vitrine statique, multi-pages, sans framework front. Vite + Tailwind v4 + GSAP/ScrollTrigger + Lenis.

**Le contenu vient de Directus au moment du build, jamais à l'exécution.** Un visiteur
n'atteint jamais le CMS ; s'il tombe, le site en ligne continue de fonctionner. La chaîne :
le client publie dans Directus → webhook → GitHub Actions → `npm run build` → rsync SSH
chez Infomaniak.

Trois mécanismes structurent le build, tous dans [vite.config.js](vite.config.js) :

1. **Partials HTML** — `<!--@include header.html-->` résolu par un plugin maison de vingt
   lignes (pas de moteur de templates). Décor, `<head>`, header, bandeau CTA et footer
   vivent dans [src/partials/](src/partials/). Toute modification d'un de ces blocs se fait
   dans le partial, **jamais** dans les pages : elles sont sept à le partager.
2. **Cards d'articles de l'accueil** — `<!--@articles-->` remplacé par le rendu de
   [scripts/articles.mjs](scripts/articles.mjs).
3. **Entrées Rollup dynamiques** — la liste des pages article n'est pas connue d'avance,
   elle vient de Directus. D'où une config asynchrone.

Les pages sont servies en URL propres (`/procuve/`), la seule forme identique en dev Vite
et chez l'hébergeur.

### Pipeline articles

| Fichier | Rôle |
|---|---|
| [scripts/directus.mjs](scripts/directus.mjs) | réseau : appelle l'API, télécharge les images dans `public/img/articles/`, met la réponse en cache dans `.cache/articles.json` |
| [scripts/articles.mjs](scripts/articles.mjs) | rendu pur : données → HTML (page, card, Open Graph, JSON-LD). Ne connaît ni réseau ni disque, donc testable sans Directus |
| [scripts/generate-articles.mjs](scripts/generate-articles.mjs) | disque : écrit `articles/<slug>/index.html` avant que Vite ne lise ses entrées |

**`articles/` et `public/img/articles/` sont produits et gitignorés.** Ne jamais y éditer à
la main : la source de vérité est Directus, et le contenu du dossier est reconstruit à
chaque build. Un témoin `.generated` marque les dossiers que le script s'autorise à
effacer.

Si Directus est injoignable, le build local repart du cache **en le signalant** ; en CI
(`CI=true`) ce repli est refusé — mieux vaut un déploiement en échec qu'un site publié avec
un contenu périmé. Le contenu est figé au démarrage de `npm run dev` : un article publié
pendant que le serveur tourne n'apparaît qu'après redémarrage.

### JavaScript

[src/js/main.js](src/js/main.js) appelle une fonction `init*` par domaine ; chacune sort
immédiatement si son élément n'est pas sur la page — le même bundle sert les sept pages.

[src/js/motion.js](src/js/motion.js) est le **point de vérité unique** du mouvement :
durées, easings, amplitudes, helpers de révélation, et la garde `prefers-reduced-motion`
(chaque helper pose alors l'état final sans animer). Toute nouvelle animation passe par ce
vocabulaire, c'est ce qui rend le site cohérent d'une section à l'autre.

L'animation signature est unique et vit dans le hero : le portrait se dissout en particules,
image par image, piloté par le scroll ([src/js/sequence.js](src/js/sequence.js)). Canvas +
suite de WebP plutôt qu'une `<video>` dont on pilote `currentTime`, qui est saccadé sur
Safari/iOS. Les images sont versionnées, produites hors build par `npm run sequence`. Ne
pas réutiliser cet effet ailleurs : il porte parce qu'il est rare.

Lenis est câblé sur le ticker GSAP et notifie ScrollTrigger à chaque frame — les deux liens
sont indispensables, sans eux la parallaxe tremble et les déclencheurs partent en décalé.
`syncTouch: false` : le scroll tactile reste natif (iOS Safari).

### Styles

[src/styles/tokens.css](src/styles/tokens.css) contient tous les tokens dans `@theme` —
Tailwind v4 en dérive les utilitaires (`bg-ink-950`, `text-copper-400`). **Toute couleur,
typo ou durée doit venir d'ici**, aucune valeur en dur dans les pages. Palette : navy
très sombre + cuivre en accent rare. Les pages activité portent leur couleur de marque via
`<body data-brand="…">` (`--brand`), c'est leur seule différence structurelle.

[src/styles/main.css](src/styles/main.css) porte la base et les composants. La classe
`.prose` y met en page le corps des articles, avec une échelle typographique à part —
volontairement non animée au scroll.

## Déploiement

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) — déclenché par push sur
`main`, par `repository_dispatch: directus-publish` (le client publie), ou à la main.
Build puis `rsync --delete` en SSH vers Infomaniak.

Trois garde-fous, à ne pas retirer : le build échoue si aucune page article n'a été
produite ; le workflow refuse de partir si `SSH_TARGET_DIR` ne désigne pas le dossier de
`jeanmaximehanny.fr` (l'hébergement porte cinq sites et `--delete` efface) ; le site doit
répondre 200 après dépôt.

L'utilisateur SSH doit être de type **PHP**, pas Node. La clé privée est stockée en base64
sur une ligne (`SSH_PRIVATE_KEY_B64`) — un saut de ligne perdu au collage produit un
« error in libcrypto » trompeur.

`netlify.toml` et `npm run deploy` sont un reliquat de la phase preview ; la production est
chez Infomaniak.

## Documents de référence

- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — direction artistique, décisions actées et leurs
  raisons, script d'animation par section, structure des pages. **À lire avant toute
  décision de design.**
- [CMS.md](CMS.md) — installation Directus, rôles, secrets GitHub, webhook, dépannage.
- [ASSETS-A-FOURNIR.md](ASSETS-A-FOURNIR.md) — ce qui manque encore côté client.
