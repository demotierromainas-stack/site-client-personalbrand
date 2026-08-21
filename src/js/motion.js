import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* ============================================================
   GARDE MOUVEMENT RÉDUIT
   Un seul point de vérité pour tout le site. Chaque helper sort
   immédiatement en posant l'état final, sans jamais animer.
   ============================================================ */

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export const prefersReducedMotion = () => reducedMotionQuery.matches;

/** Pose l'état final (visible, non déplacé) sans animation. */
const settle = (targets) => {
  gsap.set(targets, { opacity: 1, y: 0, x: 0, scale: 1, clearProps: 'transform' });
};

/* ============================================================
   VOCABULAIRE DE MOUVEMENT
   Amplitudes faibles, easings sortants longs. Ces constantes sont
   la raison pour laquelle le site paraît cohérent d'une section à l'autre.
   ============================================================ */

export const EASE = 'power3.out';
export const DURATION = 0.9;
export const STAGGER = 0.1;

/** Le déclencheur par défaut : l'élément entre dans le tiers bas du viewport. */
const defaultTrigger = (el) => ({
  trigger: el,
  start: 'top 85%',
  once: true,
});

/* ============================================================
   HELPERS
   ============================================================ */

/**
 * Révèle des éléments au scroll, un par un, en cascade.
 * Les éléments d'un même groupe partagent un seul ScrollTrigger, sinon
 * chacun se déclencherait à un moment différent et la cascade serait perdue.
 *
 * @param {string|Element|Element[]} targets
 * @param {object} [options]
 * @param {Element} [options.trigger] Élément déclencheur (défaut : le premier target)
 * @param {number} [options.y] Décalage vertical de départ, en px
 * @param {number} [options.stagger] Décalage entre chaque élément, en secondes
 * @param {number} [options.delay]
 */
export function revealOnScroll(targets, options = {}) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return null;

  if (prefersReducedMotion()) {
    settle(els);
    return null;
  }

  const { trigger, y = 28, stagger = STAGGER, delay = 0 } = options;

  return gsap.to(els, {
    opacity: 1,
    y: 0,
    duration: DURATION,
    ease: EASE,
    stagger,
    delay,
    scrollTrigger: defaultTrigger(trigger ?? els[0]),
  });
}

/**
 * Cascade d'entrée jouée immédiatement, sans attendre le scroll.
 * Utilisé pour le hero, qui est déjà visible au chargement.
 */
export function revealNow(targets, options = {}) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return null;

  if (prefersReducedMotion()) {
    settle(els);
    return null;
  }

  const { y = 28, stagger = STAGGER, delay = 0 } = options;

  return gsap.to(els, {
    opacity: 1,
    y: 0,
    duration: DURATION,
    ease: EASE,
    stagger,
    delay,
  });
}

/**
 * Parallaxe au scroll : déplace l'élément à une vitesse différente de la page.
 * C'est ce décalage entre plans qui crée la profondeur.
 *
 * @param {string|Element} target
 * @param {number} distance Déplacement total en px sur la traversée (négatif = plus lent)
 * @param {Element} [scroller] Section de référence (défaut : l'élément lui-même)
 */
export function parallax(target, distance, scroller) {
  const el = gsap.utils.toArray(target)[0];
  if (!el || prefersReducedMotion()) return null;

  return gsap.to(el, {
    y: distance,
    ease: 'none',
    scrollTrigger: {
      trigger: scroller ?? el,
      start: 'top top',
      end: 'bottom top',
      scrub: true,
    },
  });
}

/**
 * Compteur animé, déclenché à l'entrée dans le viewport.
 * Lit la valeur cible dans `data-count-to` et conserve le suffixe éventuel
 * (le « + » de « 15+ ») présent dans `data-count-suffix`.
 */
export function countUp(targets) {
  const els = gsap.utils.toArray(targets);
  if (!els.length) return;

  els.forEach((el) => {
    const to = Number(el.dataset.countTo ?? 0);
    const suffix = el.dataset.countSuffix ?? '';

    if (prefersReducedMotion()) {
      el.textContent = `${to}${suffix}`;
      return;
    }

    const counter = { value: 0 };
    el.textContent = `0${suffix}`;

    gsap.to(counter, {
      value: to,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: defaultTrigger(el),
      onUpdate: () => {
        el.textContent = `${Math.round(counter.value)}${suffix}`;
      },
    });
  });
}

/**
 * Fait suivre le curseur à un ou plusieurs éléments, avec interpolation.
 * `gsap.quickTo` lisse le déplacement : appliquer les coordonnées de la souris
 * directement produit un mouvement saccadé, calé sur les événements pointeur
 * plutôt que sur le rafraîchissement de l'écran.
 *
 * Désactivé sur pointeur grossier (tactile) : il n'y a pas de curseur à suivre.
 *
 * @param {Array<{el: Element, strength: number}>} layers strength négatif = sens inverse
 */
export function followPointer(layers) {
  if (prefersReducedMotion()) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;

  const tweens = layers.map(({ el, strength }) => ({
    strength,
    x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' }),
    y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' }),
  }));

  window.addEventListener(
    'pointermove',
    (event) => {
      // Position normalisée entre -0.5 et 0.5 depuis le centre de l'écran.
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;

      tweens.forEach(({ strength, x, y }) => {
        x(nx * strength);
        y(ny * strength);
      });
    },
    { passive: true },
  );
}

export { gsap, ScrollTrigger };
