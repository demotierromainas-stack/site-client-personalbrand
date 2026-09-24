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
- ~~Pas de vidéo générée pour le hero~~ — **revenu dessus le 26/08/2026**, à la demande
  du client, qui a fourni une vidéo IA du personnage se dissolvant en particules.
  Elle n'est pas *lue* mais **parcourue au scroll** : le hero la traverse image par
  image à mesure qu'on descend, et la remonte si on remonte. Les réserves d'origine
  (poids, rigidité) sont traitées par la production : la source est découpée en une
  suite d'images WebP (`npm run sequence`), la fin inutile est coupée, un jeu allégé
  sert sur téléphone, et le téléchargement n'a lieu qu'une fois la page chargée.
  Voir `src/js/sequence.js` et `scripts/sequence.mjs`.
- Une seule animation signature par page, et elle est dans le hero. La séquence
  n'apparaît nulle part ailleurs, pas même arrêtée sur une image : la section
  « À propos » est du texte seul (choix client du 26/08/2026). L'effet reste rare,
  donc il porte.
- Stack : **HTML/Tailwind custom**, pas de CMS.
- Animations : **GSAP + ScrollTrigger** pour les animations au scroll (fade, slide,
  scale, stagger). **Lenis** pour le smooth scroll (sensation premium au défilement).
- Fond animé (glow/lignes lumineuses) : **lueurs en CSS, courbes en canvas 2D**
  (`src/js/decor.js`), pas de WebGL. Les lueurs sont des dégradés que le navigateur
  compose sans les redessiner, c'est ce qu'il fait de moins cher ; les courbes, elles,
  ondulent en continu et reçoivent de temps à autre un reflet doré qui glisse le long
  du tracé. Ni l'un ni l'autre n'est à la portée d'un SVG : l'ondulation déplace chaque
  point de la courbe le long de sa normale, il faudrait animer les points un à un.
  Mesuré sur 1440 × 900 en Retina : 4 à 5 % d'un cœur, 60 fps tenus, dessin arrêté dès
  que l'onglet passe en arrière-plan. Le canvas a aussi réglé le cadrage : la composition est
  décrite deux fois, pour écran large et pour écran étroit, là où le SVG ne pouvait
  que rogner la version large sur un téléphone.
- Mouvement du fond, réglé le 23/09/2026 : **une vague parcourt les lignes en
  permanence** (une crête avance d'une longueur d'onde en 12 à 19 s, creux de 20 à
  36 px), par-dessus une respiration lente de la composition (29 à 46 s) et un reflet
  doré toutes les dix secondes environ. Deux réglages successifs le même jour : la
  première version visait l'imperceptible et ne se voyait pas — le fond paraissait
  figé, ce qui ne valait pas le canvas ; la deuxième, moitié moins ample et moitié
  moins rapide que celle-ci, restait timide. L'ondulation est donc franche, et c'est
  volontaire. Les périodes restent désaccordées entre elles : deux courbes qui
  repasseraient ensemble par leur point de départ donneraient un battement, et un
  battement se remarque.
- Les trois curseurs sont groupés dans `wave` (`src/js/decor.js`, un bloc par
  courbe) : `amp` l'ampleur, `period` la vitesse, `length` le nombre de vagues sur
  la longueur du tracé. Rien d'autre à toucher pour re-régler le fond.
- **Le fond s'anime aussi sur téléphone** (23/09/2026), à 30 images par seconde au
  lieu de 60. C'est une exception à la règle « rien qui tourne en boucle sur tactile »,
  qui visait les flous géants et les modes de fusion, pas sept traits fins sans l'un ni
  l'autre : mesuré à 2,4 % d'un cœur sur un viewport de téléphone. La vague met une
  quinzaine de secondes à avancer d'une longueur d'onde — à 30 images par seconde elle
  n'avance pas d'un pixel entier entre deux images, la cadence moitié ne se voit pas et
  rend le reste du temps graphique au scroll.

## Structure du site (sections identifiées sur la maquette)
1. **Header** — logo, nav (À propos, Activités, Projets, Articles, Contact), CTA
   "Prendre rendez-vous"
2. **Hero** — accroche + nom, sous-titre, 2 CTA, séquence du client parcourue au scroll,
   bloc stats (15+ années, 20+ entreprises, 8 projets, 4 domaines)
3. **À propos** — texte seul, titre à gauche et présentation à droite. Ajoutée le
   26/08/2026 : le lien « À propos » du header pointait jusque-là vers le hero, faute
   de destination.
4. **Parcours** — frise verticale de jalons datés, dont le rail se remplit au scroll.
   Ajoutée le 26/08/2026, même motif : la page était trop courte.
5. **Mes entreprises** — intro + grille de 3 cards (logo/icône, nom, tag, description,
   lien "en savoir plus")
6. **Réflexions/Articles** — intro + carrousel de cards articles (image, catégorie,
   date, titre, lien)
7. **Bandeau CTA final** — accroche courte + bouton "Prendre rendez-vous"
8. **Footer** — logo, baseline, réseaux sociaux, nav, expertises, contact

## Script d'animation par section
- **Hero** : texte qui fade/slide en entrée au chargement ; **le personnage se dissout
  en particules au scroll**, image par image, sur le premier demi-écran ; stats en
  count-up animé ; parallax léger entre fond/photo au scroll et/ou au mouvement de la
  souris ; glow qui réagit subtilement au curseur
- **À propos / Parcours** : révélations en cascade ; le rail de la frise se remplit
  en cuivre au fil de la descente
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
| `/senior-ia/` | `senior-ia/index.html` |
| `/businessbusiness/` | `businessbusiness/index.html` |
| `/ia-en-famille/` | `ia-en-famille/index.html` |
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
