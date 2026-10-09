/**
 * Redirections permanentes, produites au build dans `.htaccess`.
 *
 * Elles sont générées et non déposées à la main sur le serveur pour une raison
 * qui ne pardonne pas : `rsync --delete` efface de l'hébergement tout ce que le
 * build ne produit pas. Un `.htaccess` écrit directement chez Infomaniak
 * survivrait jusqu'au déploiement suivant, puis disparaîtrait sans bruit — et
 * une redirection disparue ne se voit pas, elle se compte en trafic perdu.
 *
 * Une URL qui a été en ligne ne se supprime pas : elle se redirige. Un lien
 * partagé, un signet, une page de résultats Google continuent de la demander
 * des mois après. Sans redirection, chacun de ces visiteurs tombe sur une
 * erreur, et le crédit accumulé par l'ancienne adresse n'est pas transmis à la
 * nouvelle.
 *
 * Le contrôle SEO vérifie les deux dangers de cette liste : qu'une source
 * redirigée ne soit pas encore produite par le build (la redirection
 * masquerait une page vivante), et que chaque cible existe bien (une
 * redirection vers une page absente transforme une erreur en deux).
 */

import { SITE } from './site.mjs';

/**
 * `de` est l'ancienne adresse, `vers` la nouvelle. Les deux portent leur barre
 * finale, comme toutes les URLs du site.
 */
export const REDIRECTIONS = [
  {
    de: '/articles/investiravecvision/',
    vers: '/articles/investir-avec-vision/',
    // Le client a écrit sa propre version de l'article en créant une seconde
    // fiche dans Directus plutôt qu'en modifiant la première. Les deux pages
    // ont été publiées simultanément, avec le même titre, et se sont
    // concurrencées sur la même requête. Le texte a été repris dans la fiche
    // d'origine, qui garde le slug lisible et l'antériorité ; celle-ci est
    // dépubliée.
    depuis: '2026-10-09',
  },
];

/**
 * Une seule adresse pour une seule page.
 *
 * Le site répondait 200 sur quatre adresses — avec et sans `www`, en `http` et
 * en `https` — sans jamais rediriger. Les balises `canonical` disaient déjà
 * laquelle fait foi, et Google aurait fini par consolider ; mais tant que les
 * quatre répondent, un lien partagé, une propriété Search Console ou un
 * annuaire peuvent désigner n'importe laquelle, et le crédit se disperse.
 *
 * Deux règles séparées plutôt qu'une seule avec un `[OR]` : dans mod_rewrite,
 * les conditions se combinent de gauche à droite et un `[OR]` au milieu d'une
 * suite ne regroupe pas ce qu'on croit. Deux règles indépendantes se lisent, et
 * surtout se raisonnent.
 *
 * Le danger d'une redirection vers https est la boucle : si l'hébergeur termine
 * le TLS en amont d'Apache, `%{HTTPS}` vaut `off` même sur une requête
 * sécurisée, et le serveur se redirige indéfiniment vers lui-même — le site
 * devient inaccessible. D'où trois gardes au lieu d'une : la règle n'agit que
 * si le port est 80, que `%{HTTPS}` n'est pas `on`, et que le mandataire n'a
 * pas annoncé `X-Forwarded-Proto: https`. Il faudrait que les trois signaux
 * manquent en même temps pour boucler.
 */
function hoteCanonique() {
  const hote = new URL(SITE).host;

  return `<IfModule mod_rewrite.c>
  RewriteEngine On

  # Tout autre hôte — www en tête — vers le domaine nu. Sans risque de boucle :
  # la cible ne peut pas satisfaire la condition qui déclenche la règle.
  RewriteCond %{HTTP_HOST} !^${hote.replace(/\./g, '\\.')}$ [NC]
  RewriteRule ^ ${SITE}%{REQUEST_URI} [L,R=301]

  # http vers https, sous trois gardes (voir le commentaire du module).
  RewriteCond %{SERVER_PORT} =80
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !=https
  RewriteRule ^ ${SITE}%{REQUEST_URI} [L,R=301]
</IfModule>`;
}

/**
 * Le `.htaccess` servi à la racine du site.
 *
 * `RedirectMatch` plutôt que `Redirect` : ce dernier fonctionne par préfixe et
 * redirigerait aussi `/articles/investiravecvisionXYZ`. L'expression ancrée
 * accepte l'adresse avec ou sans barre finale, et rien d'autre.
 *
 * Les cibles sont absolues. mod_alias agit avant mod_rewrite : une cible
 * relative demandée depuis `http://www.` renverrait vers `http://www.`, et il
 * faudrait un second aller-retour pour atteindre l'adresse canonique. Écrite en
 * absolu, la chaîne se termine en un saut.
 */
export function renderHtaccess() {
  const regles = REDIRECTIONS.map(({ de, vers, depuis }) => {
    const motif = `^${de.replace(/\/$/, '')}/?$`;
    return `  # ${depuis}\n  RedirectMatch 301 ${motif} ${SITE}${vers}`;
  }).join('\n\n');

  const anciennesAdresses = REDIRECTIONS.length
    ? `\n\n<IfModule mod_alias.c>\n${regles}\n</IfModule>`
    : '\n\n# Aucune ancienne adresse à rediriger à ce jour.';

  return `# Fichier produit par le build (voir scripts/redirections.mjs).
# Toute modification faite directement sur le serveur sera écrasée au
# déploiement suivant : c'est dans le dépôt qu'il faut l'écrire.

${hoteCanonique()}${anciennesAdresses}
`;
}
