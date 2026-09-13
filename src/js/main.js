import { gsap, ScrollTrigger, prefersReducedMotion, isTouchDevice } from './motion.js';
import { initSmoothScroll, initAnchorLinks } from './lenis.js';
import { initHeader } from './header.js';
import { initHero } from './hero.js';
import { initSections } from './sections.js';
import { initSequence } from './sequence.js';
import { initCarousel } from './carousel.js';

const lenis = initSmoothScroll();

initAnchorLinks(lenis);
initHeader();
initHero();
initSections();
initSequence();
initCarousel();
initBackgroundDrift();

/**
 * Le décor de fond est en position fixe : sans rien de plus, il resterait
 * strictement identique du haut au bas de la page. Une dérive lente le fait
 * évoluer d'une section à l'autre, ce qui donne l'impression de traverser un
 * décor plutôt que de faire défiler du contenu devant une image figée.
 *
 * Amplitude faible (-9 %) et calée sur toute la hauteur du document.
 *
 * Absente sur tactile : déplacer à chaque frame une couche plus haute que
 * l'écran, qui porte les lueurs du décor, fait saccader le scroll des
 * téléphones. Le décor y reste fixe, et le contenu qui défile devant suffit à
 * donner la profondeur.
 */
function initBackgroundDrift() {
  const layer = document.querySelector('#site-bg-scroll');
  if (!layer || prefersReducedMotion() || isTouchDevice()) return;

  gsap.to(layer, {
    yPercent: -9,
    ease: 'none',
    scrollTrigger: {
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
    },
  });
}

/* Les polices Google changent la hauteur du texte en arrivant, ce qui décale
   tous les points de déclenchement calculés avant. On recalcule une fois posées. */
if (document.fonts?.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
