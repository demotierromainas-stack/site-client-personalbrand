import { ScrollTrigger } from './motion.js';
import { initSmoothScroll, initAnchorLinks } from './lenis.js';
import { initHeader } from './header.js';
import { initHero } from './hero.js';
import { initSections } from './sections.js';
import { initSequence } from './sequence.js';
import { initCarousel } from './carousel.js';
import { initDecor } from './decor.js';

const lenis = initSmoothScroll();

initAnchorLinks(lenis);
initHeader();
initHero();
initSections();
initSequence();
initCarousel();
initDecor();

/* Les polices Google changent la hauteur du texte en arrivant, ce qui décale
   tous les points de déclenchement calculés avant. On recalcule une fois posées. */
if (document.fonts?.ready) {
  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
