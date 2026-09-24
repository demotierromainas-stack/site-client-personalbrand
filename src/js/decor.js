import { gsap, prefersReducedMotion, isTouchDevice } from './motion.js';

/* ============================================================
   DÉCOR DE FOND — les courbes, dessinées et animées en canvas 2D.

   Avant, cette composition était un SVG figé de quatre-vingts lignes, calé
   sur un viewBox de 1440 × 1400 et recadré par `preserveAspectRatio: slice`.
   Deux défauts : rien ne bougeait vraiment (une translation CSS de vingt
   pixels, invisible), et sur un téléphone le navigateur ne faisait que rogner
   la composition — on y voyait le coin droit d'un dessin pensé pour un écran
   large, pas une composition pour écran étroit.

   Le canvas règle les deux. La géométrie est décrite ici en coordonnées de
   création, dans deux compositions distinctes — une large, une étroite — et
   c'est celle qui correspond à la forme de l'écran qui est dessinée. Rien
   n'est recadré : les courbes sont recomposées.

   Trois mouvements se superposent, et c'est leur addition qui fait qu'on ne
   reconnaît jamais une image déjà vue :
   — l'ondulation, le mouvement qu'on voit : une vague parcourt chaque ligne
     sans s'arrêter, une crête avançant d'une longueur d'onde en 12 à 19 s ;
   — la respiration de la composition, dix fois plus lente (29 à 46 s), qui
     déplace les courbes entières sans qu'on la surprenne à le faire ;
   — un reflet doré qui glisse le long d'une ligne, une dizaine de secondes
     sur trois.

   L'ondulation a été franchement assumée : une première version calée sous le
   seuil de perception ne se voyait tout simplement pas, le fond paraissait
   figé. Elle reste lente — jamais un mouvement qui appelle le regard pendant
   qu'on lit.

   Les lueurs (`.bg-glow`, `.bg-flare`) et le grain restent en CSS : ce sont
   des dégradés flous que le compositeur du navigateur dessine une fois et
   réutilise, les refaire au pinceau à chaque frame coûterait bien plus cher.

   Animé partout, y compris sur téléphone, où le dessin passe simplement à une
   frame sur deux (voir TOUCH_STEP). Seul le mouvement réduit fige le décor.

   Coût mesuré à 1440 × 900 en Retina : 4 à 5 % d'un cœur, 60 fps tenus. Sept
   polylignes par frame, sans flou ni mode de fusion sur le fond. Le chiffre ne
   dépend pas de l'amplitude de la vague : le travail par frame est le même, ce
   sont les mêmes points et les mêmes tracés, seule leur position change.
   Le trait garde la même épaisseur quelle que soit la taille d'écran — il est
   posé en pixels CSS, pas mis à l'échelle avec la composition, sinon un grand
   écran épaissirait les courbes jusqu'à les rendre voyantes.

   Sans JavaScript, il ne reste que le fond navy et ses lueurs. C'est assumé :
   dupliquer la géométrie en SVG pour ce cas, c'était deux sources de vérité
   qui divergent à la première retouche.
   ============================================================ */

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

/* La composition étroite prend le relais sous ce rapport largeur/hauteur.
   Un téléphone en portrait tourne autour de 0,35, une tablette autour de 0,55,
   un écran d'ordinateur dépasse 1. */
const NARROW_RATIO = 0.72;

/* Au-delà de 2, la densité de pixels ne se voit plus sur un trait de 1 px mais
   quadruple la surface à peindre. */
const MAX_DPR = 2;

/* Sur tactile, le décor n'est redessiné qu'une frame sur deux. Une vague met
   une quinzaine de secondes à avancer d'une longueur d'onde : à 30 images par
   seconde, elle n'avance pas d'un pixel entier entre deux images, la moitié
   des frames ne changeait rien. Ce qui est rendu, c'est du temps graphique
   pour le scroll, qui lui a besoin des soixante. Le fond est fixe pendant
   qu'on défile, rien ne trahit la cadence plus basse. */
const TOUCH_STEP = 1 / 32;

/* ============================================================
   PALETTE
   Lue dans les variables CSS (tokens.css) : les couleurs du site ont un seul
   point de vérité, et le canvas ne doit pas en ouvrir un second.
   Les valeurs en dur ci-dessous ne servent que si la feuille de styles n'est
   pas encore appliquée au moment de l'initialisation.
   ============================================================ */

