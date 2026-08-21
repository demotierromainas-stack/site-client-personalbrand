import { gsap, revealOnScroll, prefersReducedMotion } from './motion.js';

/**
 * Animations des sections sous le hero.
 *
 * Elles soutiennent le hero, elles ne rivalisent pas avec lui : une seule
 * animation signature par page. Ici, tout est en entrée simple — le mouvement
 * sert à rythmer la descente, pas à attirer l'attention sur lui-même.
 */
export function initSections() {
  /* ---- Titres de section ----
     Déclenchés sur leur propre en-tête, pour que le titre soit posé avant
     que les cards n'arrivent. */
  document.querySelectorAll('section > div > header').forEach((header) => {
    revealOnScroll(header.querySelectorAll('[data-reveal]'), {
      trigger: header,
      stagger: 0.09,
    });
  });

  /* ---- Grilles de cards ----
     Un seul ScrollTrigger par grille : si chaque card avait le sien, elles se
     déclencheraient à des moments différents et la cascade disparaîtrait. */
  document.querySelectorAll('#entreprises .grid, #articles .grid').forEach((grid) => {
    revealOnScroll(grid.querySelectorAll('[data-reveal]'), {
      trigger: grid,
      stagger: 0.12,
      y: 34,
    });
  });

  /* ---- Bandeau CTA : fondu avec un très léger zoom ---- */
  const cta = document.querySelector('[data-reveal-scale]');
  if (!cta) return;

  if (prefersReducedMotion()) {
    gsap.set(cta, { opacity: 1, scale: 1 });
    return;
  }

  gsap.to(cta, {
    opacity: 1,
    scale: 1,
    duration: 1.1,
    ease: 'power3.out',
    scrollTrigger: { trigger: cta, start: 'top 88%', once: true },
  });
}
