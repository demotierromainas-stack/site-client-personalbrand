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
 * Le `.htaccess` servi à la racine du site.
 *
 * `RedirectMatch` plutôt que `Redirect` : ce dernier fonctionne par préfixe et
 * redirigerait aussi `/articles/investiravecvisionXYZ`. L'expression ancrée
 * accepte l'adresse avec ou sans barre finale, et rien d'autre.
 */
export function renderHtaccess() {
  if (REDIRECTIONS.length === 0) {
    return '# Aucune redirection à ce jour.\n';
  }

  const regles = REDIRECTIONS.map(({ de, vers, depuis }) => {
    const motif = `^${de.replace(/\/$/, '')}/?$`;
    return `  # ${depuis}\n  RedirectMatch 301 ${motif} ${vers}`;
  }).join('\n\n');

  return `# Fichier produit par le build (voir scripts/redirections.mjs).
# Toute modification faite directement sur le serveur sera écrasée au
# déploiement suivant : c'est dans le dépôt qu'il faut l'écrire.

<IfModule mod_alias.c>
${regles}
</IfModule>
`;
}