const FALLBACK = {
  '--decor-warm': '#e0a96d',
  '--decor-warm-deep': '#b87333',
  '--decor-line': '#b8bdc7',
  '--decor-line-dim': '#8a909c',
  '--decor-line-faint': '#545b68',
};

/** `#e0a96d` → `224 169 109`, la forme attendue par `rgb(… / alpha)`. */
function channels(hex) {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return '255 255 255';
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  const read = (name) => channels(styles.getPropertyValue(name) || FALLBACK[name]);

  return {
    warm: read('--decor-warm'),
    warmDeep: read('--decor-warm-deep'),
    line: read('--decor-line'),
    dim: read('--decor-line-dim'),
    faint: read('--decor-line-faint'),
  };
}

/* ============================================================
   TONS
   Quatre dégradés, repris trait pour trait de la version SVG. Aucune ligne
   n'est peinte d'une couleur pleine : chacune s'éteint à ses deux extrémités,
   c'est ce qui fait lire une structure éclairée par une source plutôt qu'un
   trait dessiné. Format : [position, canaux, opacité].
   ============================================================ */

function buildTones(p) {
  return {
    light: [
      [0, p.dim, 0],
      [0.38, p.line, 0.34],
      [0.62, p.warm, 0.4],
      [1, p.warmDeep, 0],
    ],
    faint: [
      [0, p.faint, 0],
      [0.5, p.dim, 0.2],
      [1, p.faint, 0],
    ],
    warm: [
      [0, p.warmDeep, 0],
      [0.42, p.warm, 0.32],
      [1, p.warmDeep, 0],
    ],
    cool: [
      [0, p.faint, 0],
      [0.55, p.line, 0.18],
      [1, p.faint, 0],
    ],
  };
}

function paint(gradient, stops) {
  stops.forEach(([offset, rgb, alpha]) => {
    gradient.addColorStop(offset, `rgb(${rgb} / ${alpha})`);
  });
  return gradient;
}

/* ============================================================
   COMPOSITIONS
   Deux dessins, chacun dans son propre espace de création.

   Trois mouvements se superposent, et ils ne font pas le même travail :

   `wave` — l'ondulation, le mouvement qu'on voit. Une vague parcourt la ligne
   en continu : `amp` est son creux maximal en unités de création, `length` le
   nombre de vagues sur la longueur du tracé, `period` le temps qu'une crête
   met à avancer d'une vague.

   `sway` — la respiration lente de la composition. Elle déplace les points de
   contrôle et fait travailler les rayons des disques, pour que le dessin
   n'aille pas se figer dans une forme reconnaissable. Amplitude plus grande
   que la vague, mais si lente qu'on ne la voit pas bouger, seulement changer.

   `glint` — le reflet qui glisse. `period` est l'intervalle entre deux
   passages, `travel` la durée d'un passage, `span` la part du tracé qu'il
   éclaire, `offset` le décalage au démarrage. Toutes les lignes n'en ont pas :
   un reflet sur chacune, ce serait une guirlande de Noël.

   Toutes les périodes sont désaccordées entre elles. Deux courbes qui
   reviendraient ensemble à leur point de départ donneraient un battement, et
   un battement se remarque. Les quatre `offset` de reflet sont calés pour que
   les premiers passages tombent à 3, 14, 25 et 36 s : réglés d'abord au
   hasard, ils arrivaient tous dans la même seconde puis laissaient vingt
   secondes de vide — on ne voyait plus un décor qui respire mais un clignotant.
   ============================================================ */

