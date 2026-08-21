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
 *   npm run shots              → localhost:5173 (serveur de dev)
 *   npm run shots -- <url>     → une autre URL (preview, prod)
 */

import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const OUT = 'shots';

/* Les trois largeurs du plan de test. deviceScaleFactor 2 pour juger la netteté
   du portrait et des vignettes, qui sont agrandis depuis la maquette. */
const VIEWPORTS = [
  { name: 'mobile', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
];

/* Positions de scroll, en fraction de la hauteur totale de page. Le hero est
   capturé deux fois : en haut, puis après un début de scroll, pour voir si les
   trois plans se sont bien décalés les uns par rapport aux autres. */
const STOPS = [
  { name: '1-hero', at: 0 },
  { name: '2-hero-parallax', at: 0.12 },
  { name: '3-entreprises', at: 0.35 },
  { name: '4-articles', at: 0.62 },
  { name: '5-cta-footer', at: 1 },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capture(browser, { name, ...contextOptions }, { reducedMotion = 'no-preference' } = {}) {
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

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // Laisse la cascade d'entrée du hero se terminer avant la première capture.
  await wait(2200);

  const suffix = reducedMotion === 'reduce' ? '-reduced' : '';
  const height = await page.evaluate(() => document.body.scrollHeight);

  for (const stop of STOPS) {
    const y = Math.round((height - contextOptions.viewport.height) * stop.at);

    // Lenis fait défiler la fenêtre pour de vrai : un scrollTo natif déclenche
    // donc bien l'événement scroll que ScrollTrigger écoute.
    await page.evaluate((target) => window.scrollTo({ top: target, behavior: 'instant' }), y);
    await wait(1400); // laisse les révélations au scroll se jouer

    await page.screenshot({ path: `${OUT}/${name}${suffix}-${stop.name}.png` });
  }

  await context.close();
  return problems;
}

const browser = await chromium.launch();

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const allProblems = [];

for (const viewport of VIEWPORTS) {
  const problems = await capture(browser, viewport);
  allProblems.push(...problems.map((p) => `[${viewport.name}] ${p}`));
  console.log(`✓ ${viewport.name}`);
}

// Une passe en mouvement réduit : tout doit rester visible et lisible.
const reducedProblems = await capture(browser, VIEWPORTS[2], { reducedMotion: 'reduce' });
allProblems.push(...reducedProblems.map((p) => `[reduced-motion] ${p}`));
console.log('✓ desktop (mouvement réduit)');

await browser.close();

console.log(`\nCaptures écrites dans ${OUT}/`);

if (allProblems.length) {
  console.log(`\n${allProblems.length} problème(s) détecté(s) :`);
  allProblems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
} else {
  console.log('Aucune erreur console, aucune requête échouée.');
}
