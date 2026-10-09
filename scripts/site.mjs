/**
 * Identité du site, déclarée une seule fois.
 *
 * Le domaine apparaît dans les canonical, les URLs Open Graph, le sitemap, le
 * robots.txt et les données structurées. Cinq endroits qui doivent dire la
 * même chose : s'ils divergent, on demande à Google d'indexer une adresse
 * qu'on ne sert pas, et les vraies pages sortent de l'index. C'est arrivé —
 * les quatre pages écrites à la main annonçaient `jeanmaximehanny.com`, qui ne
 * résout sur aucun serveur web (le .com ne porte que la messagerie).
 *
 * Le site est servi sur .fr : c'est la cible du rsync et l'URL contrôlée après
 * déploiement (voir .github/workflows/deploy.yml). Changer de domaine se fait
 * ici, et le contrôle SEO (`npm run seo`) refuse de passer si une page dit
 * autre chose.
 */
export const SITE = 'https://jeanmaximehanny.fr';

/** Le nom affiché du site, pour og:site_name et les données structurées. */
export const NOM = 'Jean-Maxime Hanny';

/** L'image de partage servie aux pages qui n'en déclarent pas. */
export const IMAGE_PARTAGE = '/img/og/accueil.jpg';