const WIDE = {
  width: 1440,
  height: 1400,
  /* Grands disques vus en perspective, sortant par la droite. */
  arcs: [
    {
      cx: 1580, cy: 760, rx: 700, ry: 450, tilt: -14, line: 1.4, tone: 'light',
      wave: { amp: 24, length: 1.7, period: 14, phase: 0 },
      sway: { x: 16, y: 22, tilt: 0.7, radius: 0.014, period: 41, phase: 0 },
      glint: { span: 0.18, period: 31, travel: 6, offset: 17 },
    },
    {
      cx: 1650, cy: 820, rx: 880, ry: 580, tilt: -14, line: 1, tone: 'faint',
      wave: { amp: 20, length: 2.1, period: 19, phase: 1.3 },
      sway: { x: 22, y: 16, tilt: 0.5, radius: 0.012, period: 37, phase: 1.9 },
    },
    {
      cx: 1520, cy: 1180, rx: 620, ry: 330, tilt: -8, line: 1, tone: 'faint',
      wave: { amp: 22, length: 1.9, period: 16.5, phase: 2.6 },
      sway: { x: 18, y: 20, tilt: 0.6, radius: 0.016, period: 29, phase: 3.4 },
      glint: { span: 0.2, period: 43, travel: 7, offset: 7 },
    },
  ],
  /* Courbes qui balaient la largeur et convergent vers les disques. */
  sweeps: [
    {
      points: [[-160, 1010], [340, 940], [820, 800], [1600, 300]],
      line: 1.3, tone: 'warm',
      wave: { amp: 33, length: 1.8, period: 12, phase: 0.5 },
      sway: { amp: 16, drift: 14, period: 34, phase: 0 },
      glint: { span: 0.16, period: 29, travel: 5, offset: 26 },
    },
    {
      points: [[-160, 1120], [380, 1050], [900, 900], [1600, 420]],
      line: 1, tone: 'cool',
      wave: { amp: 28, length: 2.3, period: 15.5, phase: 2.1 },
      sway: { amp: 14, drift: 18, period: 39, phase: 2.2 },
    },
    {
      points: [[-160, 640], [420, 620], [980, 540], [1600, 180]],
      line: 1, tone: 'cool',
      wave: { amp: 36, length: 1.6, period: 13.5, phase: 3.7 },
      sway: { amp: 18, drift: 12, period: 31, phase: 4.1 },
      glint: { span: 0.18, period: 37, travel: 6.5, offset: 12 },
    },
    {
      points: [[-160, 1320], [300, 1240], [880, 1080], [1600, 640]],
      line: 1, tone: 'warm',
      wave: { amp: 30, length: 2, period: 17, phase: 5.2 },
      sway: { amp: 15, drift: 16, period: 43, phase: 5.6 },
    },
  ],
};

/* Écran étroit : même vocabulaire, autre mise en page. Les disques deviennent
   des ellipses hautes — sur une largeur de téléphone, une ellipse aplatie ne
   laisse voir qu'un trait presque droit — et les balayages se redressent pour
   traverser la hauteur au lieu de sortir par les côtés. Les amplitudes
   suivent : la boîte fait 560 unités de large contre 1440, une vague de la
   même taille y paraîtrait deux fois plus ample. */
const NARROW = {
  width: 560,
  height: 1400,
  arcs: [
    {
      cx: 620, cy: 760, rx: 300, ry: 520, tilt: -12, line: 1.3, tone: 'light',
      wave: { amp: 15, length: 1.7, period: 14, phase: 0 },
      sway: { x: 10, y: 16, tilt: 0.7, radius: 0.016, period: 41, phase: 0 },
      glint: { span: 0.18, period: 31, travel: 6, offset: 17 },
    },
    {
      cx: 690, cy: 840, rx: 390, ry: 680, tilt: -12, line: 1, tone: 'faint',
      wave: { amp: 13, length: 2.1, period: 19, phase: 1.3 },
      sway: { x: 14, y: 12, tilt: 0.5, radius: 0.014, period: 37, phase: 1.9 },
    },
    {
      cx: 600, cy: 1220, rx: 260, ry: 370, tilt: -8, line: 1, tone: 'faint',
      wave: { amp: 15, length: 1.9, period: 16.5, phase: 2.6 },
      sway: { x: 12, y: 14, tilt: 0.6, radius: 0.018, period: 29, phase: 3.4 },
      glint: { span: 0.2, period: 43, travel: 7, offset: 7 },
    },
  ],
  sweeps: [
    {
      points: [[-90, 1000], [110, 900], [320, 760], [660, 320]],
      line: 1.3, tone: 'warm',
      wave: { amp: 21, length: 1.8, period: 12, phase: 0.5 },
      sway: { amp: 12, drift: 8, period: 34, phase: 0 },
      glint: { span: 0.16, period: 29, travel: 5, offset: 26 },
    },
    {
      points: [[-90, 1180], [130, 1080], [360, 920], [660, 460]],
      line: 1, tone: 'cool',
      wave: { amp: 18, length: 2.3, period: 15.5, phase: 2.1 },
      sway: { amp: 11, drift: 10, period: 39, phase: 2.2 },
    },
    {
      points: [[-90, 620], [150, 590], [380, 500], [660, 180]],
      line: 1, tone: 'cool',
      wave: { amp: 22, length: 1.6, period: 13.5, phase: 3.7 },
      sway: { amp: 13, drift: 7, period: 31, phase: 4.1 },
      glint: { span: 0.18, period: 37, travel: 6.5, offset: 12 },
    },
    {
      points: [[-90, 1360], [100, 1260], [340, 1100], [660, 680]],
      line: 1, tone: 'warm',
      wave: { amp: 19, length: 2, period: 17, phase: 5.2 },
      sway: { amp: 12, drift: 9, period: 43, phase: 5.6 },
    },
  ],
};

