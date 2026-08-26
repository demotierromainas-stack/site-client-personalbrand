/**
 * Carrousel d'articles de l'accueil.
 *
 * Le défilement lui-même est natif — `overflow-x` et `scroll-snap` en CSS. Ce
 * module n'ajoute que les flèches et leur état, et ne s'exécute que s'il y a
 * réellement de quoi défiler. Conséquence : sans JavaScript, ou si ce fichier
 * échoue, la piste reste parcourable au doigt, à la molette et au clavier. Rien
 * d'essentiel ne dépend d'ici.
 */

/** Largeur d'un pas : une card et sa gouttière. */
function pas(track) {
  const item = track.querySelector('.carousel-item');
  if (!item) return track.clientWidth;
  const gouttiere = parseFloat(getComputedStyle(track).columnGap || '0');
  return item.getBoundingClientRect().width + gouttiere;
}

export function initCarousel() {
  const track = document.querySelector('[data-carousel-track]');
  const controls = document.querySelector('[data-carousel-controls]');
  if (!track || !controls) return;

  const prev = controls.querySelector('[data-carousel-prev]');
  const next = controls.querySelector('[data-carousel-next]');

  /* Un pixel de tolérance : les largeurs calculées tombent rarement juste, et
     sans marge la flèche de fin reste active alors qu'on est au bout. */
  const MARGE = 1;

  const majEtat = () => {
    const debordement = track.scrollWidth - track.clientWidth;

    // Tout tient à l'écran : les flèches n'ont rien à commander.
    if (debordement <= MARGE) {
      controls.hidden = true;
      return;
    }

    controls.hidden = false;
    prev.disabled = track.scrollLeft <= MARGE;
    next.disabled = track.scrollLeft >= debordement - MARGE;
  };

  const deplacer = (sens) => {
    track.scrollBy({ left: sens * pas(track), behavior: 'smooth' });
  };

  prev.addEventListener('click', () => deplacer(-1));
  next.addEventListener('click', () => deplacer(1));

  /* `scroll` se déclenche à chaque frame pendant un défilement fluide : on ne
     recalcule qu'une fois par frame plutôt qu'à chaque événement. */
  let planifie = false;
  track.addEventListener(
    'scroll',
    () => {
      if (planifie) return;
      planifie = true;
      requestAnimationFrame(() => {
        planifie = false;
        majEtat();
      });
    },
    { passive: true },
  );

  /* Le nombre de cards visibles change avec la largeur, donc l'état des
     flèches aussi. ResizeObserver couvre aussi le cas des polices qui
     arrivent après coup et modifient la hauteur des cards. */
  new ResizeObserver(majEtat).observe(track);

  majEtat();
}
