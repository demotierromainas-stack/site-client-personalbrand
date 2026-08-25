/**
 * Crée la collection « articles » et ses champs dans Directus.
 *
 * À lancer une fois, après la première installation, avec un jeton
 * d'administrateur :
 *
 *   DIRECTUS_URL=https://cms.example.com DIRECTUS_ADMIN_TOKEN=xxx \
 *     node scripts/directus-setup.mjs
 *
 * Le script est idempotent : relancé, il ignore ce qui existe déjà et n'ajoute
 * que ce qui manque. On peut donc le rejouer après avoir ajouté un champ ici,
 * sans rien casser de ce que le client a déjà écrit.
 *
 * Pourquoi un script plutôt que la souris : le schéma fait partie du code du
 * site. Le HTML produit attend `titre_accent`, `chapo`, `date_publication` —
 * si quelqu'un renomme un champ dans l'interface, le build casse. Le décrire
 * ici, versionné à côté du gabarit qui le consomme, rend ce lien explicite et
 * permet de recréer l'instance à l'identique.
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
  console.error(
    'DIRECTUS_URL et DIRECTUS_ADMIN_TOKEN sont requis.\n' +
      "Le jeton d'administration se crée sur la fiche de l'utilisateur admin, dans Directus.",
  );
  process.exit(1);
}

async function api(methode, chemin, corps) {
  const reponse = await fetch(`${URL_BASE}${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(corps ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corps ? { body: JSON.stringify(corps) } : {}),
  });

  if (reponse.ok) return reponse.json().catch(() => ({}));

  const texte = await reponse.text().catch(() => '');
  const erreur = new Error(`${methode} ${chemin} → HTTP ${reponse.status} ${texte.slice(0, 300)}`);
  erreur.status = reponse.status;
  erreur.texte = texte;
  throw erreur;
}

const CATEGORIES = ['Stratégie', 'Finance', 'Technologie'];

/* L'ordre compte : c'est celui dans lequel les champs apparaîtront au client
   quand il rédigera. On va donc du plus structurant au plus accessoire, et le
   corps de l'article est placé après tout ce qui le décrit. */
const CHAMPS = [
  {
    field: 'status',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      display: 'labels',
      width: 'half',
      note: "Tant qu'un article est en brouillon, il n'existe nulle part sur le site.",
      options: {
        choices: [
          { text: 'Brouillon', value: 'draft' },
          { text: 'Publié', value: 'published' },
          { text: 'Archivé', value: 'archived' },
        ],
      },
      display_options: {
        choices: [
          { text: 'Brouillon', value: 'draft', foreground: '#FFFFFF', background: '#A2B5CD' },
          { text: 'Publié', value: 'published', foreground: '#FFFFFF', background: '#2ECDA7' },
          { text: 'Archivé', value: 'archived', foreground: '#FFFFFF', background: '#E35169' },
        ],
      },
    },
    schema: { default_value: 'draft', is_nullable: false },
  },
  {
    field: 'date_publication',
    type: 'date',
    meta: {
      interface: 'datetime',
      width: 'half',
      required: true,
      note: "Détermine l'ordre des articles, du plus récent au plus ancien.",
    },
    schema: { is_nullable: false },
  },
  {
    field: 'titre',
    type: 'string',
    meta: {
      interface: 'input',
      required: true,
      note: 'Première partie du titre, affichée en blanc. Le titre du site est coupé en deux lignes.',
      options: { placeholder: 'Investir avec vision :' },
    },
    schema: { is_nullable: false },
  },
  {
    field: 'titre_accent',
    type: 'string',
    meta: {
      interface: 'input',
      note: 'Deuxième ligne du titre, affichée en cuivre. Peut rester vide.',
      options: { placeholder: 'principes et discipline' },
    },
  },
  {
    field: 'slug',
    type: 'string',
    meta: {
      interface: 'input',
      required: true,
      note: "L'adresse de l'article : /articles/<slug>/. En minuscules, sans accent ni espace. Ne plus le changer une fois l'article publié — les liens partagés cesseraient de fonctionner.",
      options: { slug: true, placeholder: 'investir-avec-vision' },
    },
    schema: { is_nullable: false, is_unique: true },
  },
  {
    field: 'categorie',
    type: 'string',
    meta: {
      interface: 'select-dropdown',
      width: 'half',
      required: true,
      options: { choices: CATEGORIES.map((c) => ({ text: c, value: c })) },
    },
    schema: { is_nullable: false },
  },
  {
    field: 'lecture',
    type: 'integer',
    meta: {
      interface: 'input',
      width: 'half',
      note: 'Facultatif. Laissé vide, le temps de lecture est calculé à partir de la longueur du texte.',
      options: { min: 1 },
    },
  },
  {
    field: 'image',
    type: 'uuid',
    meta: {
      interface: 'file-image',
      special: ['file'],
      required: true,
      note: "Format paysage large, environ 1480 × 500 px. Elle apparaît sur l'accueil, en tête de l'article et lors d'un partage sur les réseaux sociaux.",
    },
    /* Obligatoire à la saisie (meta.required) mais nullable en base : la clé
       étrangère vers les fichiers est en ON DELETE SET NULL, ce qu'une colonne
       NOT NULL refuserait. Supprimer une image de la médiathèque ferait alors
       échouer la suppression au lieu de vider le champ. */
    schema: { is_nullable: true },
  },
  {
    field: 'image_alt',
    type: 'string',
    meta: {
      interface: 'input',
      required: true,
      note: "Ce que montre l'image, en une phrase. Lu par les personnes malvoyantes et affiché si l'image ne charge pas.",
    },
    schema: { is_nullable: false },
  },
  {
    field: 'chapo',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      required: true,
      note: "Le paragraphe d'introduction, affiché en gros sous le titre. Deux à quatre phrases.",
    },
    schema: { is_nullable: false },
  },
  {
    field: 'corps',
    type: 'text',
    meta: {
      interface: 'input-rich-text-md',
      required: true,
      note: 'Le corps de l\'article. Les intertitres (##) structurent la lecture : un tous les trois ou quatre paragraphes.',
      /* Éditeur Markdown et non WYSIWYG : la mise en page du site style un jeu
         de balises précis, et un éditeur riche laisse passer du HTML arbitraire
         qui s'afficherait hors charte. */
      options: {
        toolbar: ['bold', 'italic', 'blockquote', 'heading', 'bullist', 'numlist', 'link'],
      },
    },
    schema: { is_nullable: false },
  },
  {
    field: 'description',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      note: 'Facultatif. Le texte affiché sous le lien dans les résultats Google, environ 150 caractères. Vide, le chapô est utilisé.',
    },
  },
  {
    field: 'og_description',
    type: 'text',
    meta: {
      interface: 'input-multiline',
      note: 'Facultatif. Version courte affichée lors d\'un partage sur LinkedIn ou X. Vide, la description ci-dessus est utilisée.',
    },
  },
];

