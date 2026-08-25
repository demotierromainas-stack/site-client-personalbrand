/**
 * Lecture des articles depuis Directus.
 *
 * Le site est statique : Directus n'est interrogé qu'au moment du build, jamais
 * par le navigateur d'un visiteur. Deux conséquences, qui sont les deux raisons
 * d'être de ce fichier :
 *
 *  - les images sont téléchargées et servies par le site, pas par Directus.
 *    Sinon chaque page appellerait le VPS à l'affichage, et le site tomberait
 *    avec lui — ce qui annulerait l'intérêt d'un site statique ;
 *  - la réponse de l'API est mise en cache sur le disque. Sans ça, `npm run
 *    dev` exigerait une connexion et un VPS allumé pour afficher la page
 *    d'accueil.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, '.cache/articles.json');
export const IMAGES_DIR = resolve(ROOT, 'public/img/articles');

/* Les variables vivent dans .env, non versionné. loadEnvFile est fourni par
   Node — inutile d'ajouter dotenv pour lire un fichier de dix lignes. */
try {
  process.loadEnvFile(resolve(ROOT, '.env'));
} catch {
  // Pas de .env : les variables viennent alors de l'environnement, ce qui est
  // le cas en intégration continue.
}

/* Les champs demandés à l'API. On les énumère plutôt que de tout prendre :
   la réponse reste lisible, et un champ ajouté côté Directus ne se met pas à
   circuler dans le build sans qu'on l'ait décidé. */
const CHAMPS = [
  'slug',
  'titre',
  'titre_accent',
  'categorie',
  'date_publication',
  'lecture',
  'image_alt',
  'chapo',
  'corps',
  'description',
  'og_description',
  'image.id',
  'image.type',
].join(',');

function config() {
  const url = (process.env.DIRECTUS_URL ?? '').replace(/\/+$/, '');
  const token = process.env.DIRECTUS_TOKEN ?? '';
  return { url, token };
}

/**
 * Récupère les articles publiés, du plus récent au plus ancien.
 *
 * Les brouillons sont écartés par l'API elle-même (`status = published`) : ils
 * ne descendent jamais jusqu'ici, et ne peuvent donc pas se retrouver en ligne
 * par accident.
 */
export async function fetchArticles() {
  const { url, token } = config();

  if (!url || !token) {
    return depuisLeCache(
      'DIRECTUS_URL ou DIRECTUS_TOKEN ne sont pas renseignés (voir env.example).',
    );
  }

  const requete =
    `${url}/items/articles` +
    `?fields=${CHAMPS}` +
    `&filter[status][_eq]=published` +
    `&sort=-date_publication` +
    `&limit=-1`;

  let reponse;
  try {
    reponse = await fetch(requete, { headers: { Authorization: `Bearer ${token}` } });
  } catch (cause) {
    return depuisLeCache(`Directus est injoignable à ${url} (${cause.message}).`);
  }

  if (!reponse.ok) {
    /* 401 et 403 ne sont pas des pannes réseau : le cache masquerait une
       erreur de configuration qu'il vaut mieux voir tout de suite. */
    const detail = reponse.status === 401 || reponse.status === 403
      ? 'jeton refusé — vérifier DIRECTUS_TOKEN et les droits de lecture de son utilisateur'
      : await reponse.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`Directus a répondu ${reponse.status} sur /items/articles — ${detail}`);
  }

  const { data } = await reponse.json();

  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(data, null, 2));

  return data;
}

/**
 * Repli sur la dernière réponse connue. Un build de production ne doit jamais
 * s'en contenter en silence : il publierait un contenu périmé sans que
 * personne ne le sache. En développement, au contraire, c'est ce qui permet de
 * travailler dans le train.
 */
function depuisLeCache(raison) {
  if (process.env.CI) {
    throw new Error(
      `${raison}\nEn intégration continue, le cache local n'est pas un repli acceptable : ` +
        'le site serait publié avec un contenu périmé.',
    );
  }

  if (!existsSync(CACHE)) {
    throw new Error(
      `${raison}\nAucun cache local disponible (.cache/articles.json) : impossible de construire le site.\n` +
        'Renseigner .env à partir de env.example, ou lancer un build une fois avec Directus accessible.',
    );
  }

  console.warn(`⚠ ${raison}\n  Reprise du dernier contenu connu (.cache/articles.json).`);
  return JSON.parse(readFileSync(CACHE, 'utf8'));
}

const EXTENSIONS = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
};

/**
 * Télécharge l'image d'un article et renvoie son chemin public.
 *
 * Le nom du fichier porte l'identifiant Directus : changer l'image d'un
 * article change donc son URL, et le navigateur du visiteur ne sert pas
 * l'ancienne depuis son cache.
 */
export async function syncImage(article) {
  const { url, token } = config();
  const image = article.image;

  if (!image?.id) {
    throw new Error(`L'article « ${article.slug} » n'a pas d'image de couverture.`);
  }

  const extension = EXTENSIONS[image.type] ?? 'jpg';
  const nom = `${article.slug}-${image.id.slice(0, 8)}.${extension}`;
  const chemin = resolve(IMAGES_DIR, nom);
  const cheminPublic = `/img/articles/${nom}`;

  if (existsSync(chemin)) return cheminPublic; // déjà téléchargée

  if (!url || !token) {
    throw new Error(
      `L'image de « ${article.slug} » n'est pas en cache et Directus n'est pas configuré.`,
    );
  }

  const reponse = await fetch(`${url}/assets/${image.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!reponse.ok) {
    throw new Error(`Téléchargement de l'image de « ${article.slug} » : HTTP ${reponse.status}`);
  }

  mkdirSync(IMAGES_DIR, { recursive: true });
  writeFileSync(chemin, Buffer.from(await reponse.arrayBuffer()));
  return cheminPublic;
}

/**
 * Retire les images dont plus aucun article ne se sert — image remplacée,
 * article supprimé. Sans ce ménage, le dossier grossit indéfiniment et chaque
 * déploiement emporte des fichiers morts.
 */
export function pruneImages(cheminsUtilises) {
  if (!existsSync(IMAGES_DIR)) return [];

  const gardes = new Set(cheminsUtilises.map((c) => c.split('/').pop()));
  const retires = [];

  for (const fichier of readdirSync(IMAGES_DIR)) {
    if (gardes.has(fichier)) continue;
    unlinkSync(resolve(IMAGES_DIR, fichier));
    retires.push(fichier);
  }

  return retires;
}
