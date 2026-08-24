/**
 * Captures de contrôle du site.
 *
 * Sert à deux choses :
 *  - vérifier la mise en page, les contrastes et le responsive sans ouvrir
 *    manuellement trois fenêtres à chaque modification ;
 *  - repérer les erreurs console, qui passent inaperçues sur un site où presque
 *    tout est piloté par du JavaScript.
 *
 * Ce que ce script NE peut PAS juger : la fluidité du smooth scroll, la
 * sensation de la parallaxe, la réaction au curseur. Ça se teste en vrai.
 *
 *   npm run shots                    → localhost:5173 (serveur de dev)
 *   npm run shots -- <url>           → une autre origine (preview, prod)
 *   npm run shots -- <url> procuve   → une seule page, par son nom
 */

import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const ORIGIN = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const ONLY = process.argv[3];
const OUT = 'shots';

/* Les sept pages du site. Les repères de scroll diffèrent d'une page à
   l'autre : ce sont des sections différentes, il n'y aurait aucun sens à
   capturer les mêmes fractions partout sous le même nom. */
const PAGES = [
  {
    name: 'accueil',
    path: '/',
    stops: ['hero', 'hero-parallax', 'entreprises', 'articles', 'cta-footer'],
  },
  {
    name: 'procuve',
    path: '/procuve/',
    stops: ['hero', 'mission', 'services', 'deroule', 'cta-footer'],
  },
  {
    name: 'businessbusiness',
    path: '/businessbusiness/',
    stops: ['hero', 'mission', 'formats', 'ligne', 'cta-footer'],
  },
  {
    name: 'ia-pour-tous',
    path: '/ia-pour-tous/',
    stops: ['hero', 'mission', 'programmes', 'parcours', 'cta-footer'],
  },
  {
    name: 'article-entreprendre',
    path: '/articles/entreprendre-en-2026/',
    stops: ['entete', 'debut-texte', 'milieu', 'fin-texte', 'suite-footer'],
  },
  {
    name: 'article-investir',
    path: '/articles/investir-avec-vision/',
    stops: ['entete', 'debut-texte', 'milieu', 'fin-texte', 'suite-footer'],
  },
  {
    name: 'article-ia',
    path: '/articles/ia-au-service-de-la-societe/',
    stops: ['entete', 'debut-texte', 'milieu', 'fin-texte', 'suite-footer'],
  },
].filter((page) => !ONLY || page.name === ONLY);

/* Les trois largeurs du plan de test. deviceScaleFactor 2 pour juger la netteté
   du portrait et des vignettes, qui sont agrandis depuis la maquette. */
const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
];

/* Positions de scroll, en fraction de la hauteur totale de page. Sur
   l'accueil, le deuxième arrêt sert à vérifier que les trois plans du hero se
   sont bien décalés les uns par rapport aux autres. */
const FRACTIONS = [0, 0.12, 0.35, 0.62, 1];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(browser, page_, { name, ...contextOptions }, { reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({ ...contextOptions, reducedMotion });
  const page = await context.newPage();

  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`exception: ${err.message}`));
  page.on('requestfailed', (req) => {
    problems.push(`requête échouée: ${req.url()} (${req.failure()?.errorText})`);
  });

  const response = await page.goto(ORIGIN + page_.path, { waitUntil: 'networkidle' });
  if (!response?.ok()) problems.push(`HTTP ${response?.status()} sur ${page_.path}`);
  await page.evaluate(() => document.fonts.ready);

  // Laisse la cascade d'entrée du hero se terminer avant la première capture.
  await wait(2200);

  const suffix = reducedMotion === 'reduce' ? '-reduced' : '';
  const height = await page.evaluate(() => document.body.scrollHeight);

  for (const [index, fraction] of FRACTIONS.entries()) {
    const y = Math.round((height - contextOptions.viewport.height) * fraction);

    // Lenis fait défiler la fenêtre pour de vrai : un scrollTo natif déclenche
    // donc bien l'événement scroll que ScrollTrigger écoute.
    await page.evaluate((target) => window.scrollTo({ top: target, behavior: 'instant' }), y);
    await wait(1400); // laisse les révélations au scroll se jouer

    const stop = `${index + 1}-${page_.stops[index]}`;
    await page.screenshot({ path: `${OUT}/${page_.name}-${name}${suffix}-${stop}.png` });
  }

  await context.close();
  return problems;
}

const browser = await chromium.launch();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const allProblems = [];

for (const page of PAGES) {
  for (const viewport of VIEWPORTS) {
    const problems = await capture(browser, page, viewport);
    allProblems.push(...problems.map((p) => `[${page.name}/${viewport.name}] ${p}`));
  }

  // Une passe en mouvement réduit : tout doit rester visible et lisible.
  const reduced = await capture(browser, page, VIEWPORTS[2], { reducedMotion: 'reduce' });
  allProblems.push(...reduced.map((p) => `[${page.name}/reduced-motion] ${p}`));

  console.log(`✓ ${page.name}`);
}

await browser.close();

console.log(`\nCaptures écrites dans ${OUT}/`);

if (allProblems.length) {
  console.log(`\n${allProblems.length} problème(s) détecté(s) :`);
  allProblems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
} else {
  console.log('Aucune erreur console, aucune requête échouée.');
}
