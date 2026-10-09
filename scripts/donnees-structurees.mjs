/**
 * Données structurées (JSON-LD) du site.
 *
 * Rassemblées ici, et non écrites dans les pages, pour trois raisons :
 *  - les URLs y sont absolues, donc porteuses du domaine, qui n'est déclaré
 *    qu'une fois (site.mjs) ;
 *  - un même nœud — la personne — est référencé depuis plusieurs pages par son
 *    `@id`, ce qui n'a de sens que si toutes en donnent la même définition ;
 *  - ce balisage doit rester le reflet de ce que la page affiche. Le voir en un
 *    seul endroit permet de s'en assurer, ce qui est impossible quand il est
 *    recopié dans sept fichiers.
 *
 * La règle qui gouverne tout le fichier : **ne baliser que ce qui est visible
 * sur la page**. Un prix, une note, une date présents ici mais absents du
 * contenu valent au site la perte de son éligibilité aux résultats enrichis —
 * c'est la cause de la quasi-totalité des pénalités liées au balisage. D'où
 * l'absence de tarifs (aucun n'est affiché), d'avis (aucun n'est publié) et de
 * `Course` : sans tarif ni calendrier visible, un cours balisé n'est de toute
 * façon éligible à rien.
 *
 * Les schémas retenus sont ceux que Google exploite encore : `Person`,
 * `WebSite`, `Organization`, `BreadcrumbList`, `BlogPosting`. `FAQPage` et
 * `HowTo` n'affichent plus rien, `SearchAction` est abandonné depuis 2024 : ils
 * ne sont volontairement pas là.
 */

import { NOM, SITE } from './site.mjs';

const ID_PERSONNE = `${SITE}/#personne`;

/**
 * La personne — c'est une marque personnelle, il n'y a pas d'entreprise
 * chapeau. Déclarée à l'identique partout où elle est référencée, pour que les
 * moteurs fusionnent les nœuds au lieu d'en inventer deux.
 *
 * `sameAs` ne liste que des profils qui existent : un lien mort dessert. Les
 * URLs LinkedIn et YouTube sont encore des `#` dans le footer — elles entreront
 * ici quand le client les aura fournies.
 */
function personne({ complet = true } = {}) {
  if (!complet) return { '@type': 'Person', '@id': ID_PERSONNE, name: NOM, url: `${SITE}/` };

  return {
    '@type': 'Person',
    '@id': ID_PERSONNE,
    name: NOM,
    url: `${SITE}/`,
    jobTitle: 'Entrepreneur et investisseur',
    description: 'Entrepreneur, investisseur et développeur de projets.',
    image: `${SITE}/img/portrait.webp`,
    sameAs: ['https://www.instagram.com/jeanmaximehanny/'],
  };
}

function siteWeb() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE}/#site`,
    url: `${SITE}/`,
    name: NOM,
    inLanguage: 'fr-FR',
    publisher: { '@id': ID_PERSONNE },
  };
}

/**
 * Les trois activités, telles que leurs pages les présentent.
 *
 * `url` est le site de l'activité, `mainEntityOfPage` la page qui en parle
 * ici : ce sont deux choses différentes et les confondre fait disparaître le
 * lien entre les deux. `EducationalOrganization` est réservé aux deux activités
 * dont le métier est bien d'enseigner.
 */
const ACTIVITES = {
  'senior-ia': {
    type: 'EducationalOrganization',
    nom: 'Senior IA',
    route: '/senior-ia/',
    site: 'https://senioria.fr',
    description:
      "Senior IA forme les seniors à l'intelligence artificielle : ateliers en petit groupe, " +
      'accompagnement individuel à domicile et sessions en résidence.',
  },
  'ia-en-famille': {
    type: 'EducationalOrganization',
    nom: 'IA en famille',
    route: '/ia-en-famille/',
    site: 'https://iaenfamille.fr',
    description:
      "IA en famille initie parents, enfants et grands-parents à l'intelligence artificielle : " +
      'ateliers d\'initiation, formation en entreprise et programmes solidaires.',
  },
  businessbusiness: {
    type: 'Organization',
    nom: 'BusinessBusiness',
    route: '/businessbusiness/',
    site: 'https://businessbusiness.fr',
    description:
      "Média digital indépendant dédié à la finance, à l'investissement et à l'entrepreneuriat : " +
      'analyses, décryptages et formats pédagogiques.',
  },
};