/* ============================================================
   CADRAGE
   La composition couvre la surface, mais elle est ancrée à droite au lieu
   d'être centrée : les disques doivent sortir par le bord droit, c'est là que
   se trouve la lumière. Un cadrage centré les repousserait hors de l'écran sur
   les formats intermédiaires.
   ============================================================ */

function frame(width, height) {
  const scene = width / height < NARROW_RATIO ? NARROW : WIDE;
  const scale = Math.max(width / scene.width, height / scene.height);

  return {
    scene,
    scale,
    tx: width - scene.width * scale,
    ty: (height - scene.height * scale) / 2,
    width,
    height,
  };
}

/* ============================================================
   REFLET
   Le passage n'est pas tiré au hasard : chaque ligne a sa période propre, et
   l'entrelacement de périodes désaccordées suffit à donner l'irrégularité
   qu'on attend. Un `Math.random()` aurait donné des rafales et des trous.
   Retourne 0 quand rien ne passe, sinon la progression entre 0 et 1.
   ============================================================ */

function glintProgress(glint, clock) {
  const cycle = (((clock + glint.offset) % glint.period) + glint.period) % glint.period;
  if (cycle > glint.travel) return 0;
  return cycle / glint.travel;
}

/** Enveloppe en cloche, utilisée deux fois : elle fait naître et mourir le
    reflet en douceur, et elle ancre les deux bouts de l'ondulation. */
const envelope = (progress) => Math.sin(Math.PI * progress);

/* ============================================================
   TRACÉS
   Chaque courbe est échantillonnée en polyligne avant d'être dessinée.
   Une Bézier et une ellipse natives auraient demandé trois fois moins de
   code, mais l'ondulation déplace chaque point le long de sa normale : il
   faut les points. Le coût est le même à l'arrivée — le navigateur aplatit
   de toute façon les courbes en segments avant de les rastériser.
   ============================================================ */

/* Segments par courbe. À 96, l'écart entre la corde et l'arc reste sous le
   quart de pixel sur le plus grand disque, même sur un écran de 2560 px :
   un trait de 1 px ne montre donc aucune facette. */
const STEPS = 96;

/* Deux tampons partagés, remplis puis vidés courbe par courbe. À 60 images
   par seconde, allouer un tableau de points par courbe et par frame, c'est
   quatre-vingt mille objets à la seconde donnés au ramasse-miettes — et le
   ramasse-miettes se voit, il arrive toujours au mauvais moment. */
const SAMPLE = new Float64Array((STEPS + 1) * 2);
const DRAWN = new Float64Array((STEPS + 1) * 2);

/* Points de contrôle d'un balayage, réutilisés d'une frame à l'autre pour la
   même raison. */
const CONTROL = [
  [0, 0],
  [0, 0],
  [0, 0],
  [0, 0],
];

/* Portion de disque réellement dessinée, en multiples de π. Les disques sont
   centrés hors de l'écran, à droite : tout ce qu'on en voit est leur flanc
   gauche. Dessiner le tour complet faisait rastériser au navigateur trois fois
   plus de tracé que ce qui atteint l'écran. Les deux extrémités tombent hors
   cadre dans les deux compositions — la plus courte marge, sur téléphone et
   avec la respiration au plus défavorable, est d'une trentaine de pixels. Elle
   compte : le dégradé n'est pas éteint à cet endroit du tracé, un bout qui
   rentrerait dans le cadre se verrait comme une amorce de ligne coupée. */
