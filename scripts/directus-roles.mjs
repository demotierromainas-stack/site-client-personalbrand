/**
 * Crée les deux rôles dont le projet a besoin, et leurs droits.
 *
 *   DIRECTUS_URL=… DIRECTUS_ADMIN_TOKEN=… node scripts/directus-roles.mjs
 *
 * Idempotent : ce qui existe déjà est conservé.
 *
 * ┌────────────┬──────────────────────────────────────────────────────────────┐
 * │ Rédacteur  │ le client. Écrit ses articles, dépose ses images. Ne voit ni │
 * │            │ les réglages, ni les utilisateurs, ni les autres collections.│
 * ├────────────┼──────────────────────────────────────────────────────────────┤
 * │ Build      │ le site. Lecture seule sur les articles et les fichiers.     │
 * │            │ C'est son jeton qui part dans les secrets GitHub — jamais    │
 * │            │ celui d'un administrateur.                                   │
 * └────────────┴──────────────────────────────────────────────────────────────┘
 *
 * Depuis Directus 11, les droits ne sont plus portés par le rôle mais par une
 * « politique » qu'on rattache au rôle. D'où les trois objets créés à chaque
 * fois : une politique, ses permissions, et le lien vers le rôle.
 */

import { resolve, dirname } from 'node:path';
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

const PROFILS = [
  {
    role: 'Rédacteur',
    politique: 'Rédacteur — articles',
    description: "Rédige et publie les articles du site. N'a accès à rien d'autre.",
    icon: 'edit_note',
    app_access: true,
    droits: [
      // Tout sur les articles : c'est son travail.
      { collection: 'articles', actions: ['create', 'read', 'update', 'delete'] },
      // Les fichiers, pour déposer les images de couverture. Pas de suppression :
      // une image effacée pendant qu'un article l'utilise casserait le build.
      { collection: 'directus_files', actions: ['create', 'read', 'update'] },
      // Les dossiers, en lecture seule, pour naviguer dans la médiathèque.
      { collection: 'directus_folders', actions: ['read'] },
    ],
  },
  {
    role: 'Build',
    politique: 'Build — lecture seule',
    description: 'Compte technique du site. Lit les articles au moment du build.',
    icon: 'sync',
    /* Pas d'accès à l'interface : ce compte ne sert qu'à l'API. S'il était
       compromis, il ne donnerait rien de plus que ce que le site publie déjà. */
    app_access: false,
    droits: [
      { collection: 'articles', actions: ['read'] },
      { collection: 'directus_files', actions: ['read'] },
    ],
  },
];

async function main() {
  const { data: roles = [] } = await api('GET', '/roles?fields=id,name&limit=-1');
  const { data: politiques = [] } = await api('GET', '/policies?fields=id,name&limit=-1');

  for (const profil of PROFILS) {
    console.log(`\n── ${profil.role} ──`);

    /* 1. La politique, qui porte les droits. */
    let politique = politiques.find((p) => p.name === profil.politique);
    if (politique) {
      console.log(`  politique   déjà présente`);
    } else {
      const { data } = await api('POST', '/policies', {
        name: profil.politique,
        icon: profil.icon,
        description: profil.description,
        admin_access: false,
        app_access: profil.app_access,
      });
      politique = data;
      console.log(`  politique   créée`);
    }

    /* 2. Les permissions rattachées à cette politique. */
    const { data: existantes = [] } = await api(
      'GET',
      `/permissions?filter[policy][_eq]=${politique.id}&fields=collection,action&limit=-1`,
    );
    const deja = new Set(existantes.map((p) => `${p.collection}:${p.action}`));

    for (const { collection, actions } of profil.droits) {
      for (const action of actions) {
        if (deja.has(`${collection}:${action}`)) continue;
        await api('POST', '/permissions', {
          policy: politique.id,
          collection,
          action,
          /* Aucune restriction de ligne ni de champ : le rôle est déjà limité
             aux collections listées ci-dessus, affiner davantage compliquerait
             sans rien protéger de plus. */
          permissions: {},
          validation: {},
          presets: null,
          fields: ['*'],
        });
        console.log(`  droit       ${collection} → ${action}`);
      }
    }

    /* 3. Le rôle, et son rattachement à la politique. */
    let role = roles.find((r) => r.name === profil.role);
    if (role) {
      console.log(`  rôle        déjà présent`);
    } else {
      const { data } = await api('POST', '/roles', {
        name: profil.role,
        icon: profil.icon,
        description: profil.description,
      });
      role = data;
      console.log(`  rôle        créé`);
    }

    const { data: liens = [] } = await api(
      'GET',
      `/access?filter[role][_eq]=${role.id}&filter[policy][_eq]=${politique.id}&fields=id&limit=1`,
    );
    if (liens.length) {
      console.log(`  liaison     déjà en place`);
    } else {
      await api('POST', '/access', { role: role.id, policy: politique.id });
      console.log(`  liaison     rôle ↔ politique créée`);
    }
  }

  console.log(
    "\nRôles en place.\n" +
      "Reste à créer les deux utilisateurs, depuis Directus (Paramètres → Utilisateurs) :\n" +
      "  • le client, avec son adresse, rôle « Rédacteur » ;\n" +
      "  • un compte « build », rôle « Build », dont le jeton statique ira dans\n" +
      "    le secret GitHub DIRECTUS_TOKEN.",
  );
}

main().catch((erreur) => {
  console.error(`\n✖ ${erreur.message}\n`);
  process.exit(1);
});
