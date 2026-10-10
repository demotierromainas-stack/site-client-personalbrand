/**
 * Les polices du site, pour les outils qui dessinent des images.
 *
 * Elles ne sont pas versionnées : le site les charge depuis Google Fonts, et
 * elles ne servent ici qu'à produire des fichiers figés (cartes de partage,
 * icônes). Elles sont donc téléchargées à la demande dans `.cache/`, déjà
 * ignoré par git.
 *
 * Ce module existe parce que deux scripts en ont besoin — `og.mjs` et
 * `favicon.mjs` — et que deux copies du même téléchargeur finiraient par
 * diverger sur l'URL ou le chemin de cache.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const CACHE = '.cache/fonts';

const POLICES = {
  display: {
    fichier: 'PlayfairDisplay.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf',
  },
  texte: {
    fichier: 'Inter.ttf',
    url: 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
  },
};

async function existe(fichier) {
  try {
    await access(fichier);
    return true;
  } catch {
    return false;
  }
}

/** Le chemin d'une police (`display` ou `texte`), téléchargée au premier passage. */
export async function police(nom) {
  const { fichier, url } = POLICES[nom];
  const chemin = path.join(CACHE, fichier);
  if (await existe(chemin)) return chemin;

  console.log(`  téléchargement de ${fichier}…`);
  const reponse = await fetch(url);
  if (!reponse.ok) {
    throw new Error(
      `Téléchargement de ${fichier} : HTTP ${reponse.status}.\n` +
        `La police est libre (SIL OFL) et se récupère à la main depuis ${url}, ` +
        `à déposer dans ${CACHE}/.`,
    );
  }
  await mkdir(CACHE, { recursive: true });
  await writeFile(chemin, Buffer.from(await reponse.arrayBuffer()));
  return chemin;
}