const ARC_FROM = 0.48 * Math.PI;
const ARC_TO = 1.62 * Math.PI;

/** Échantillonne le flanc visible d'un disque dans SAMPLE. */
function sampleArc(cx, cy, rx, ry, tilt) {
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  for (let i = 0; i <= STEPS; i++) {
    const a = ARC_FROM + ((ARC_TO - ARC_FROM) * i) / STEPS;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    SAMPLE[i * 2] = cx + x * cos - y * sin;
    SAMPLE[i * 2 + 1] = cy + x * sin + y * cos;
  }
}

/** Échantillonne une Bézier cubique dans SAMPLE. */
function sampleCubic(p) {
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const m = 1 - t;
    const w0 = m * m * m;
    const w1 = 3 * m * m * t;
    const w2 = 3 * m * t * t;
    const w3 = t * t * t;
    SAMPLE[i * 2] = w0 * p[0][0] + w1 * p[1][0] + w2 * p[2][0] + w3 * p[3][0];
    SAMPLE[i * 2 + 1] = w0 * p[0][1] + w1 * p[1][1] + w2 * p[2][1] + w3 * p[3][1];
  }
}

/**
 * ONDULATION — le mouvement principal du décor.
 *
 * Chaque point s'écarte de la courbe le long de sa normale, d'une sinusoïde
 * qui dépend à la fois de sa position sur le tracé et du temps. C'est ce
 * couplage qui fait voyager la vague le long de la ligne. Sans le terme de
 * position, toute la courbe monterait et descendrait d'un bloc — un
 * tremblement, pas une onde ; sans le terme de temps, on aurait une courbe
 * ondulée mais immobile.
 *
 * L'enveloppe en cloche ramène le déplacement à zéro aux deux extrémités, qui
 * sont hors champ. Sans elle, les bouts battraient et on verrait entrer et
 * sortir du cadre une amorce de ligne qui n'y était pas.
 *
 * Lit SAMPLE (unités de création) et remplit DRAWN (pixels CSS, prêt à tracer).
 */
function waveAndMap(view, wave, clock, animated) {
  const phase = animated ? TAU * (clock / wave.period) - wave.phase : 0;

  for (let i = 0; i <= STEPS; i++) {
    let x = SAMPLE[i * 2];
    let y = SAMPLE[i * 2 + 1];

    if (animated) {
      const u = i / STEPS;
      // Tangente prise sur les deux points voisins, normale = quart de tour.
      const before = Math.max(i - 1, 0) * 2;
      const after = Math.min(i + 1, STEPS) * 2;
      const tx = SAMPLE[after] - SAMPLE[before];
      const ty = SAMPLE[after + 1] - SAMPLE[before + 1];
      const length = Math.hypot(tx, ty) || 1;
      const swell = wave.amp * envelope(u) * Math.sin(TAU * u * wave.length - phase);

      x -= (ty / length) * swell;
      y += (tx / length) * swell;
    }

    DRAWN[i * 2] = view.tx + x * view.scale;
    DRAWN[i * 2 + 1] = view.ty + y * view.scale;
  }
}

/** Trace dans DRAWN, du point `from` au point `to`. */
function path(ctx, from, to) {
  ctx.beginPath();
  ctx.moveTo(DRAWN[from * 2], DRAWN[from * 2 + 1]);
  for (let i = from + 1; i <= to; i++) ctx.lineTo(DRAWN[i * 2], DRAWN[i * 2 + 1]);
}

