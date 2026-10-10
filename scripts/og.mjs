#!/usr/bin/env node
/**
 * Cartes de partage (Open Graph) — les images qu'affichent WhatsApp, LinkedIn,
 * iMessage ou Slack quand un lien du site y est collé.
 *
 *   npm run og
 *
 * Outil ponctuel, lancé à la main, comme `npm run sequence` : les JPEG produits
 * sont versionnés dans `public/img/og/` et la CI les recopie telles quelles.
 * Faire dépendre chaque déploiement d'ImageMagick pour quatre images figées
 * serait un mauvais échange.
 *
 * Pourquoi des cartes dédiées plutôt que les images déjà présentes :
 *  - le portrait fait 920 × 876, presque carré. Tous les aperçus le rognaient
 *    de travers, et le visage sortait du cadre ;
 *  - la scène des pages activité fait 606 px de large, soit la moitié des
 *    1200 px attendus. En dessous de cette largeur, LinkedIn n'affiche plus
 *    une grande carte mais une vignette ;
 *  - en WebP, l'image n'est pas lue par tous les aperçus. Le JPEG l'est
 *    partout, et sur une carte de 1200 × 630 l'écart de poids est marginal.
 *
 * 1200 × 630 est le format attendu par toutes les plateformes (ratio 1,91:1).
 * Les textes reprennent ceux des pages : s'ils changent là-bas, relancer ici.
 */

import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

import { police } from './polices.mjs';

const run = promisify(execFile);

const SORTIE = 'public/img/og';
const PORTRAIT = 'public/img/portrait.webp';

/* Les couleurs sont celles de tokens.css. Elles y sont déclarées pour le CSS,
   qu'ImageMagick ne sait pas lire : les reporter ici est la seule duplication
   du fichier, et elle ne bouge que si la charte bouge. */
const ENCRE = '#07090f'; // --color-ink-950
const OS = '#edeef0'; // --color-bone-100
const OS_DOUX = '#b8bdc7'; // --color-bone-300
const GRIS = '#8a909c'; // --color-bone-500
const CUIVRE = '#d4914f'; // --color-copper-400
const CUIVRE_SOMBRE = '#b87333'; // --color-copper-500

/**
 * Les quatre cartes.
 *
 * L'accueil porte le portrait : c'est une marque personnelle, le visage est
 * l'argument. Les trois pages activité reprennent les arcs du décor de fond
 * dans leur couleur de marque — la scène d'activité, en 606 px, ne supporte
 * pas l'agrandissement, et un flou pour le cacher ne ressemblait qu'à un flou.
 */
const CARTES = [
  {
    fichier: 'accueil.jpg',
    composition: 'portrait',
    marque: CUIVRE,
    sourtitre: 'ENTREPRENEUR • INVESTISSEUR • DÉVELOPPEUR DE PROJETS',
    nom: 'Jean-Maxime',
    nomAccent: 'Hanny',
    resume: ["Bâtir aujourd'hui les entreprises", 'et les solutions de demain.'],
    pied: 'jeanmaximehanny.fr',
  },
  {
    fichier: 'senior-ia.jpg',
    composition: 'arcs',
    marque: '#69abde', // --color-cobalt-400
    sourtitre: 'JEAN-MAXIME HANNY',
    nom: 'Senior IA',
    accroche: ["L'intelligence artificielle,", 'à votre rythme.'],
    resume: ['Ateliers en petit groupe, accompagnement à domicile,', 'sessions en résidence.'],
  },
  {
    fichier: 'ia-en-famille.jpg',
    composition: 'arcs',
    marque: '#a78bfa', // --color-violet-400
    sourtitre: 'JEAN-MAXIME HANNY',
    nom: 'IA en famille',
    accroche: ["L'intelligence artificielle", "s'apprend en famille."],
    resume: ["Ateliers d'initiation, formation en entreprise,", 'programmes solidaires.'],
  },
  {
    fichier: 'businessbusiness.jpg',
    composition: 'arcs',
    marque: CUIVRE,
    sourtitre: 'JEAN-MAXIME HANNY',
    nom: 'BusinessBusiness',
    // Seize caractères : au corps des autres titres, le mot sortirait du cadre.
    tailleNom: 56,
    accroche: ["Comprendre l'argent", 'avant de le placer.'],
    resume: ['Analyses, décryptages et formats pédagogiques,', 'sans jargon.'],
  },
];

/** `#69abde` → `105,171,222`, la forme qu'attend `rgba()` dans un -draw. */
const canaux = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

/**
 * Le fond : l'encre du site, un halo dans la couleur de marque, et — pour les
 * pages activité — trois arcs décentrés qui reprennent le décor de fond.
 *
 * Les arcs sont des cercles dont le centre est hors du cadre, en bas à droite :
 * seule la portion qui traverse l'image se voit, et c'est exactement ainsi que
 * decor.js les trace à l'écran.
 */
