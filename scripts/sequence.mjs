/**
 * Extraction de la séquence d'images animée au scroll (section « À propos »).
 *
 * Outil ponctuel, lancé à la main. Il n'est PAS branché sur le build : les
 * images produites sont versionnées dans `public/img/sequence/`, et la CI les
 * recopie telles quelles. C'est volontaire — la source ne change qu'à chaque
 * nouvelle vidéo du client, et faire dépendre le déploiement d'ImageMagick
 * pour un asset figé serait un mauvais échange.
 *
 * Pourquoi une séquence d'images et pas une balise <video> :
 * piloter `currentTime` au scroll donne un rendu saccadé sur Safari et iOS,
 * même en ré-encodant tout en images-clés. Dessiner des images déjà décodées
 * dans un canvas est fluide partout, au prix d'un poids plus élevé — qu'on
 * compense par le chargement paresseux (voir src/js/sequence.js).
 *
 *   npm run sequence -- ~/Desktop/videojeanmaxime.gif
 */

import { execFile } from 'node:child_process';
import { mkdir, rm, readdir, writeFile, unlink, rename } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

const SOURCE = process.argv[2];
const OUT_ROOT = 'public/img/sequence';

/* Le manifeste vit dans `src/` et non à côté des images : Vite refuse qu'on
   importe depuis `public/`, dont le contenu est copié tel quel sans passer par
   le graphe de modules. Importé depuis `src/`, il est inliné dans le bundle —
   pas de requête réseau supplémentaire au chargement. */
const MANIFEST = 'src/data/sequence.json';

/* Deux jeux d'images.
   — 800 : la largeur native de la source. On n'agrandit jamais, une image
     agrandie au-delà de sa définition se voit immédiatement sur un visage.
   — 480 : le jeu mobile, une image sur deux. Sur un écran de téléphone la
     moitié des images suffit pour que le mouvement reste continu, et ça
     divise le poids par quatre. */
const SETS = [
  { name: '800', width: 800, quality: 76, step: 1 },
  { name: '480', width: 480, quality: 74, step: 2 },
];

/* La fin de la source ne sert à rien.
   La dissolution est terminée avant la dernière image : au-delà de la 78e il
   ne reste qu'un plateau vide, quasi noir. Comme on lit la séquence à l'envers,
   ces images-là seraient les premières vues — le visiteur entrerait dans la
   section sur un écran vide. On les coupe donc à la production plutôt que de
   les ignorer à l'exécution : ça épargne aussi un cinquième du poids.

   À réajuster si la vidéo source change. */
const KEEP_UNTIL = 78;

async function assertMagick() {
  try {
    await run('magick', ['-version']);
  } catch {
    console.error(
      "ImageMagick est introuvable. Installer avec `brew install imagemagick`,\n" +
        'puis relancer. Aucune image n\'a été écrite.',
    );
    process.exit(1);
  }
}

/**
 * `-coalesce` est indispensable : un GIF n'encode que les pixels qui changent
 * d'une image à l'autre. Sans cette étape on extrait des fragments sur fond
 * transparent au lieu d'images complètes.
 */
async function extract({ name, width, quality, step }) {
  const dir = path.join(OUT_ROOT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  await run('magick', [
    SOURCE,
    '-coalesce',
    '-resize',
    `${width}x`,
    '-quality',
    String(quality),
    '-define',
    'webp:method=6',
    path.join(dir, 'f-%03d.webp'),
  ]);

  /* ImageMagick numérote toutes les images de la source ; l'échantillonnage se
     fait après coup, puis on renumérote en continu — le JS calcule un index à
     partir d'une progression, il lui faut une suite sans trou. */
  const all = (await readdir(dir)).filter((f) => f.endsWith('.webp')).sort();
  const kept = all.filter((_, i) => i <= KEEP_UNTIL && i % step === 0);
  const keptSet = new Set(kept);

  await Promise.all(
    all.filter((f) => !keptSet.has(f)).map((f) => unlink(path.join(dir, f))),
  );

  /* Renommage en série, jamais en parallèle : chaque cible porte un index
     inférieur ou égal à celui de sa source, donc la place n'est libre que si
     le renommage précédent est terminé. */
  for (const [i, file] of kept.entries()) {
    const target = `f-${String(i).padStart(3, '0')}.webp`;
    if (file !== target) await rename(path.join(dir, file), path.join(dir, target));
  }

  const { stdout } = await run('magick', [
    'identify',
    '-format',
    '%w %h',
    path.join(dir, 'f-000.webp'),
  ]);
  const [w, h] = stdout.trim().split(' ').map(Number);

  return { count: kept.length, width: w, height: h };
}

async function main() {
  if (!SOURCE) {
    console.error('Usage : npm run sequence -- <chemin/vers/source.gif|mp4>');
    process.exit(1);
  }

  await assertMagick();

  const manifest = {};

  for (const set of SETS) {
    const { count, width, height } = await extract(set);
    manifest[set.name] = { count, width, height };
    console.log(`  ${set.name.padEnd(4)} → ${count} images (${width}×${height})`);
  }

  /* Le manifeste évite de coder le nombre d'images en dur dans le JS : une
     source plus longue ou plus courte ne demandera aucune modification. */
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nÉcrit dans ${OUT_ROOT}/ et ${MANIFEST} — penser à committer.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
