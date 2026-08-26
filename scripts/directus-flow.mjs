/**
 * Crée le flux Directus qui redéclenche la construction du site.
 *
 *   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node scripts/directus-flow.mjs
 *
 * Pourquoi ce flux existe : les pages sont produites au build. Un article
 * publié dans Directus n'apparaît donc nulle part tant que le site n'a pas été
 * reconstruit. Ce flux appelle GitHub à chaque changement, ce qui déclenche le
 * workflow de déploiement — et rend le client réellement autonome.
 *
 * Le jeton GitHub n'est PAS écrit ici. Le flux est créé avec un marqueur, à
 * remplacer dans l'interface Directus : un jeton d'écriture sur le dépôt n'a
 * rien à faire dans un fichier versionné.
 *
 * Idempotent : si le flux existe déjà, il est laissé tel quel.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(resolve(ROOT, '.env'));
} catch {}

const URL_BASE = (process.env.DIRECTUS_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? '';
const DEPOT = 'demotierromainas-stack/site-client-personalbrand';
const MARQUEUR = 'REMPLACER_PAR_LE_JETON_GITHUB';

if (!URL_BASE || !TOKEN) {
  console.error('DIRECTUS_URL et DIRECTUS_ADMIN_TOKEN sont requis.');
  process.exit(1);
}

async function api(methode, chemin, corps) {
  const reponse = await fetch(`${URL_BASE}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });
  if (!reponse.ok) {
    throw new Error(`${methode} ${chemin} → HTTP ${reponse.status} ${(await reponse.text()).slice(0, 300)}`);
  }
  return reponse.json().catch(() => ({}));
}

const NOM = 'Reconstruire le site';

async function main() {
  const { data: flux = [] } = await api('GET', '/flows?fields=id,name&limit=-1');
  if (flux.some((f) => f.name === NOM)) {
    console.log(`Le flux « ${NOM} » existe déjà — rien à faire.`);
    return;
  }

  /* Déclencheur : tout changement sur un article. On écoute aussi la
     suppression et la modification, pas seulement la création : dépublier un
     article doit retirer sa page du site aussi sûrement que le publier l'y
     ajoute. */
  const { data: flow } = await api('POST', '/flows', {
    name: NOM,
    icon: 'sync',
    color: '#2ECDA7',
    description: "Appelle GitHub à chaque changement d'article pour reconstruire et redéployer le site.",
    status: 'active',
    trigger: 'event',
    /* « action » : le flux se déclenche après l'enregistrement, sans le
       bloquer. Le client n'attend jamais la reconstruction pour voir son
       article enregistré. */
    accountability: 'all',
    options: {
      type: 'action',
      scope: ['items.create', 'items.update', 'items.delete'],
      collections: ['articles'],
    },
  });

  const { data: operation } = await api('POST', '/operations', {
    flow: flow.id,
    name: 'Appeler GitHub',
    key: 'github_dispatch',
    type: 'request',
    position_x: 19,
    position_y: 1,
    options: {
      method: 'POST',
      url: `https://api.github.com/repos/${DEPOT}/dispatches`,
      headers: [
        { header: 'Authorization', value: `Bearer ${MARQUEUR}` },
        { header: 'Accept', value: 'application/vnd.github+json' },
        /* GitHub refuse les requêtes sans User-Agent. */
        { header: 'User-Agent', value: 'directus-flow' },
      ],
      body: JSON.stringify({ event_type: 'directus-publish' }),
    },
  });

  await api('PATCH', `/flows/${flow.id}`, { operation: operation.id });

  console.log(
    `Flux « ${NOM} » créé.\n\n` +
      'Dernière étape, à faire dans Directus :\n' +
      '  Paramètres → Flows → « Reconstruire le site » → opération « Appeler GitHub »\n' +
      `  → en-tête Authorization : remplacer ${MARQUEUR} par le jeton GitHub.\n`,
  );
}

main().catch((erreur) => {
  console.error(`\n✖ ${erreur.message}\n`);
  process.exit(1);
});
