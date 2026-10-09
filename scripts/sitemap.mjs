/**
 * sitemap.xml et robots.txt, produits au build.
 *
 * Les deux fichiers sont générés plutôt qu'écrits à la main parce que la liste
 * des pages n'est pas connue d'avance : les pages article viennent de Directus.
 * Un sitemap recopié à la main oublierait le premier article publié par le
 * client, et une URL oubliée est une URL que personne ne va chercher.
 *
 * Ce module ne fait que transformer une liste de pages en texte. La liste, elle,
 * est construite dans vite.config.js, où les entrées de Rollup sont déjà
 * connues : les deux ne peuvent donc pas diverger.
 */

import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';

import { SITE } from './site.mjs';

/**
 * Date du dernier commit ayant touché un fichier, en AAAA-MM-JJ.
 *
 * `lastmod` n'a de valeur que s'il dit la vérité. La tentation est d'y mettre
 * la date du build : elle change à chaque déploiement, toutes les pages
 * paraissent modifiées en même temps, et Google cesse de se fier au signal.
 * La date du dernier commit touchant la page est la seule disponible ici qui
 * corresponde à une vraie modification de contenu.
 *
 * Renvoie null plutôt qu'une approximation quand git ne peut pas répondre :
 * dépôt superficiel (`actions/checkout` sans `fetch-depth: 0`), fichier non
 * versionné, git absent. Une balise `lastmod` omise ne coûte rien ; une
 * fausse, si.
 */
export function dateDuDernierCommit(fichier, racine) {
  try {
    const superficiel = execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: racine,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (superficiel === 'true') return null;

    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', relative(racine, fichier)], {
      cwd: racine,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * Le sitemap. `priority` et `changefreq` sont volontairement absents : Google
 * les ignore depuis des années, ils n'alourdissent le fichier que pour donner
 * l'illusion de piloter quelque chose.
 */
export function renderSitemap(pages) {
  const urls = pages
    .map(({ route, lastmod }) => {
      const loc = `    <loc>${SITE}${route}</loc>`;
      const modifie = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
      return `  <url>\n${loc}${modifie}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * Le robots.txt.
 *
 * Il est produit par le build, et non posé dans public/, pour une seule
 * raison : la ligne `Sitemap` porte le domaine, qui ne doit être écrit qu'à un
 * endroit (voir site.mjs).
 *
 * Il remplace celui que l'hébergeur avait laissé, qui portait un
 * `Crawl-delay: 10` — ignoré par Google, respecté par Bing, qui se limitait
 * donc à une page toutes les dix secondes sans que personne ne l'ait demandé.
 */
export function renderRobots() {
  return `# Le site entier est public.
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
}
