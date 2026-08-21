import Lenis from 'lenis';
import { gsap, ScrollTrigger, prefersReducedMotion } from './motion.js';

/**
 * Smooth scroll — le levier le plus fort du site sur la sensation perçue,
 * avant même la première animation.
 *
 * Deux points de câblage indispensables :
 *  1. Lenis doit notifier ScrollTrigger à chaque frame, sinon les déclencheurs
 *     se basent sur une position de scroll périmée et les animations partent
 *     en décalé.
 *  2. Lenis doit être avancé par le ticker de GSAP plutôt que par son propre
 *     requestAnimationFrame, sinon les deux boucles tournent indépendamment et
 *     la parallaxe tremble.
 */
export function initSmoothScroll() {
  // Sans mouvement réduit on ne détourne pas le scroll : on laisse le natif.
  if (prefersReducedMotion()) return null;

  const lenis = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    // Le tactile reste natif. Détourner le scroll tactile est la cause connue
    // des comportements erratiques de Lenis sur iOS Safari (rebond, inertie
    // doublée) et n'apporte rien : le scroll iOS est déjà fluide.
    syncTouch: false,
  });

  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000); // le ticker GSAP compte en secondes, Lenis en ms
  });
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

/**
 * Navigation par ancres passant par Lenis, pour que les liens du header
 * défilent avec la même inertie que le reste du site.
 */
export function initAnchorLinks(lenis) {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.getAttribute('href');
      if (!id) return;

      // Lien placeholder (réseaux sociaux en attente d'URL) : on neutralise,
      // sinon le navigateur remonte en haut de page.
      if (id === '#') {
        event.preventDefault();
        return;
      }

      const target = document.querySelector(id);
      if (!target) return;

      event.preventDefault();

      if (lenis) {
        lenis.scrollTo(target, { offset: -80 });
      } else {
        // Mouvement réduit : scroll natif, instantané ou lissé par le CSS.
        target.scrollIntoView({ block: 'start' });
      }
    });
  });
}