async function main() {
  /* Collection. Directus crée tout seul la clé primaire `id`. */
  try {
    await api('POST', '/collections', {
      collection: 'articles',
      meta: {
        icon: 'article',
        note: 'Les réflexions publiées sur jeanmaximehanny.fr',
        display_template: '{{titre}} {{titre_accent}}',
        sort_field: 'date_publication',
        archive_field: 'status',
        archive_value: 'archived',
        unarchive_value: 'draft',
      },
      schema: { name: 'articles' },
    });
    console.log('collection « articles » créée');
  } catch (erreur) {
    /* Directus répond 400 avec RECORD_NOT_UNIQUE quand la collection existe
       déjà : ce n'est pas une panne, c'est le cas nominal d'un second passage. */
    if (erreur.texte?.includes('already exists') || erreur.status === 400) {
      console.log('collection « articles » : déjà présente, conservée');
    } else {
      throw erreur;
    }
  }

  /* Champs existants, pour n'ajouter que ce qui manque. */
  const { data: presents = [] } = await api('GET', '/fields/articles').catch(() => ({ data: [] }));
  const deja = new Set(presents.map((c) => c.field));

  for (const champ of CHAMPS) {
    if (deja.has(champ.field)) {
      console.log(`  champ ${champ.field.padEnd(18)} déjà présent`);
      continue;
    }
    await api('POST', '/fields/articles', champ);
    console.log(`  champ ${champ.field.padEnd(18)} créé`);
  }

  /* La relation entre articles.image et la bibliothèque de fichiers. Créer le
     champ ne suffit pas : sans cette déclaration, Directus traite la colonne
     comme un texte, l'API ne sait pas étendre `image.id`, et le sélecteur
     d'image de l'interface ne fonctionne pas. */
  const { data: relations = [] } = await api('GET', '/relations/articles').catch(() => ({ data: [] }));

  if (relations.some((r) => r.field === 'image')) {
    console.log('  relation image      déjà présente');
  } else {
    /* Le champ a pu être créé NOT NULL par une version antérieure de ce
       script : on le rend nullable avant de poser la clé étrangère. */
    await api('PATCH', '/fields/articles/image', { schema: { is_nullable: true } });
    await api('POST', '/relations', {
      collection: 'articles',
      field: 'image',
      related_collection: 'directus_files',
      schema: { on_delete: 'SET NULL' },
      meta: { sort_field: null },
    });
    console.log('  relation image      créée');
  }

  console.log(
    '\nSchéma en place.\n' +
      'Étapes suivantes :\n' +
      '  1. créer le rôle « Rédacteur » et n\'y autoriser que la collection articles ;\n' +
      '  2. créer l\'utilisateur du client avec ce rôle ;\n' +
      '  3. créer un utilisateur « build » en lecture seule et copier son jeton statique\n' +
      '     dans le secret GitHub DIRECTUS_TOKEN.',
  );
}

main().catch((erreur) => {
  console.error(`\n✖ ${erreur.message}\n`);
  process.exit(1);
});
