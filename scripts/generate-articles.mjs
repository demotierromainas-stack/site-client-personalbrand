/**
 * Écrit `articles/<slug>/index.html` à partir des articles publiés dans Directus.
 *
 * Tourne avant Vite, en dev comme au build : Vite a besoin de vrais fichiers
 * HTML sur le disque pour un site multi-pages, il ne sait pas prendre en entrée
 * une page qui n'existe pas encore.
 *
 * Le dossier `articles/` est donc entièrement produit — il est dans .gitignore,
 * et la source de vérité est Directus.
 *
 *   node scripts/generate-articles.mjs
 */

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchArticles, syncImage, pruneImages } from './directus.mjs';
import { prepare, renderArticlePage } from './articles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ARTICLES_DIR = resolve(ROOT, 'articles');

/* Témoin déposé dans chaque dossier écrit ici. Il sert au ménage : un dossier
   sans témoin n'a pas été produit par ce script, donc on n'y touche pas. Cette
   précaution évite qu'une erreur de nommage fasse disparaître du travail écrit
   à la main. */
const TEMOIN = '.generated';

/**
 * Les articles préparés, mis en cache le temps d'un processus.
 *
 * vite.config.js en a besoin deux fois — une fois pour la liste des pages à
 * construire, une fois pour les cards de l'accueil — et il serait absurde
 * d'interroger Directus et de retélécharger les images à chaque appel.
 */
let memo = null;

export async function loadArticles() {
  if (memo) return memo;

  const bruts = await fetchArticles();

  /* Les images sont téléchargées une par une, pas toutes en parallèle : sur un
     hébergement mutualisé, une rafale de requêtes simultanées se fait
     étrangler avant de se faire servir. */
  const articles = [];
  for (const brut of bruts) {
    const image = await syncImage(brut);
    articles.push(prepare(brut, image));
  }

  memo = articles;
  return articles;
}

export async function generateArticles({ silencieux = false } = {}) {
  const articles = await loadArticles();

  mkdirSync(ARTICLES_DIR, { recursive: true });

  for (const article of articles) {
    const dossier = resolve(ARTICLES_DIR, article.slug);
    mkdirSync(dossier, { recursive: true });
    writeFileSync(resolve(dossier, 'index.html'), renderArticlePage(article, articles));
    writeFileSync(
      resolve(dossier, TEMOIN),
      'Dossier produit par scripts/generate-articles.mjs — ne rien y écrire à la main.\n',
    );
  }

  /* Ménage : un article dépublié dans Directus doit voir sa page disparaître,
     sinon elle reste en ligne et reste indexée par les moteurs. */
  const vivants = new Set(articles.map((a) => a.slug));
  const supprimes = [];

  for (const entree of readdirSync(ARTICLES_DIR)) {
    const dossier = resolve(ARTICLES_DIR, entree);
    if (vivants.has(entree) || !statSync(dossier).isDirectory()) continue;
    if (!existsSync(resolve(dossier, TEMOIN))) continue; // pas à nous
    rmSync(dossier, { recursive: true, force: true });
    supprimes.push(entree);
  }

  const imagesRetirees = pruneImages(articles.map((a) => a.image));

  if (!silencieux) {
    console.log(`${articles.length} article(s) : ${articles.map((a) => a.slug).join(', ')}`);
    if (supprimes.length) {
      console.log(`${supprimes.length} page(s) obsolètes retirées : ${supprimes.join(', ')}`);
    }
    if (imagesRetirees.length) {
      console.log(`${imagesRetirees.length} image(s) inutilisées retirées.`);
    }
  }

  return articles;
}

/* Exécuté directement en ligne de commande, et importé par vite.config.js. */
if (import.meta.url === `file://${process.argv[1]}`) {
  generateArticles().catch((erreur) => {
    console.error(`\n✖ ${erreur.message}\n`);
    process.exit(1);
  });
}