function activite(clef) {
  const a = ACTIVITES[clef];
  return {
    '@type': a.type,
    '@id': `${SITE}${a.route}#activite`,
    name: a.nom,
    url: a.site,
    description: a.description,
    inLanguage: 'fr-FR',
    founder: personne({ complet: false }),
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${a.route}` },
  };
}

/**
 * Fil d'Ariane. Le dernier élément ne porte pas d'URL : c'est la page courante,
 * et la spécification demande de l'omettre.
 *
 * Le chemin doit exister réellement. D'où `/#articles` pour le niveau
 * « Articles » : il n'y a pas de page /articles/, et baliser un niveau qui
 * renvoie 404 revient à décrire une arborescence inventée.
 */
function filDAriane(segments) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: segments.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: s.nom,
      item: s.route ? `${SITE}${s.route}` : undefined,
    })),
  };
}

/** Un article. Appelé depuis articles.mjs, qui seul connaît les données. */
export function grapheArticle(a) {
  return [
    {
      '@type': 'BlogPosting',
      '@id': `${SITE}${a.url}#article`,
      headline: a.titreComplet,
      description: a.description,
      datePublished: a.dateIso,
      // Directus n'enregistre pas de date de modification : la date de
      // publication fait foi. Recalculer `dateModified` à chaque build
      // donnerait un signal de fraîcheur faux, que Google finit par ignorer.
      dateModified: a.dateIso,
      inLanguage: 'fr-FR',
      articleSection: a.categorie,
      image: `${SITE}${a.image}`,
      author: personne({ complet: false }),
      publisher: { '@id': ID_PERSONNE },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${a.url}` },
      isPartOf: { '@id': `${SITE}/#site` },
    },
    // Le même nœud que sur l'accueil, à l'identique : `isPartOf` le désigne
    // par son `@id`, et une référence vers un nœud qu'aucune page du graphe ne
    // définit ne décrit rien. Les moteurs fusionnent les deux déclarations.
    siteWeb(),
    filDAriane([
      { nom: 'Accueil', route: '/' },
      { nom: 'Articles', route: '/#articles' },
      { nom: a.titreComplet },
    ]),
  ];
}

/** Les graphes des pages écrites à la main, par nom de jeton `@jsonld`. */
const GRAPHES = {
  accueil: () => [personne(), siteWeb()],
  'senior-ia': () => [
    activite('senior-ia'),
    filDAriane([{ nom: 'Accueil', route: '/' }, { nom: 'Senior IA' }]),
  ],
  'ia-en-famille': () => [
    activite('ia-en-famille'),
    filDAriane([{ nom: 'Accueil', route: '/' }, { nom: 'IA en famille' }]),
  ],
  businessbusiness: () => [
    activite('businessbusiness'),
    filDAriane([{ nom: 'Accueil', route: '/' }, { nom: 'BusinessBusiness' }]),
  ],
};

/**
 * Le bloc `<script>` d'un graphe, indenté comme la ligne où il s'insère.
 *
 * `JSON.stringify` supprime les clés laissées à `undefined` : c'est ce qui
 * permet aux gabarits ci-dessus d'omettre proprement une donnée absente.
 */
export function rendreGraphe(donnees, indentation = '') {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': donnees }, null, 2)
    .split('\n')
    .join(`\n${indentation}  `);

  return `<script type="application/ld+json">\n${indentation}  ${json}\n${indentation}</script>`;
}

/** Résout le jeton `<!--@jsonld accueil-->`. */
export function rendreGrapheNomme(nom, indentation = '') {
  const graphe = GRAPHES[nom];
  if (!graphe) {
    throw new Error(
      `Jeton @jsonld inconnu : « ${nom} ». Les graphes disponibles sont ${Object.keys(GRAPHES).join(', ')} ` +
        '(voir scripts/donnees-structurees.mjs).',
    );
  }
  return rendreGraphe(graphe(), indentation);
}