function fond(carte) {
  const rgb = canaux(carte.marque);
  const halo = [
    '(', '-size', '1200x630', 'xc:none',
    '-fill', carte.marque,
    '-draw', carte.composition === 'portrait' ? 'ellipse 880,230 320,300 0,360' : 'ellipse 980,300 290,300 0,360',
    '-blur', carte.composition === 'portrait' ? '0x100' : '0x110',
    '-channel', 'A', '-evaluate', 'multiply', carte.composition === 'portrait' ? '0.34' : '0.38', '+channel',
    ')', '-composite',
  ];

  if (carte.composition === 'portrait') return halo;

  return [
    ...halo,
    '(', '-size', '1200x630', 'xc:none', '-fill', 'none', '-strokewidth', '2',
    '-stroke', `rgba(${rgb},0.55)`, '-draw', 'circle 1240,820 1240,300',
    '-stroke', `rgba(${rgb},0.34)`, '-draw', 'circle 1240,820 1240,190',
    '-stroke', 'rgba(237,238,240,0.16)', '-draw', 'circle 1240,820 1240,80',
    // Un cheveu de flou : sans lui, les arcs crénèlent après compression JPEG.
    '-blur', '0x0.6',
    ')', '-composite',
  ];
}

/**
 * Le portrait, posé à droite et fondu dans le fond par la gauche — le même
 * dégradé que `.portrait-mask` sur le site.
 *
 * Le recadrage est calculé par ImageMagick (`-resize ^` puis `-extent`) plutôt
 * qu'écrit en dur : le portrait doit être remplacé par une vraie photo, et un
 * décalage en pixels calculé pour l'image actuelle découperait la suivante au
 * milieu du visage. `-gravity north` garde le haut du cadre, là où est la tête.
 */
function portrait() {
  return [
    '(', PORTRAIT,
    '-resize', '520x630^', '-gravity', 'north', '-extent', '520x630', '+repage',
    '(', '-size', '520x630', 'xc:white',
    '(', '-size', '630x240', 'gradient:white-black', '-rotate', '90', ')',
    '-gravity', 'west', '-composite', ')',
    '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
    ')', '-gravity', 'northwest', '-geometry', '+680+0', '-compose', 'over', '-composite',
  ];
}

/** Les textes, calés sur une colonne gauche de 80 px de marge. */
function textes(carte, polices) {
  const ligne = (y, pas) => (i) => y + i * pas;

  if (carte.composition === 'portrait') {
    const resume = ligne(482, 30);
    return [
      '-gravity', 'northwest',
      '-font', polices.texte, '-pointsize', '18', '-kerning', '2.8', '-fill', GRIS,
      '-annotate', '+80+180', carte.sourtitre,
      '-font', polices.display, '-pointsize', '78', '-kerning', '0', '-fill', OS,
      '-annotate', '+80+228', carte.nom,
      '-fill', carte.marque, '-annotate', '+80+318', carte.nomAccent,
      '-fill', CUIVRE_SOMBRE, '-draw', 'rectangle 80,448 200,450',
      '-font', polices.texte, '-pointsize', '20', '-fill', OS_DOUX,
      ...carte.resume.flatMap((t, i) => ['-annotate', `+80+${resume(i)}`, t]),
      '-pointsize', '17', '-kerning', '1.2', '-fill', '#545b68',
      '-annotate', '+80+562', carte.pied,
    ];
  }

  const accroche = ligne(378, 50);
  const resume = ligne(510, 28);
  const rgb = canaux(carte.marque);
  return [
    '-gravity', 'northwest',
    '-font', polices.texte, '-pointsize', '18', '-kerning', '2.8', '-fill', GRIS,
    '-annotate', '+80+170', carte.sourtitre,
    '-font', polices.display, '-pointsize', String(carte.tailleNom ?? 76), '-kerning', '0', '-fill', OS,
    '-annotate', '+80+218', carte.nom,
    '-fill', `rgb(${rgb})`, '-draw', 'rectangle 80,340 200,342',
    '-font', polices.display, '-pointsize', '38', '-fill', carte.marque,
    ...carte.accroche.flatMap((t, i) => ['-annotate', `+80+${accroche(i)}`, t]),
    '-font', polices.texte, '-pointsize', '19', '-kerning', '0', '-fill', OS_DOUX,
    ...carte.resume.flatMap((t, i) => ['-annotate', `+80+${resume(i)}`, t]),
  ];
}

async function main() {
  try {
    await run('magick', ['-version']);
  } catch {
    throw new Error("ImageMagick est requis (`brew install imagemagick`), la commande « magick » n'a pas répondu.");
  }

  const polices = { display: await police('display'), texte: await police('texte') };
  await mkdir(SORTIE, { recursive: true });

  for (const carte of CARTES) {
    const destination = path.join(SORTIE, carte.fichier);
    await run('magick', [
      '-size', '1200x630', `xc:${ENCRE}`,
      ...fond(carte),
      ...(carte.composition === 'portrait' ? portrait() : []),
      ...textes(carte, polices),
      '-strip', '-quality', '88',
      destination,
    ]);
    console.log(`  ${destination}`);
  }

  console.log(
    `\n${CARTES.length} cartes produites (1200 × 630).\n` +
      'Après mise en ligne, forcer la relecture chez les plateformes qui mettent les aperçus\n' +
      'en cache : developers.facebook.com/tools/debug et linkedin.com/post-inspector.',
  );
}

main().catch((e) => {
  console.error(`\n${e.message}\n`);
  process.exit(1);
});
