import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { generateArticles } from './scripts/generate-articles.mjs';
import { renderHomeCards } from './scripts/articles.mjs';

const root = import.meta.dirname;
const partialsDir = resolve(root, 'src/partials');

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

  return {
    plugins: [htmlPartials(articles), tailwindcss()],
    server: { port: 5173, open: true },
    build: {
      // Les pages sont servies en URL propres (/procuve/) plutôt qu'en
      // /procuve.html : c'est la seule forme qui fonctionne à l'identique en
      // dev Vite et chez un hébergeur, sans règle de réécriture.
      rollupOptions: {
        input: {
          index: resolve(root, 'index.html'),
          procuve: resolve(root, 'procuve/index.html'),
          businessbusiness: resolve(root, 'businessbusiness/index.html'),
          iaPourTous: resolve(root, 'ia-pour-tous/index.html'),
          ...entreesArticles,
        },
      },
      // Toutes les pages partagent le même bundle JS et CSS : le visiteur qui
      // passe de l'accueil à une page activité ne retélécharge rien.
      assetsInlineLimit: 4096,
    },
  };
});
