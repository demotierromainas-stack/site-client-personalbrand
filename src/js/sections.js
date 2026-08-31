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

  /* ---- Rails de parcours : le fil se remplit à mesure qu'on descend ----
     En `scrub` et non en révélation : le remplissage doit suivre la position
     du lecteur dans la liste, pas se déclencher une fois pour toutes à
     l'entrée. La course va de l'arrivée du rail au tiers bas de l'écran
     jusqu'à sa sortie par le tiers haut — soit très exactement le temps
     pendant lequel il est lisible. */
  document.querySelectorAll('[data-rail]').forEach((rail) => {
    const fill = rail.querySelector('[data-rail-fill]');
    if (!fill) return;

    if (prefersReducedMotion()) {
      gsap.set(fill, { scaleY: 1 });
      return;
    }

    gsap.to(fill, {
      scaleY: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: rail,
        start: 'top 70%',
        end: 'bottom 65%',
        scrub: 0.4,
      },
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
