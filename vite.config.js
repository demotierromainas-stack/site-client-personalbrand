import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { generateArticles } from './scripts/generate-articles.mjs';
import { renderHomeCards } from './scripts/articles.mjs';
import { SITE, NOM } from './scripts/site.mjs';
import { rendreGrapheNomme } from './scripts/donnees-structurees.mjs';
import { dateDuDernierCommit, renderRobots, renderSitemap } from './scripts/sitemap.mjs';
import { renderHtaccess } from './scripts/redirections.mjs';

const root = import.meta.dirname;
const partialsDir = resolve(root, 'src/partials');

/** `/chemin/du/depot/senior-ia/index.html` → `/senior-ia/`. */
function routeDuFichier(fichier) {
  const rel = relative(root, fichier).split(sep).join('/');
  return '/' + rel.replace(/index\.html$/, '');
}

/**
 * Inclusions HTML au build — `<!--@include header.html-->`.
 *
 * Le site partage le même décor de fond, le même header et le même footer entre
 * toutes ses pages. Recopier ces blocs dans chaque fichier garantissait qu'ils
 * divergeraient : le lien Calendly à lui seul apparaît quatre fois par page. Un
 * plugin de vingt lignes évite d'ajouter un moteur de templates (et une
 * dépendance) pour un besoin aussi simple.
 *
 * Le même plugin remplace `<!--@articles-->` par la grille de cards de
 * l'accueil, construite à partir des articles Directus : publier un article met
 * la section « Articles » à jour sans que personne ne touche à index.html.
 */
function htmlPartials(articles) {
  const INCLUDE = /<!--\s*@include\s+([\w./-]+)\s*-->/g;
  const ARTICLES = /<!--\s*@articles\s*-->/g;

  const render = (html, seen) =>
    html.replace(INCLUDE, (match, name) => {
      if (seen.has(name)) {
        throw new Error(`Inclusion circulaire détectée sur le partial « ${name} »`);
      }
      const file = resolve(partialsDir, name);
      if (!file.startsWith(partialsDir)) {
        throw new Error(`Partial hors de src/partials : « ${name} »`);
      }
      return render(readFileSync(file, 'utf8'), new Set(seen).add(name));
    });

  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => render(html.replace(ARTICLES, () => renderHomeCards(articles)), new Set()),
    },
    // Un partial n'est pas un module suivi par Vite : sans ça, le modifier en
    // dev ne rafraîchit rien.
    handleHotUpdate({ file, server }) {
      if (file.startsWith(partialsDir)) {
        server.ws.send({ type: 'full-reload' });
      }
    },
  };
}

/**
 * Les métadonnées que le build peut déduire tout seul, et les deux fichiers
 * que les moteurs vont chercher à la racine.
 *
 * Trois choses y sont centralisées, parce que les trois se sont déjà trompées
 * ou peuvent se tromper en silence :
 *
 * 1. `<!--@seo-->` (dans head.html) pose le canonical et og:url à partir du
 *    chemin de la page. Ces deux URLs étaient écrites à la main dans chaque
 *    page, et les quatre pages principales ont pointé pendant des mois vers
 *    jeanmaximehanny.com — un domaine sans serveur web. Déduites du chemin,
 *    elles ne peuvent plus désigner autre chose que la page elle-même.
 * 2. Les URLs d'images Open Graph sont rendues absolues. La spécification
 *    l'exige et plusieurs aperçus (LinkedIn en particulier) refusent un chemin
 *    relatif : les pages écrivent `/img/og/accueil.jpg`, le build complète.
 * 3. sitemap.xml, robots.txt et .htaccess sont émis dans dist/. `rsync
 *    --delete` efface du serveur ce que le build ne produit pas : un robots.txt
 *    ou un .htaccess déposé à la main chez l'hébergeur disparaîtrait au
 *    déploiement suivant, emportant les redirections avec lui.
 *
 * S'y ajoute `<!--@jsonld accueil-->`, qui pose les données structurées de la
 * page depuis scripts/donnees-structurees.mjs — même raison que le canonical :
 * elles portent des URLs absolues, et un balisage recopié dans sept pages
 * diverge du contenu dès la première correction.
 */
