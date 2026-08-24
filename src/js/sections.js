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

  /* ---- Groupes en cascade ----
     Un seul ScrollTrigger par groupe : si chaque card avait le sien, elles se
     déclencheraient à des moments différents et la cascade disparaîtrait.
     `[data-stagger]` désigne ces groupes sur les pages activité ; les deux
     grilles de l'accueil sont nommées explicitement, elles préexistent à
     cette convention. */
  document
    .querySelectorAll('#entreprises .grid, #articles .grid, [data-stagger]')
    .forEach((group) => {
      revealOnScroll(group.querySelectorAll('[data-reveal]'), {
        trigger: group,
        stagger: 0.12,
        y: 34,
      });
    });

  /* ---- Bandeaux CTA : fondu avec un très léger zoom ---- */
  document.querySelectorAll('[data-reveal-scale]').forEach((cta) => {
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
  });
}
