/**
 * Extraction de la séquence d'images animée au scroll (personnage du hero).
 *
 * Outil ponctuel, lancé à la main. Il n'est PAS branché sur le build : les
 * images produites sont versionnées dans `public/img/sequence/`, et la CI les
 * recopie telles quelles. C'est volontaire — la source ne change qu'à chaque
 * nouvelle vidéo du client, et faire dépendre le déploiement de ffmpeg et
 * d'ImageMagick pour un asset figé serait un mauvais échange.
 *
 * Pourquoi une séquence d'images et pas une balise <video> :
 * piloter `currentTime` au scroll donne un rendu saccadé sur Safari et iOS,
 * même en ré-encodant tout en images-clés. Dessiner des images déjà décodées
 * dans un canvas est fluide partout, au prix d'un poids plus élevé — qu'on
 * compense par le chargement paresseux (voir src/js/sequence.js).
 *
 *   npm run sequence -- ~/Desktop/nouveau-portait.mp4
 *
 * Deux outils, et chacun fait ce qu'il fait le mieux : ffmpeg décode, recadre,
 * échantillonne ; ImageMagick encode en WebP. Le décodage ne passe plus par
 * ImageMagick seul — son délégué vidéo échoue avec les ffmpeg récents (il lui
 * demande un fichier de sortie sans extension, d'où un « Encoder not found »
 * incompréhensible). Passer par ffmpeg en direct règle du même coup le cas du
 * GIF, dont les images n'encodent que les pixels qui changent : ffmpeg sort
 * toujours des images complètes, là où ImageMagick réclamait `-coalesce`.
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

const SOURCE = process.argv[2];
const OUT_ROOT = 'public/img/sequence';

/* Le manifeste vit dans `src/` et non à côté des images : Vite refuse qu'on
   importe depuis `public/`, dont le contenu est copié tel quel sans passer par
   le graphe de modules. Importé depuis `src/`, il est inliné dans le bundle —
   pas de requête réseau supplémentaire au chargement. */
const MANIFEST = 'src/data/sequence.json';

/* La source est carrée (960×960, sujet centré), le cadre du hero est paysage.
   On recadre donc à la production plutôt qu'à l'exécution : les pixels jetés
   ne sont pas téléchargés, et la décision de cadrage se voit dans les images
   au lieu de dépendre d'un `object-fit` qu'on relit de travers six mois plus
   tard.

   960×696 au format `crop=l:h:x:y`, soit le ratio du conteneur desktop
   (800/580), pris au centre vertical de la source — d'où le décalage de
   132 px. Le centre marche parce que le cadreur a laissé de l'air au-dessus
   du crâne, et tout juste : descendre la fenêtre de recadrage entamerait la
   tête. À vérifier sur la première image à chaque nouvelle source.

   Pourquoi le ratio desktop et pas celui du mobile (800/620, plus haut) : le
   conteneur mobile est alors plus étroit que l'image, donc `object-fit: cover`
   rogne les côtés. Dans l'autre sens il rognerait le haut, c'est-à-dire le
   crâne. On se laisse toujours rogner là où il n'y a rien. */
const CROP = '960:696:0:132';

/* Deux jeux d'images.
   — 800 : la largeur d'affichage. La source recadrée fait 960 de large, on
     réduit donc légèrement ; on n'agrandit jamais, un agrandissement se voit
     immédiatement sur un visage.
   — 480 : le jeu mobile, une image sur deux par rapport au jeu 800. Sur un
     écran de téléphone la moitié des images suffit pour que le mouvement
     reste continu, et ça divise le poids par quatre.

   `step` échantillonne la source, qui est en 24 images/seconde — une finesse
   faite pour une lecture en temps réel, pas pour une course au scroll qui
   s'étale sur un demi-écran. Une image sur deux suffit à ce que le mouvement
   reste continu, et divise le poids par deux. */
const SETS = [
  { name: '800', width: 800, quality: 76, step: 2 },
  { name: '480', width: 480, quality: 74, step: 4 },
];

/* La fin de la source ne sert à rien.
   Passé la 136e image il ne reste que le décor vide : les particules sont
   retombées, le plan n'est plus qu'un couloir désert. On coupe tant qu'une
   trace subsiste — c'est sur cette image-là que la course au scroll s'arrête,
   et une poignée de particules encore en suspension y vaut mieux qu'un décor
   nu. Ça épargne aussi la fin du fichier, celle où il ne se passe plus rien.

   À réajuster si la vidéo source change. */
const KEEP_UNTIL = 136;

async function assertTool(command, brew) {
  try {
    await run(command, ['-version']);
  } catch {
    console.error(
      `${command} est introuvable. Installer avec \`brew install ${brew}\`,\n` +
        "puis relancer. Aucune image n'a été écrite.",
    );
    process.exit(1);
  }
}

/**
 * ffmpeg décode, recadre et échantillonne en une passe, vers un dossier
 * temporaire ; ImageMagick encode ensuite le lot en WebP.
 *
 * `select` porte les deux décisions d'échantillonnage — la coupe de fin et le
 * pas — et `-start_number 0` fait numéroter la sortie en continu à partir de
 * zéro. Le JS calcule un index à partir d'une progression : il lui faut une
 * suite sans trou, et c'est ffmpeg qui la lui donne, sans renumérotation
 * après coup.
 */
async function extract({ name, width, quality, step }) {
  const dir = path.join(OUT_ROOT, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const stage = await mkdtemp(path.join(tmpdir(), 'sequence-'));

  try {
    await run('ffmpeg', [
      '-v', 'error',
      '-i', SOURCE,
      '-vf',
      `crop=${CROP},select='lte(n\\,${KEEP_UNTIL})*not(mod(n\\,${step}))',scale=${width}:-1`,
      '-fps_mode', 'passthrough',
      '-start_number', '0',
      path.join(stage, 'f-%03d.png'),
    ]);

    const pngs = (await readdir(stage)).filter((f) => f.endsWith('.png')).sort();
    if (!pngs.length) throw new Error(`Aucune image extraite de ${SOURCE}.`);

    /* `mogrify` en un seul appel plutôt qu'un `magick` par image : sur une
       centaine d'images, le coût de démarrage du binaire dépasse celui de
       l'encodage. */
    await run('magick', [
      'mogrify',
      '-format', 'webp',
      '-quality', String(quality),
      '-define', 'webp:method=6',
      '-path', dir,
      ...pngs.map((f) => path.join(stage, f)),
    ]);

    const { stdout } = await run('magick', [
      'identify',
      '-format',
      '%w %h',
      path.join(dir, 'f-000.webp'),
    ]);
    const [w, h] = stdout.trim().split(' ').map(Number);

    return { count: pngs.length, width: w, height: h };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function main() {
  if (!SOURCE) {
    console.error('Usage : npm run sequence -- <chemin/vers/source.mp4|gif>');
    process.exit(1);
  }

  await assertTool('ffmpeg', 'ffmpeg');
  await assertTool('magick', 'imagemagick');

  /* Version des URLs, changée à chaque production. Les fichiers gardent leur
     nom d'une séquence à l'autre : c'est elle, et elle seule, qui fait
     retélécharger les images aux visiteurs déjà venus. */
  const version = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const manifest = { version };

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
  console.log(
    `\nÀ reporter dans index.html, sur le poster ET le préchargement :\n` +
    `  /img/sequence/800/f-000.webp?v=${version}\n` +
    `Sans ça, les visiteurs déjà venus garderont l'ancienne première image.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
