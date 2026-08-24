import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;
const partialsDir = resolve(root, 'src/partials');

/**
 * Inclusions HTML au build — `<!--@include header.html-->`.
 *
 * Le site fait désormais quatre pages qui partagent le même décor de fond, le
 * même header et le même footer. Recopier ces trois blocs dans chaque fichier
 * garantissait qu'ils divergeraient : le lien Calendly à lui seul apparaît
 * quatre fois par page. Un plugin de vingt lignes évite d'ajouter un moteur de
 * templates (et une dépendance) pour un besoin aussi simple.
 *
 * Les inclusions sont résolues récursivement, avec garde contre les cycles.
 */
function htmlPartials() {
  const INCLUDE = /<!--\s*@include\s+([\w./-]+)\s*-->/g;

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
      handler: (html) => render(html, new Set()),
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

export default defineConfig({
  plugins: [htmlPartials(), tailwindcss()],
  server: { port: 5173, open: true },
  build: {
    // Les pages sont servies en URL propres (/procuve/) plutôt qu'en
    // /procuve.html : c'est la seule forme qui fonctionne à l'identique en dev
    // Vite et sur Netlify, sans règle de réécriture.
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        procuve: resolve(root, 'procuve/index.html'),
        businessbusiness: resolve(root, 'businessbusiness/index.html'),
        iaPourTous: resolve(root, 'ia-pour-tous/index.html'),
        articleEntreprendre: resolve(root, 'articles/entreprendre-en-2026/index.html'),
        articleInvestir: resolve(root, 'articles/investir-avec-vision/index.html'),
        articleIa: resolve(root, 'articles/ia-au-service-de-la-societe/index.html'),
      },
    },
    // Toutes les pages partagent le même bundle JS et CSS : le visiteur qui
    // passe de l'accueil à une page activité ne retélécharge rien.
    assetsInlineLimit: 4096,
  },
});
