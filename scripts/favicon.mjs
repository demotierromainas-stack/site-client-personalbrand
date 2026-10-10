#!/usr/bin/env node
/**
 * Icônes du site — le monogramme « JMH » du header, en fichiers.
 *
 *   npm run favicon
 *
 * Outil ponctuel, lancé à la main, comme `npm run og` et `npm run sequence` :
 * les fichiers produits sont versionnés dans `public/` et la CI les recopie
 * tels quels. Le logo ne bouge pas à chaque déploiement, inutile de faire
 * dépendre le build d'ImageMagick pour lui.
 *
 * Sur le site, le logo est du texte : un `<span>` en Playfair Display cuivre
 * dans [src/partials/header.html]. Un onglet de navigateur et un résultat
 * Google ne lisent pas le HTML du header — il leur faut une image. C'est tout
 * l'objet de ce script : redessiner ce même monogramme en fichiers d'icône.
 *
 * Ce qui est produit :
 *   public/favicon.ico              16, 32 et 48 px empilés dans un seul fichier
 *   public/icone-192.png            Android, raccourcis d'écran d'accueil
 *   public/icone-512.png            la grande taille, pour les mêmes usages
 *   public/apple-touch-icon.png     180 px, iOS
 *
 * Pourquoi la racine de `public/` et non un sous-dossier : les navigateurs et
 * les robots demandent `/favicon.ico` et `/apple-touch-icon.png` à l'aveugle,
 * sans lire la page. Ces deux-là *doivent* être là ; les deux autres suivent
 * par cohérence.
 *
 * Pourquoi pas de SVG, qui serait net à toute taille : le monogramme est du
 * texte dans une police que le visiteur n'a pas forcément, et un SVG qui
 * contient `<text>` s'affiche alors dans une autre police — ici, en pratique,
 * du Times. Le vectoriser demanderait d'embarquer les contours de la police,
 * donc un outil de plus. Le PNG et l'ICO couvrent tous les navigateurs.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { police } from './polices.mjs';

const run = promisify(execFile);

const SORTIE = 'public';

/* Les couleurs de tokens.css, que ImageMagick ne sait pas lire. */
const ENCRE = '#07090f'; // --color-ink-950

/* Le header écrit le monogramme en cuivre 400. Ici c'est le 300, plus clair,
   et le trait est très légèrement épaissi : réduites à 16 ou 32 px, les
   déliés de Playfair perdent assez de matière pour que le cuivre 400 vire au
   brun terne. Le 300 rend à l'écran la valeur qu'a le logo sur la page —
   c'est la même couleur perçue, pas une autre couleur. */
const CUIVRE = '#e0a96d'; // --color-copper-300
const EPAISSISSEMENT = 7; // en unités de la grille de 512

/* Le dessin est composé à 512 px, puis réduit. Les tailles intermédiaires
   sorties d'une réduction propre sont bien plus nettes qu'un rendu de texte
   demandé directement à 16 px, où le moteur de police n'a plus la place de
   placer un empattement. */
const COTE = 512;
const RAYON = 104; // ~20 % du côté, l'arrondi des icônes d'application
const LARGEUR_UTILE = 448; // le monogramme est large : il occupe presque la ligne
const HAUTEUR_UTILE = 300;

/** Le monogramme seul, détouré, sur fond transparent. */
function monogramme(fonte) {
  return [
    '-background', 'none',
    '-fill', CUIVRE,
    '-stroke', CUIVRE,
    '-strokewidth', String(EPAISSISSEMENT),
    '-font', fonte,
    '-pointsize', '400',
    'label:JMH',
    '-trim', '+repage',
  ];
}

/**
 * L'icône de base, à 512 px : un carré d'encre, le monogramme au centre.
 *
 * `arrondi` : le carré est arrondi, comme une icône d'application. iOS
 * applique déjà son propre masque et remplit de noir ce qui dépasse, donc
 * l'icône qui lui est destinée reste un carré plein et opaque — sinon ses
 * coins arrondis apparaissent une deuxième fois, en creux.
 *
 * Le monogramme est dessiné **avant** le carré, et les deux images sont
 * ensuite échangées pour composer. Ce n'est pas un détour gratuit :
 * `-size` est un réglage global qui reste actif jusqu'au suivant, et il
 * contraint aussi la boîte dans laquelle un `label:` est rendu. Posé pour
 * le carré avant le texte, il coupait le « H ». Les parenthèses rendent leur
 * réglage à la sortie : dessiner le texte en premier le met hors de portée.
 *
 * Le trait du monogramme, lui, est annulé explicitement (`-stroke none`) avant
 * de tracer le carré : sans ça il en cernait le contour arrondi d'un liseré
 * cuivre, visible à toutes les tailles.
 */
function base(fonte, { arrondi }) {
  const carre = arrondi
    ? ['(', '-size', `${COTE}x${COTE}`, 'xc:none', '-fill', ENCRE, '-stroke', 'none',
       '-draw', `roundrectangle 0,0,${COTE - 1},${COTE - 1},${RAYON},${RAYON}`, ')']
    : ['(', '-size', `${COTE}x${COTE}`, `xc:${ENCRE}`, ')'];

  return [
    '(', ...monogramme(fonte), '-resize', `${LARGEUR_UTILE}x${HAUTEUR_UTILE}`, ')',
    ...carre,
    '-swap', '0,1',
    '-gravity', 'center', '-composite',
  ];
}

async function main() {
  try {
    await run('magick', ['-version']);
  } catch {
    throw new Error("ImageMagick est requis (`brew install imagemagick`), la commande « magick » n'a pas répondu.");
  }

  const fonte = await police('display');
  const arrondie = base(fonte, { arrondi: true });
  const pleine = base(fonte, { arrondi: false });

  /* Le .ico porte trois tailles dans un seul fichier, et le navigateur choisit.
     48 px est le minimum que Google accepte pour afficher une icône à côté du
     résultat de recherche : en dessous, il met une icône générique. 32 est la
     taille servie aux onglets des écrans Retina, 16 à ceux qui ne le sont pas.
     Le filtre est nommé explicitement — la réduction par défaut d'ImageMagick
     empâte les empattements. */
  const ico = path.join(SORTIE, 'favicon.ico');
  await run('magick', [
    ...arrondie, '-filter', 'Lanczos',
    '(', '-clone', '0', '-resize', '48x48', ')',
    '(', '-clone', '0', '-resize', '32x32', ')',
    '(', '-clone', '0', '-resize', '16x16', ')',
    '-delete', '0', ico,
  ]);
  console.log(`  ${ico} (16, 32, 48)`);

  for (const taille of [192, 512]) {
    const png = path.join(SORTIE, `icone-${taille}.png`);
    await run('magick', [...arrondie, '-filter', 'Lanczos', '-resize', `${taille}x${taille}`, '-depth', '8', '-strip', png]);
    console.log(`  ${png}`);
  }

  const apple = path.join(SORTIE, 'apple-touch-icon.png');
  await run('magick', [
    ...pleine, '-filter', 'Lanczos', '-resize', '180x180',
    // iOS refuse la transparence et la remplace par du noir : on l'enlève ici.
    '-background', ENCRE, '-alpha', 'remove', '-alpha', 'off', '-depth', '8', '-strip', apple,
  ]);
  console.log(`  ${apple}`);

  console.log(
    '\nIcônes produites. Elles sont déclarées une fois pour tout le site dans\n' +
      'src/partials/head.html — si un nom de fichier change ici, le changer là-bas.',
  );
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exit(1);
});
