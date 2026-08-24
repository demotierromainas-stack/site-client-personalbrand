# PROJECT BRIEF — Site Personal Brand (Jean-Maxime Hanny)

## Contexte
Site vitrine "personal brand" pour un client entrepreneur/investisseur.
Objectif : effet visuel "wahou" via des animations au scroll sur chaque section.
**Important :** pas de vraie 3D — c'est un abus de langage du client. L'effet recherché
vient du mouvement (parallax, fade/slide, glow réactif), pas de modélisation 3D.

## Direction artistique (d'après la maquette fournie)
- Fond sombre premium : noir/navy profond, avec des faisceaux lumineux cuivre/bronze
  en diagonale à l'arrière-plan (effet glow architectural)
- Portrait du client détouré sur fond sombre, intégré dans un décor type architecture/verre
- Cards en glassmorphism : fond semi-transparent, bordure fine, légère lueur au hover
- Typographie : serif élégante pour le nom/titres principaux, sans-serif pour le reste
- Palette : noir/navy + cuivre/bronze en accent, texte blanc/gris clair

## Décisions actées
- Pas de vidéo générée pour le hero (poids de page, rigidité, risque d'artefacts sur
  un portrait réaliste). Photo statique détourée + animations code = meilleur rapport
  qualité/performance/contrôle.
- Stack : **HTML/Tailwind custom**, pas de CMS.
- Animations : **GSAP + ScrollTrigger** pour les animations au scroll (fade, slide,
  scale, stagger). **Lenis** pour le smooth scroll (sensation premium au défilement).
- Fond animé (glow/lignes lumineuses) : à faire en CSS/SVG animé en priorité
  (gradients qui bougent lentement), éventuellement renforcé par un léger effet
  WebGL/Three.js si besoin après le premier prototype.

## Structure du site (sections identifiées sur la maquette)
1. **Header** — logo, nav (À propos, Activités, Projets, Articles, Contact), CTA
   "Prendre rendez-vous"
2. **Hero** — accroche + nom, sous-titre, 2 CTA, photo détourée du client, bloc stats
   (15+ années, 20+ entreprises, 8 projets, 4 domaines)
3. **Mes entreprises** — intro + grille de 3 cards (logo/icône, nom, tag, description,
   lien "en savoir plus")
4. **Réflexions/Articles** — intro + grille de 3 cards articles (image, catégorie,
   date, titre, lien)
5. **Bandeau CTA final** — accroche courte + bouton "Prendre rendez-vous"
6. **Footer** — logo, baseline, réseaux sociaux, nav, expertises, contact

## Script d'animation par section
- **Hero** : texte qui fade/slide en entrée au chargement ; photo qui apparaît avec
  léger scale ; stats en count-up animé ; parallax léger entre fond/photo au scroll
  et/ou au mouvement de la souris ; glow qui réagit subtilement au curseur
- **Mes entreprises** : cards en stagger (apparition décalée l'une après l'autre) au
  scroll, hover = légère élévation + glow
- **Articles** : slide-in léger au scroll, hover = légère élévation
- **Bandeau CTA final** : fade-in avec léger zoom
- **Global** : smooth scroll (Lenis) sur toute la page, respect de
  `prefers-reduced-motion` pour l'accessibilité

## Contraintes techniques
- Pas de CMS — contenu en dur dans le HTML
- Perf : désactiver/simplifier les animations lourdes sur mobile, tester le poids
  de page, tester Lenis sur iOS (peut être capricieux)
- Fallback : si le fond animé WebGL s'avère trop lourd, garder la version CSS/SVG

## Architecture des pages (état actuel)

Le site fait sept pages, servies en URL propres :

| URL | Fichier source |
|---|---|
| `/` | `index.html` |
| `/procuve/` | `procuve/index.html` |
| `/businessbusiness/` | `businessbusiness/index.html` |
| `/ia-pour-tous/` | `ia-pour-tous/index.html` |
| `/articles/entreprendre-en-2026/` | `articles/entreprendre-en-2026/index.html` |
| `/articles/investir-avec-vision/` | `articles/investir-avec-vision/index.html` |
| `/articles/ia-au-service-de-la-societe/` | `articles/ia-au-service-de-la-societe/index.html` |

Le décor de fond, le `<head>` commun, le header, le bandeau CTA et le footer sont des
**partials** dans `src/partials/`, inclus par `<!--@include nom.html-->`. Un plugin Vite de
vingt lignes (`vite.config.js`) les résout au build — pas de moteur de templates ni de
dépendance supplémentaire pour ça. Toute modification d'un de ces blocs se fait dans le partial,
jamais dans les pages.

Les trois pages activité sont structurellement identiques : elles ne diffèrent que par
`<body data-brand="…">`, qui porte la couleur de la marque (`--brand`) pour toute la page.

Les trois pages article partagent la même ossature : en-tête (fil d'Ariane, catégorie, date,
temps de lecture, chapô, image), corps en colonne étroite, signature, deux articles suivants.
Le corps est mis en page par la classe `.prose` (`src/styles/main.css`) — une échelle
typographique à part, plus grande et plus aérée que le reste du site, parce qu'un article se lit
sur plusieurs minutes. Il n'est volontairement **pas** animé au scroll : les révélations rythment
bien une section courte, elles font attendre sur un texte qu'on lit.

Le maillage interne passe par trois chemins : les cards de l'accueil, le sous-menu « Activités »
du header (présent sur toutes les pages, comme dans le footer), et une section « Les autres
activités » en bas de chaque page activité.

## Prochaines étapes techniques
1. Détourer la photo du client (fond transparent)
2. Scaffolder le projet HTML/Tailwind (structure des 6 sections ci-dessus)
3. Installer GSAP + ScrollTrigger + Lenis
4. Construire le hero en premier (photo + texte + stats animés) pour valider la
   direction avec le client avant de continuer
5. Construire les sections suivantes avec leurs animations respectives
6. Passe perf + responsive + accessibilité
7. Pages activité (faites) — reste à intégrer les vrais logos, la photo en
   fauteuil et les textes définitifs
8. Articles (faits) — trois articles rédigés, textes et images provisoires
9. Pages mentions légales et politique de confidentialité — bloquantes pour la
   mise en ligne
