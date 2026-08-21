import { gsap, revealNow, parallax, countUp, followPointer, prefersReducedMotion } from './motion.js';

/**
 * Hero — l'animation signature du site.
 *
 * Trois choses s'y superposent, dans cet ordre :
 *  1. une cascade d'entrée au chargement,
 *  2. une parallaxe verticale au scroll entre les trois plans,
 *  3. un suivi du curseur, en sens inverse entre fond et portrait.
 */
export function initHero() {
  const hero = document.querySelector('#hero');
  if (!hero) return;

  /* ---- 1. Cascade d'entrée ----
     Le décalage entre les éléments fait la différence entre « ça apparaît »
     et « ça se met en place ». Le bloc stats arrive en dernier, en fondu seul :
     il est large, le faire monter en même temps que le texte alourdit l'entrée. */
  const revealed = hero.querySelectorAll('[data-reveal]');
  const faded = hero.querySelectorAll('[data-reveal-fade]');

  if (prefersReducedMotion()) {
    // Pas de cascade : on pose l'état final directement.
    revealNow(revealed);
    gsap.set(faded, { opacity: 1 });
  } else {
    const tl = gsap.timeline({ delay: 0.15 });
    tl.add(revealNow(revealed, { stagger: 0.11 }));
    tl.to(faded, { opacity: 1, duration: 1.1, ease: 'power2.out' }, '-=0.35');
  }

  /* ---- 2. Parallaxe au scroll ----
     Le portrait et le contenu remontent à des vitesses différentes. Le décor,
     lui, est global (#site-bg) et dérive sur toute la page, pas seulement ici.
     Valeur positive = l'élément descend, donc défile plus lentement que la page. */
  parallax('[data-layer="portrait"]', 60, hero);
  parallax('[data-layer="content"]', -40, hero);

  /* ---- 3. Suivi du curseur ----
     Amplitudes volontairement minuscules (une dizaine de pixels) et sens opposé
     entre le décor et le portrait. Au-delà, l'effet devient visible en tant
     qu'effet, ce qui est exactement ce qu'on veut éviter.
     Le décor suit le curseur sur toute la page, pas uniquement dans le hero.
     Cible les wrappers internes : les externes portent déjà la parallaxe. */
  const bgPointer = document.querySelector('#site-bg-pointer');
  const portraitInner = hero.querySelector('[data-layer-inner="portrait"]');

  const layers = [];
  if (bgPointer) layers.push({ el: bgPointer, strength: 30 });
  if (portraitInner) layers.push({ el: portraitInner, strength: -16 });
  if (layers.length) followPointer(layers);

  /* ---- Compteurs ---- */
  countUp(hero.querySelectorAll('[data-count-to]'));
}
