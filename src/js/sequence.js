import { gsap, ScrollTrigger, prefersReducedMotion } from './motion.js';
import manifest from '../data/sequence.json';

/**
 * Séquence d'images pilotée au scroll — le personnage du hero.
 *
 * À l'arrivée sur la page il est net. À mesure qu'on quitte le hero, il se
 * dissout en une constellation de particules : c'est le scroll, et lui seul,
 * qui avance la séquence. Remonter la refait dans l'autre sens.
 *
 * Aucun épinglage. La course est celle du hero lui-même — de son haut collé en
 * haut de l'écran jusqu'à sa sortie par le haut — exactement la même que celle
 * des parallaxes de hero.js. Épingler le premier écran d'un site donne
 * l'impression que la page ne répond pas ; ici, elle défile normalement.
 *
 * Pourquoi un canvas et une suite d'images plutôt qu'une balise <video> dont
 * on pilote `currentTime` : le seek vidéo est saccadé sur Safari et iOS même
 * en ré-encodant tout en images-clés. Des images déjà décodées se dessinent en
 * une opération, à n'importe quelle position, sur tous les navigateurs.
 *
 * Les images sont produites par `npm run sequence` (scripts/sequence.mjs).
 */

/* La dissolution est complète aux neuf dixièmes de la traversée du hero. La
   marge qui reste évite que la dernière image tombe pile au moment où la
   section sort de l'écran, ce qui donne une fin coupée. */
const SETTLE = 0.9;

/* Assez de requêtes pour saturer une bonne connexion, pas assez pour mettre en
   file d'attente le reste de la page si le visiteur scrolle vite. */
const CONCURRENCY = 6;

export function initSequence() {
  const holder = document.querySelector('[data-sequence]');
  if (!holder) return;

  const canvas = holder.querySelector('[data-sequence-canvas]');
  const hero = holder.closest('section');

  /* Mouvement réduit : rien n'est téléchargé, rien n'est animé. Le poster
     — la première image, personnage net — reste affiché par la feuille de
     style, et le hero garde exactement l'allure qu'il avait avant. */
  if (prefersReducedMotion() || !canvas || !hero) return;

  const set = window.matchMedia('(max-width: 767px)').matches ? '480' : '800';
  const { count } = manifest[set];
  const frames = new Array(count).fill(null);

  const ctx = canvas.getContext('2d', { alpha: false });

  /* Index visé par le scroll, et index réellement dessiné. Les deux sont
     séparés : le scroll peut demander une image pas encore arrivée, auquel cas
     on dessine la plus proche disponible plutôt que de ne rien dessiner. */
  let wanted = 0;
  let drawn = -1;
  let revealed = false;

  /* ---- Dessin ---- */

  const resize = () => {
    /* La densité de pixels est plafonnée à 2 : au-delà, on quadruple le coût
       de chaque `drawImage` pour redessiner une source qui ne fait que 800 px
       de large — on paierait de la fluidité pour une netteté qui n'existe pas
       dans le fichier d'origine. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    drawn = -1; // le contenu est perdu au redimensionnement du buffer
  };

  const paint = (index) => {
    const image = frames[index];
    if (!image) return;

    const { width: cw, height: ch } = canvas;
    const scale = Math.max(cw / image.naturalWidth, ch / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;

    ctx.drawImage(image, (cw - w) / 2, (ch - h) / 2, w, h);
    drawn = index;

    /* Le canvas ne se montre qu'une fois qu'il a quelque chose à montrer.
       Avant, c'est le poster qui tient l'affiche — la bascule est invisible
       puisque la première image dessinée est celle du poster. */
    if (!revealed) {
      revealed = true;
      holder.classList.add('is-live');
    }
  };

  /** L'image chargée la plus proche de l'index visé, en s'éloignant des deux côtés. */
  const nearestLoaded = (index) => {
    if (frames[index]) return index;

    for (let offset = 1; offset < count; offset += 1) {
      if (frames[index - offset]) return index - offset;
      if (frames[index + offset]) return index + offset;
    }
    return -1;
  };

  /* Le rendu est sorti de `onUpdate` et confié au ticker : le scroll peut
     émettre plusieurs mises à jour par frame d'affichage, et on ne dessinerait
     alors que pour les jeter. Ici, une image dessinée au maximum par frame. */
  gsap.ticker.add(() => {
    if (drawn === wanted) return;
    const index = nearestLoaded(wanted);
    if (index >= 0 && index !== drawn) paint(index);
  });

  /* ---- Chargement ---- */

  /* Ordre croissant : la séquence démarre sur la première image et avance.
     Charger dans l'ordre d'affichage, c'est avoir l'image utile au moment où
     elle sert — et la toute première est déjà en cache, le <head> la
     préchargeait pour le poster. */
  const queue = Array.from({ length: count }, (_, i) => i);
  let started = false;

  const loadOne = (index) =>
    new Promise((resolve) => {
      const image = new Image();
      image.src = `/img/sequence/${set}/f-${String(index).padStart(3, '0')}.webp`;
      image.decoding = 'async';

      const done = () => {
        frames[index] = image;
        /* Forcer un redessin si l'image qui vient d'arriver est meilleure que
           celle affichée — sinon, à l'arrêt, on reste sur une approximation. */
        if (index === wanted) drawn = -1;
        resolve();
      };

      image.onload = () => (image.decode ? image.decode().then(done, done) : done());
      image.onerror = resolve; // une image manquante ne doit pas bloquer la file
    });

  const drain = async () => {
    while (queue.length) {
      await loadOne(queue.shift());
    }
  };

  const preload = () => {
    if (started) return;
    started = true;
    resize();
    for (let i = 0; i < CONCURRENCY; i += 1) drain();
  };

  /* Le gros du téléchargement attend la fin du chargement de la page.

     La séquence est sur le premier écran : sans cette attente, ses ~1,8 Mo
     partiraient en concurrence du CSS, des polices et de l'image du poster,
     c'est-à-dire de tout ce qui décide de la première impression — pour des
     images dont aucune ne sert tant que le visiteur n'a pas scrollé. S'il
     scrolle avant la fin, `nearestLoaded` affiche l'image disponible la plus
     proche : le mouvement est moins fin, il n'est jamais absent. */
  if (document.readyState === 'complete') preload();
  else window.addEventListener('load', preload, { once: true });

  /* ---- Course au scroll ---- */

  ScrollTrigger.create({
    trigger: hero,
    start: 'top top',

    /* Pas `bottom top`, qui serait la course naturelle du hero : à mi-parcours
       le personnage a déjà quitté l'écran par le haut, et la moitié de la
       dissolution se jouerait sans spectateur. La course s'arrête donc avant
       qu'il ne sorte, tant qu'il est encore bien en vue. Passé ce point il
       reste constellation jusqu'à la sortie.

       Plus court sur téléphone : l'écran est haut et étroit, le plan y est
       plus petit et placé plus haut, donc il sort du champ plus tôt. */
    end: () => `top -${window.innerWidth < 768 ? 38 : 55}%`,
    scrub: true,
    invalidateOnRefresh: true,
    onRefresh: resize,
    onUpdate: (self) => {
      const progress = Math.min(self.progress / SETTLE, 1);
      wanted = Math.round(progress * (count - 1));
    },
  });
}
