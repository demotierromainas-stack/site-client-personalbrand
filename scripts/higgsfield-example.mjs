/**
 * Exemple minimal : génération vidéo via Seedance 2.5 (Higgsfield).
 *
 * Sert à vérifier que l'intégration fonctionne de bout en bout :
 * authentification, soumission, attente du résultat, récupération de l'URL.
 * Requête RÉELLE et FACTURÉE côté Higgsfield — ne pas lancer en boucle.
 *
 *   npm run higgsfield:example
 *
 * Identifiants : HF_CREDENTIALS dans .env.local (format id:secret, voir
 * env.example pour le modèle de fichier). Fichier non versionné.
 */

import { config, higgsfield, HiggsfieldError } from '@higgsfield/client/v2';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Comme dans scripts/directus.mjs : loadEnvFile est fourni par Node, inutile
   d'ajouter dotenv pour lire un fichier de quelques lignes. */
try {
  process.loadEnvFile(resolve(ROOT, '.env.local'));
} catch {
  // Pas de .env.local : les variables viennent alors de l'environnement (CI…).
}

if (!process.env.HF_CREDENTIALS) {
  console.error(
    '\n✖ HF_CREDENTIALS manquant. Mettre la clé (format id:secret) dans ' +
      '.env.local :\n  HF_CREDENTIALS=xxxxx:xxxxx\n',
  );
  process.exit(1);
}

config({ credentials: process.env.HF_CREDENTIALS });

const MODELE = 'bytedance/seedance-2.5/text-to-video';

const ENTREE = {
  prompt: 'A cinematic scene at sunset',
  duration: 5,
  resolution: '720p',
  aspect_ratio: '16:9',
};

async function main() {
  console.log(`… génération « ${MODELE} » en cours (peut prendre une minute ou deux)…`);

  const resultat = await higgsfield.subscribe(MODELE, {
    input: ENTREE,
    withPolling: true,
  });

  /* Le SDK ne lève pas d'erreur pour un échec « métier » (modération, panne
     de génération…) : withPolling attend un état terminal puis résout dans
     tous les cas, et c'est resultat.status qui porte l'issue réelle. Un
     succès exige status === 'completed' ET une URL vidéo présente — tout le
     reste est un échec, jamais une réussite par défaut. */
  if (resultat.status === 'completed' && resultat.video?.url) {
    console.log(`\n✓ Vidéo générée : ${resultat.video.url}\n`);
    return;
  }

  const raisons = {
    nsfw: 'requête bloquée par la modération de contenu (nsfw)',
    failed: 'la génération a échoué côté Higgsfield',
    canceled: 'la requête a été annulée',
    queued: "la requête est restée en file d'attente (délai anormal)",
    in_progress: "la requête est restée « en cours » sans aboutir (délai anormal)",
  };

  throw new Error(
    `Génération non aboutie — statut « ${resultat.status} » : ` +
      `${raisons[resultat.status] ?? 'statut inattendu, voir la réponse brute ci-dessous'}. ` +
      `request_id=${resultat.request_id ?? '?'} status_url=${resultat.status_url ?? '?'}\n` +
      `Réponse complète : ${JSON.stringify(resultat, null, 2)}`,
  );
}

main().catch((erreur) => {
  if (erreur instanceof HiggsfieldError) {
    console.error(
      `\n✖ Erreur SDK Higgsfield (${erreur.constructor.name}) : ${erreur.message}\n`,
    );
  } else {
    console.error(`\n✖ ${erreur.message}\n`);
  }
  process.exit(1);
});
