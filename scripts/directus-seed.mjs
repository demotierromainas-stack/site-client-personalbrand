/**
 * Injecte dans Directus les trois articles déjà écrits, images comprises.
 *
 * À lancer une fois, après scripts/directus-setup.mjs :
 *
 *   DIRECTUS_URL=https://cms.example.com DIRECTUS_ADMIN_TOKEN=xxx \
 *     node scripts/directus-seed.mjs
 *
 * Idempotent : un article dont le slug existe déjà est laissé tel quel. On peut
 * donc relancer le script sans écraser une correction faite depuis l'interface.
 *
 * `seed-articles.json` est le contenu des trois pages HTML d'origine, converti
 * une fois pour toutes. Une fois l'injection faite et vérifiée, ce fichier et
 * les images public/img/article-*.webp n'ont plus de raison d'être dans le
 * dépôt : la source de vérité est Directus.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(resolve(ROOT, '.env'));
} catch {}

const URL_BASE = (process.env.DIRECTUS_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? '';

if (!URL_BASE || !TOKEN) {
  console.error('DIRECTUS_URL et DIRECTUS_ADMIN_TOKEN sont requis.');
  process.exit(1);
}

const entetes = { Authorization: `Bearer ${TOKEN}` };

async function api(methode, chemin, corps) {
  const reponse = await fetch(`${URL_BASE}${chemin}`, {
    method: methode,
    headers: { ...entetes, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  if (!reponse.ok) {
    throw new Error(
      `${methode} ${chemin} → HTTP ${reponse.status} ${(await reponse.text()).slice(0, 300)}`,
    );
  }
  return reponse.json().catch(() => ({}));
}

/**
 * Téléverse une image et renvoie son identifiant Directus.
 *
 * L'API attend du multipart. FormData et Blob sont fournis par Node depuis la
 * v18 : aucune bibliothèque n'est nécessaire pour construire la requête.
 */
async function televerser(cheminRelatif) {
  const chemin = resolve(ROOT, 'public', cheminRelatif.replace(/^\//, ''));
  const nom = basename(chemin);

  const formulaire = new FormData();
  formulaire.append('title', nom);
  formulaire.append('file', new Blob([readFileSync(chemin)], { type: 'image/webp' }), nom);

  const reponse = await fetch(`${URL_BASE}/files`, {
    method: 'POST',
    headers: entetes, // surtout pas de Content-Type : fetch pose la frontière multipart
    body: formulaire,
  });

  if (!reponse.ok) {
    throw new Error(
      `Téléversement de ${nom} → HTTP ${reponse.status} ${(await reponse.text()).slice(0, 300)}`,
    );
  }

  const { data } = await reponse.json();
  return data.id;
}

async function main() {
  const seed = JSON.parse(readFileSync(resolve(ROOT, 'scripts/seed-articles.json'), 'utf8'));

  /* Slugs déjà présents, pour ne rien écraser au second passage. */
  const { data: existants = [] } = await api('GET', '/items/articles?fields=slug&limit=-1');
  const deja = new Set(existants.map((a) => a.slug));

  for (const article of seed) {
    if (deja.has(article.slug)) {
      console.log(`${article.slug.padEnd(30)} déjà présent, ignoré`);
      continue;
    }

    const image = await televerser(article.image_fichier);

    await api('POST', '/items/articles', {
      status: article.status,
      date_publication: article.date_publication,
      titre: article.titre,
      titre_accent: article.titre_accent,
      slug: article.slug,
      categorie: article.categorie,
      lecture: article.lecture,
      image,
      image_alt: article.image_alt,
      chapo: article.chapo,
      corps: article.corps,
      description: article.description,
      og_description: article.og_description,
    });

    console.log(`${article.slug.padEnd(30)} créé (image ${image.slice(0, 8)}…)`);
  }

  console.log('\nInjection terminée. Vérifier dans Directus, puis lancer un build du site.');
}

main().catch((erreur) => {
  console.error(`\n✖ ${erreur.message}\n`);
  process.exit(1);
});