function metadonneesSeo(pages) {
  const SEO = /^([ \t]*)<!--\s*@seo\s*-->/gm;
  const JSONLD = /^([ \t]*)<!--\s*@jsonld\s+([\w-]+)\s*-->/gm;

  /** Les métadonnées d'une page qui se déduisent de son adresse. */
  const balises = (route) => [
    `<link rel="canonical" href="${SITE}${route}" />`,
    `<meta property="og:url" content="${SITE}${route}" />`,
    `<meta property="og:site_name" content="${NOM}" />`,
    // Sans cette ligne, X rogne l'image en vignette carrée.
    `<meta name="twitter:card" content="summary_large_image" />`,
  ];

  const absolutiser = (html) =>
    html.replace(/<meta\s[^>]*>/gi, (balise) => {
      if (!/(og:image(:url|:secure_url)?|twitter:image)/i.test(balise)) return balise;
      return balise.replace(/content=(["'])(\/[^"']*)\1/i, (_, q, chemin) => `content=${q}${SITE}${chemin}${q}`);
    });

  return {
    name: 'metadonnees-seo',
    transformIndexHtml: {
      // Après les inclusions : le jeton @seo vit dans head.html, qui n'est
      // présent qu'une fois les partials résolus.
      order: 'post',
      handler(html, ctx) {
        const route = routeDuFichier(ctx.filename);
        const avecMeta = html
          .replace(SEO, (_, indentation) => indentation + balises(route).join(`\n${indentation}`))
          .replace(JSONLD, (_, indentation, nom) => indentation + rendreGrapheNomme(nom, indentation));
        return absolutiser(avecMeta);
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(pages) });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: renderRobots() });
      this.emitFile({ type: 'asset', fileName: '.htaccess', source: renderHtaccess() });
    },
  };
}

/**
 * La configuration est asynchrone parce que la liste des pages à construire
 * n'est pas connue d'avance : elle vient de Directus. Les articles sont
 * récupérés et écrits sur le disque ici, avant que Vite ne lise ses entrées.
 *
 * En développement, le contenu est figé au démarrage du serveur : un article
 * publié pendant que `npm run dev` tourne n'apparaîtra qu'après un redémarrage.
 * C'est assumé — surveiller une base distante coûterait une scrutation
 * permanente pour un cas qui ne se produit qu'en production.
 */
export default defineConfig(async () => {
  const articles = await generateArticles();

  const entreesArticles = Object.fromEntries(
    articles.map((a) => [`article-${a.slug}`, resolve(root, 'articles', a.slug, 'index.html')]),
  );

  // Les pages écrites à la main. Leur `lastmod` vient de git : la date du
  // dernier commit qui a touché la page est la seule date de modification
  // vraie dont dispose le build (voir sitemap.mjs).
  const pagesStatiques = {
    index: resolve(root, 'index.html'),
    seniorIa: resolve(root, 'senior-ia/index.html'),
    businessbusiness: resolve(root, 'businessbusiness/index.html'),
    iaEnFamille: resolve(root, 'ia-en-famille/index.html'),
  };

  const pages = [
    ...Object.values(pagesStatiques).map((fichier) => ({
      route: routeDuFichier(fichier),
      lastmod: dateDuDernierCommit(fichier, root),
    })),
    // Un article modifié dans Directus garde sa date de publication : c'est le
    // seul jour que le CMS enregistre, et inventer mieux serait mentir.
    ...articles.map((a) => ({ route: a.url, lastmod: a.dateIso })),
  ];

  return {
    plugins: [htmlPartials(articles), metadonneesSeo(pages), tailwindcss()],
    server: { port: 5173, open: true },
    build: {
      // Les pages sont servies en URL propres (/senior-ia/) plutôt qu'en
      // /senior-ia.html : c'est la seule forme qui fonctionne à l'identique en
      // dev Vite et chez un hébergeur, sans règle de réécriture.
      rollupOptions: {
        input: { ...pagesStatiques, ...entreesArticles },
      },
      // Toutes les pages partagent le même bundle JS et CSS : le visiteur qui
      // passe de l'accueil à une page activité ne retélécharge rien.
      assetsInlineLimit: 4096,
    },
  };
});