/** Le reflet, s'il en passe un sur cette ligne à cet instant. */
function drawGlint(ctx, curve, clock, warm) {
  if (!curve.glint) return;

  const progress = glintProgress(curve.glint, clock);
  if (!progress) return;

  const span = Math.max(2, Math.round(STEPS * curve.glint.span));
  const from = Math.round((STEPS - span) * progress);
  const to = from + span;

  const gradient = ctx.createLinearGradient(
    DRAWN[from * 2],
    DRAWN[from * 2 + 1],
    DRAWN[to * 2],
    DRAWN[to * 2 + 1],
  );
  const alpha = 0.5 * envelope(progress);
  gradient.addColorStop(0, `rgb(${warm} / 0)`);
  gradient.addColorStop(0.5, `rgb(${warm} / ${alpha})`);
  gradient.addColorStop(1, `rgb(${warm} / 0)`);

  path(ctx, from, to);

  // Deux passes plutôt qu'un `shadowBlur` : le trait large donne la diffusion,
  // le trait fin le point chaud. Le flou de canvas coûte dix fois ça.
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = gradient;
  ctx.lineWidth = curve.line * 3.2;
  ctx.globalAlpha = 0.28;
  ctx.stroke();
  ctx.lineWidth = curve.line * 1.1;
  ctx.globalAlpha = 1;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function drawArc(ctx, view, arc, clock, drift, tones, warm, animated) {
  const { sway } = arc;
  const w1 = animated ? Math.sin((clock * TAU) / sway.period + sway.phase) : 0;
  const w2 = animated ? Math.sin((clock * TAU) / (sway.period * 0.83) + sway.phase + 1.7) : 0;

  const cx = arc.cx + drift[0] + sway.x * w1;
  const cy = arc.cy + drift[1] + sway.y * w2;
  const rx = arc.rx * (1 + sway.radius * w2);
  const ry = arc.ry * (1 + sway.radius * 1.2 * w1);
  const tilt = (arc.tilt + sway.tilt * w1) * RAD;

  sampleArc(cx, cy, rx, ry, tilt);
  waveAndMap(view, arc.wave, clock, animated);

  // Le dégradé suit la diagonale de la boîte du disque entier, du bas-gauche
  // vers le haut-droit — pas celle du seul morceau dessiné. C'est la lumière
  // qui décide où l'arc s'allume, pas le cadrage.
  const hx = Math.hypot(rx * Math.cos(tilt), ry * Math.sin(tilt)) * view.scale;
  const hy = Math.hypot(rx * Math.sin(tilt), ry * Math.cos(tilt)) * view.scale;
  const mx = view.tx + cx * view.scale;
  const my = view.ty + cy * view.scale;

  path(ctx, 0, STEPS);
  ctx.strokeStyle = paint(
    ctx.createLinearGradient(mx - hx, my + hy, mx + hx, my - hy),
    tones[arc.tone],
  );
  ctx.lineWidth = arc.line;
  ctx.stroke();

  if (animated) drawGlint(ctx, arc, clock, warm);
}

/* Les extrémités respirent moins que le milieu : une courbe dont les deux
   bouts se baladent se lit comme un élastique, pas comme un rayon de lumière. */
const SWAY_WEIGHT = [0.35, 1, 1, 0.5];

function drawSweep(ctx, view, sweep, clock, drift, tones, warm, animated) {
  const { sway } = sweep;
  const angle = animated ? (clock * TAU) / sway.period + sway.phase : 0;
  const dx = animated ? sway.drift * Math.sin(angle * 0.7) : 0;

  for (let i = 0; i < 4; i++) {
    const dy = animated ? sway.amp * SWAY_WEIGHT[i] * Math.sin(angle + i * 0.9) : 0;
    CONTROL[i][0] = sweep.points[i][0] + drift[0] + dx;
    CONTROL[i][1] = sweep.points[i][1] + drift[1] + dy;
  }

  sampleCubic(CONTROL);
  waveAndMap(view, sweep.wave, clock, animated);

  path(ctx, 0, STEPS);
  ctx.strokeStyle = paint(
    ctx.createLinearGradient(DRAWN[0], DRAWN[1], DRAWN[STEPS * 2], DRAWN[STEPS * 2 + 1]),
    tones[sweep.tone],
  );
  ctx.lineWidth = sweep.line;
  ctx.stroke();

  if (animated) drawGlint(ctx, sweep, clock, warm);
}

function render(ctx, view, clock, tones, warm, animated) {
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Dérive d'ensemble, très lente : la composition ne revient jamais deux fois
  // au même endroit de l'écran, ce qui évite qu'on la reconnaisse d'une section
  // à l'autre. Remplace l'ancienne translation CSS du groupe SVG.
  const drift = animated
    ? [9 * Math.sin((clock * TAU) / 46), 13 * Math.sin((clock * TAU) / 46 + 0.9)]
    : [0, 0];

  view.scene.arcs.forEach((arc) => drawArc(ctx, view, arc, clock, drift, tones, warm, animated));
  view.scene.sweeps.forEach((s) => drawSweep(ctx, view, s, clock, drift, tones, warm, animated));
}

/* ============================================================
   MISE EN ROUTE
   ============================================================ */

function initBackgroundLines() {
  const canvas = document.querySelector('[data-decor-lines]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const palette = readPalette();
  const tones = buildTones(palette);
  const warm = palette.warm;

  /* Immobile uniquement si le mouvement réduit est demandé. Le tactile anime
     comme le reste, à cadence réduite : exception assumée au bloc « DÉCOR
     ALLÉGÉ » de main.css, qui y coupe tout ce qui tourne en boucle. Ce qui
     faisait saccader les téléphones, c'étaient des flous de 120 px et un mode
     de fusion recomposés à chaque frame — pas sept traits fins sans flou ni
     fusion. Le reste de l'allègement tactile reste en place. */
  const animated = !prefersReducedMotion();

  /* Cadence : chaque frame sur ordinateur, une sur deux sur tactile. */
  const step = isTouchDevice() ? TOUCH_STEP : 0;
  let sinceDraw = 0;

  let view = null;
  let clock = 0;
  let running = false;
  let onScreen = true;
  let pageVisible = !document.hidden;

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return false;

    // Relu à chaque fois : une fenêtre déplacée du portable vers un écran
    // externe change de densité sans changer de taille en pixels CSS.
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      // Tout le dessin se fait en pixels CSS : l'épaisseur du trait reste la
      // même sur un écran Retina comme ailleurs.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    view = frame(width, height);
    return true;
  }

  const paintFrame = () => {
    if (view) render(ctx, view, clock, tones, warm, animated);
  };

  function tick(time, delta) {
    // Après un onglet en arrière-plan, `delta` peut valoir plusieurs secondes.
    // Le plafonner évite que les courbes sautent à la reprise.
    const elapsed = Math.min(delta, 50) / 1000;
    clock += elapsed;

    // L'horloge avance à chaque frame, le dessin non : la vague garde sa
    // vitesse réelle quelle que soit la cadence de rendu.
    sinceDraw += elapsed;
    if (sinceDraw < step) return;
    sinceDraw = 0;

    paintFrame();
  }

  function sync() {
    const shouldRun = animated && onScreen && pageVisible;
    if (shouldRun === running) return;

    running = shouldRun;
    if (shouldRun) gsap.ticker.add(tick);
    else gsap.ticker.remove(tick);
  }

  resize();
  paintFrame();

  /* Le redimensionnement change la forme de l'écran, donc possiblement la
     composition retenue : on la recalcule au lieu d'étirer l'ancienne. */
  const refresh = () => {
    if (resize() && !running) paintFrame();
  };

  new ResizeObserver(refresh).observe(canvas);

  /* Changement de densité d'écran : aucun événement dédié n'existe, la
     convention est d'écouter la requête média de la densité courante, qui
     cesse de s'appliquer dès qu'elle change — et d'en réarmer une nouvelle. */
  (function watchPixelRatio() {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener(
      'change',
      () => {
        refresh();
        watchPixelRatio();
      },
      { once: true },
    );
  })();

  if (!animated) return;

  /* Deux garde-fous, et ils ne couvrent pas le même cas :
     — l'IntersectionObserver arrête le dessin quand la couche sort du champ.
       Elle est aujourd'hui en `position: fixed` et donc toujours à l'écran :
       c'est une sécurité pour le jour où le décor sera attaché à une section.
     — la visibilité du document, elle, sert tous les jours : onglet en
       arrière-plan ou fenêtre masquée, plus une frame n'est dessinée. */
  new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    },
    { rootMargin: '10%' },
  ).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
    sync();
  });

  sync();
}

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

/** Point d'entrée du domaine « décor », appelé par main.js. */
export function initDecor() {
  initBackgroundLines();
  initBackgroundDrift();
}
