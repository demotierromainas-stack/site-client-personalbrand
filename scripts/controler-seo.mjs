#!/usr/bin/env node
/**
 * Contrôle SEO d'un site statique déjà construit.
 *
 * Il lit le HTML produit — pas les sources — parce que c'est le seul état qui
 * compte : ce que l'hébergeur servira, et ce que Google lira. Une métadonnée
 * correcte dans un composant mais perdue par un héritage de layout se voit ici
 * et nulle part ailleurs.
 *
 * Aucune dépendance : Node seul. Le parsing par expressions régulières suffit
 * parce que la cible est du HTML généré, régulier et bien formé — pas du HTML
 * écrit à la main.
 *
 * Usage :
 *   npm run seo                     contrôle dist/, échoue s'il manque quelque chose
 *   npm run seo -- --rapport        rapporte tout sans échouer (audit)
 *   npm run seo -- --production     exige en plus l'absence de noindex
 *
 *   node scripts/controler-seo.mjs [dossier] [options]
 *
 *   dossier                 Sortie statique à inspecter (défaut : dist)
 *   --base-url <url>        URL canonique attendue (défaut : celle de site.mjs)
 *   --no-trailing-slash     Les URL attendues n'ont pas de barre finale.
 *   --ignorer a,b           Chemins à ne pas inspecter (sous-chaînes, séparées par des virgules).
 *
 * Sort en 1 dès qu'une erreur est trouvée, sauf en --rapport. C'est ce qui en
 * fait une barrière : il est appelé par le workflow de déploiement avant le
 * rsync, pour qu'une page sans canonical ou absente du sitemap ne parte pas en
 * ligne.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { SITE } from "./site.mjs";

/* ------------------------------------------------------------------ seuils */

/* Des repères d'affichage, pas de classement : Google tronque au-delà et
   réécrit souvent la description. Hors bornes = avertissement, jamais erreur —
   un titre long ne casse rien, un titre dupliqué si. */
const TITRE_MIN = 25;
const TITRE_MAX = 65;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

/* Pages que les moteurs ne doivent pas voir de toute façon. Le site n'en a
   pas aujourd'hui ; la liste reste pour le jour où une page d'erreur ou une
   page de remerciement apparaîtra. */
const EXCLUS_PAR_DEFAUT = ["/404"];

/* ------------------------------------------------------------ arguments */

function lireArguments(argv) {
  const opts = {
    dossier: "dist",
    baseUrl: SITE,
    rapport: false,
    production: false,
    trailingSlash: true,
    ignorer: [],
  };
  const restants = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rapport") opts.rapport = true;
    else if (a === "--production") opts.production = true;
    else if (a === "--no-trailing-slash") opts.trailingSlash = false;
    else if (a === "--trailing-slash") opts.trailingSlash = true;
    else if (a === "--base-url") opts.baseUrl = argv[++i];
    else if (a === "--ignorer") opts.ignorer = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (a.startsWith("--")) {
      console.error(`Option inconnue : ${a}`);
      process.exit(2);
    } else restants.push(a);
  }

  if (restants[0]) opts.dossier = restants[0];
  if (opts.baseUrl) opts.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  return opts;
}

/* -------------------------------------------------------------- utilitaires */

/** Les entités du HTML produit faussent les longueurs mesurées. */
function decoder(texte) {
  return texte
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Attributs d'une balise unique, noms en minuscules.
 *
 * Le nom de la balise est retiré d'abord : sans ça il ressort comme un
 * attribut sans valeur et pollue le résultat.
 */
function attributs(balise) {
  const corps = balise.replace(/^<[a-zA-Z][a-zA-Z0-9]*/, "").replace(/\/?>$/, "");
  const out = {};
  for (const m of corps.matchAll(/([a-zA-Z:_-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g)) {
    out[m[1].toLowerCase()] = decoder(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function balises(html, nom) {
  return [...html.matchAll(new RegExp(`<${nom}\\s[^>]*>`, "gi"))].map((m) => m[0]);
}

/** Contenu d'une meta, cherchée par `name` puis par `property`. */
function meta(html, clef) {
  for (const b of balises(html, "meta")) {
    const a = attributs(b);
    if (a.name?.toLowerCase() === clef || a.property?.toLowerCase() === clef) return a.content ?? "";
  }
  return null;
}

function lien(html, rel) {
  for (const b of balises(html, "link")) {
    const a = attributs(b);
    if (a.rel?.toLowerCase() === rel) return a.href ?? "";
  }
  return null;
}

/* --------------------------------------------------------- parcours fichiers */

async function listerHtml(racine, dossier = racine, trouves = []) {
  for (const entree of await readdir(dossier)) {
    const complet = path.join(dossier, entree);
    const info = await stat(complet);
    if (info.isDirectory()) {
      await listerHtml(racine, complet, trouves);
    } else if (entree.endsWith(".html")) {
      trouves.push(complet);
    }
  }
  return trouves;
}

/** `dist/senior-ia/index.html` → `/senior-ia/` ; `dist/index.html` → `/`. */
function routeDuFichier(racine, fichier, trailingSlash) {
  let rel = path.relative(racine, fichier).split(path.sep).join("/");
  rel = rel.replace(/index\.html$/, "").replace(/\.html$/, "");
  let route = "/" + rel;
  route = route.replace(/\/{2,}/g, "/");
  if (route !== "/") {
    route = route.replace(/\/$/, "");
    if (trailingSlash) route += "/";
  }
  return route;
}

/* ------------------------------------------------------------- les contrôles */

function controlerPage({ html, route, racine, baseUrl, opts }) {
  const constats = [];
  const erreur = (m) => constats.push({ niveau: "erreur", message: m });
  const avertir = (m) => constats.push({ niveau: "avertissement", message: m });

  /* Langue — un lecteur d'écran comme un moteur en dépendent, et c'est une
     ligne dans le layout racine : jamais une bonne raison de l'omettre. */
  const langue = html.match(/<html[^>]*\slang\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!langue) erreur("<html> sans attribut lang");

  /* Un seul h1 : c'est le titre de la page pour un moteur comme pour un
     lecteur d'écran. Zéro le prive de repère, plusieurs le brouillent. */
  const h1 = (html.match(/<h1[\s>]/gi) ?? []).length;
  if (h1 === 0) erreur("aucun <h1>");
  else if (h1 > 1) erreur(`${h1} balises <h1> (il en faut une seule)`);

  /* Titre */
  const titreBrut = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const titre = titreBrut ? decoder(titreBrut) : null;
  if (!titre) erreur("<title> absent ou vide");
  else if (titre.length < TITRE_MIN) avertir(`<title> court (${titre.length} car., repère ≥ ${TITRE_MIN})`);
  else if (titre.length > TITRE_MAX) avertir(`<title> long (${titre.length} car., tronqué au-delà de ~${TITRE_MAX})`);

  /* Description */
  const description = meta(html, "description");
  if (!description) erreur("meta description absente");
  else if (description.length < DESCRIPTION_MIN)
    avertir(`meta description courte (${description.length} car., repère ≥ ${DESCRIPTION_MIN})`);
  else if (description.length > DESCRIPTION_MAX)
    avertir(`meta description longue (${description.length} car., tronquée au-delà de ~${DESCRIPTION_MAX})`);

  /* Canonical : présent, absolu, et désignant bien cette page. Un canonical
     qui pointe ailleurs est plus nocif qu'un canonical absent — il demande
     explicitement à Google de désindexer la page. */
  const canonical = lien(html, "canonical");
  if (!canonical) {
    erreur("link rel=canonical absent");
  } else if (!/^https?:\/\//i.test(canonical)) {
    erreur(`canonical relatif (${canonical}) — il doit être absolu`);
  } else {
    let u = null;
    try {
      u = new URL(canonical);
    } catch {
      erreur(`canonical illisible (${canonical})`);
    }
    if (u) {
      if (u.pathname !== route) erreur(`canonical vers ${u.pathname}, attendu ${route}`);
      if (baseUrl && u.origin !== new URL(baseUrl).origin)
        erreur(`canonical sur ${u.origin}, attendu ${new URL(baseUrl).origin}`);
    }
  }

  /* Open Graph — l'aperçu des partages. og:image est le seul des trois dont
     l'absence se voit à l'œil nu dans une conversation. */
  for (const clef of ["og:title", "og:description", "og:image"]) {
    if (!meta(html, clef)) erreur(`${clef} absent`);
  }

  /* L'image OG doit exister : une URL correcte vers un fichier absent donne le
     même aperçu nu qu'une balise manquante, en étant plus difficile à repérer.

     Elle doit aussi être absolue — la spécification l'exige, et LinkedIn
     n'affiche rien d'un chemin relatif. Le build s'en charge (plugin
     « metadonnees-seo ») : un chemin relatif ici signale que la balise a
     échappé au plugin, pas que la page est mal écrite. */
  const ogImage = meta(html, "og:image");
  if (ogImage && !/^https?:\/\//i.test(ogImage)) {
    erreur(`og:image relative (${ogImage}) — elle doit être absolue`);
  }
  if (ogImage) {
    let chemin = null;
    if (ogImage.startsWith("/")) chemin = ogImage;
    else if (baseUrl && ogImage.startsWith(baseUrl)) chemin = ogImage.slice(baseUrl.length);
    if (chemin) {
      const surDisque = path.join(racine, decodeURIComponent(chemin.split("?")[0]));
      if (!existsSync(surDisque)) erreur(`og:image introuvable sur le disque (${chemin})`);
    }
  }

  /* Icônes — l'image que Chrome met dans l'onglet et que Google affiche à
     côté du résultat de recherche. Elles sont déclarées une fois dans le
     partial du <head> : absentes d'une page, c'est que la page a été écrite
     sans lui. Introuvables sur le disque, c'est plus sournois — la déclaration
     reste juste, et `rsync --delete` efface du serveur tout fichier que le
     build ne produit pas, donc l'icône disparaît du site sans qu'aucune page
     ne change. Google retombe alors sur un globe gris, et met des semaines à
     revenir dessus. */
  const icones = balises(html, "link")
    .map(attributs)
    .filter((a) => /\b(icon|apple-touch-icon)\b/i.test(a.rel ?? ""));
  if (icones.length === 0) erreur("aucune icône déclarée (link rel=icon)");
  for (const icone of icones) {
    const href = icone.href ?? "";
    /* Une icône hébergée ailleurs ne se contrôle pas sur le disque. Le site
       n'en sert aucune ; le cas est écarté, pas oublié. */
    if (!href.startsWith("/")) continue;
    const surDisque = path.join(racine, decodeURIComponent(href.split("?")[0]));
    if (!existsSync(surDisque)) erreur(`icône introuvable sur le disque (${href})`);
  }

  /* JSON-LD : du JSON invalide est purement et simplement ignoré, sans le
     moindre signal. Autant le détecter au build. */
  const blocs = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  blocs.forEach((bloc, i) => {
    let donnees;
    try {
      donnees = JSON.parse(bloc[1]);
    } catch (e) {
      erreur(`JSON-LD nº${i + 1} illisible : ${e.message}`);
      return;
    }
    for (const objet of Array.isArray(donnees) ? donnees : [donnees]) {
      if (!objet || typeof objet !== "object") {
        erreur(`JSON-LD nº${i + 1} : valeur qui n'est pas un objet`);
        continue;
      }
      if (!objet["@context"]) erreur(`JSON-LD nº${i + 1} sans @context`);

      /* Un graphe nommé (`@graph`) décrit plusieurs entités sous un seul
         @context — la personne et le site sur l'accueil, l'article et son fil
         d'Ariane sur un article. Le @type est alors porté par chaque nœud, pas
         par la racine : la contrôler elle reviendrait à refuser une forme
         parfaitement valide, et donc à pousser à l'écrire autrement pour faire
         passer le contrôle. */
      const noeuds = Array.isArray(objet["@graph"]) ? objet["@graph"] : [objet];
      if (noeuds.length === 0) erreur(`JSON-LD nº${i + 1} : @graph vide`);
      for (const noeud of noeuds) {
        if (!noeud || typeof noeud !== "object") {
          erreur(`JSON-LD nº${i + 1} : entité qui n'est pas un objet`);
        } else if (!noeud["@type"]) {
          erreur(`JSON-LD nº${i + 1} : entité sans @type`);
        }
      }
    }
  });

  /* noindex résiduel : le verrou d'aperçu qu'on oublie de lever est la panne
     SEO la plus coûteuse qui soit, et la plus silencieuse. */
  const robots = meta(html, "robots") ?? "";
  if (opts.production && /noindex/i.test(robots)) erreur(`meta robots contient noindex (${robots})`);

  /* alt manquant. `alt=""` est légitime pour une image décorative : on ne
     signale que l'attribut absent, pas l'attribut vide. */
  const sansAlt = balises(html, "img").filter((b) => !/\salt\s*=/i.test(b)).length;
  if (sansAlt > 0) erreur(`${sansAlt} <img> sans attribut alt`);

  return { constats, titre, description, robots };
}

/* ----------------------------------------------------------------- sitemap */

/**
 * Les redirections déclarées dans le `.htaccess` produit.
 *
 * Deux dérives qu'on ne voit pas autrement : rediriger une adresse que le
 * build produit encore (la redirection masque alors une page vivante), et
 * rediriger vers une page qui n'existe pas (une erreur devient deux).
 */
async function lireRedirections(racine) {
  const fichier = path.join(racine, ".htaccess");
  if (!existsSync(fichier)) return [];
  const texte = await readFile(fichier, "utf8");
  /* La cible est écrite en absolu dans le fichier — c'est ce qui évite un
     second aller-retour quand la demande arrive sur www. On la ramène à son
     chemin pour la comparer aux pages construites. */
  const chemin = (url) => (url.startsWith(SITE) ? url.slice(SITE.length) : url);

  return [...texte.matchAll(/^\s*RedirectMatch\s+301\s+\^(\S+?)\/\?\$\s+(\S+)/gim)].map((m) => ({
    source: `${m[1]}/`,
    cible: chemin(m[2]),
  }));
}

async function lireSitemap(racine) {
  const fichier = path.join(racine, "sitemap.xml");
  if (!existsSync(fichier)) return null;
  const xml = await readFile(fichier, "utf8");
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decoder(m[1]));
}

/* -------------------------------------------------------------------- main */

async function main() {
  const opts = lireArguments(process.argv.slice(2));
  const racine = path.resolve(opts.dossier);

  if (!existsSync(racine)) {
    console.error(`Dossier introuvable : ${racine}\nConstruire le site d'abord (npm run build).`);
    process.exit(2);
  }

  const urlsSitemap = await lireSitemap(racine);

  /* L'URL de base du sitemap évite de la redemander en argument, et c'est la
     même source de vérité que celle utilisée par les canonical. */
  let baseUrl = opts.baseUrl;
  if (!baseUrl && urlsSitemap?.length) {
    try {
      baseUrl = new URL(urlsSitemap[0]).origin;
    } catch {}
  }

  const ignorer = [...EXCLUS_PAR_DEFAUT, ...opts.ignorer];
  const fichiers = await listerHtml(racine);

  const pages = [];
  for (const fichier of fichiers) {
    const route = routeDuFichier(racine, fichier, opts.trailingSlash);
    if (ignorer.some((motif) => route.startsWith(motif))) continue;
    const html = await readFile(fichier, "utf8");
    pages.push({ route, fichier, ...controlerPage({ html, route, racine, baseUrl, opts }) });
  }

  pages.sort((a, b) => a.route.localeCompare(b.route));

  /* Doublons : deux pages au même titre se concurrencent sur la même requête,
     et Google en choisit une. C'est une perte nette, invisible page par page —
     elle n'apparaît qu'en comparant l'ensemble. */
  /* La comparaison ignore les espaces en trop et la casse. Deux titres qui ne
     diffèrent que par une double espace sont le même titre pour un lecteur
     comme pour Google — mais pas pour `===`, et c'est exactement par là que
     deux articles homonymes sont passés en ligne. On compare donc une forme
     normalisée, tout en affichant la valeur telle qu'elle est écrite. */
  const normaliser = (v) => v.replace(/\s+/g, " ").trim().toLowerCase();

  const doublons = (champ) => {
    const index = new Map();
    for (const p of pages) {
      const v = p[champ];
      if (!v) continue;
      const clef = normaliser(v);
      const vu = index.get(clef) ?? { valeur: v, routes: [] };
      vu.routes.push(p.route);
      index.set(clef, vu);
    }
    return [...index.values()].filter(({ routes }) => routes.length > 1).map(({ valeur, routes }) => [valeur, routes]);
  };

  const globaux = [];
  for (const [valeur, routes] of doublons("titre"))
    globaux.push(`<title> identique sur ${routes.join(", ")} : « ${valeur} »`);
  for (const [valeur, routes] of doublons("description"))
    globaux.push(`meta description identique sur ${routes.join(", ")} : « ${valeur.slice(0, 60)}… »`);

  /* Cohérence sitemap ↔ pages, dans les deux sens : une page hors sitemap
     n'est jamais découverte, une URL au sitemap sans page remonte en erreur
     dans la Search Console. C'est le contrôle qui rattrape les renommages. */
  if (!urlsSitemap) {
    globaux.push("sitemap.xml absent du dossier de sortie");
  } else {
    const cheminsSitemap = new Set(
      urlsSitemap.map((u) => {
        try {
          return new URL(u).pathname;
        } catch {
          return u;
        }
      }),
    );
    const routes = new Set(pages.map((p) => p.route));
    for (const r of routes) if (!cheminsSitemap.has(r)) globaux.push(`page construite absente du sitemap : ${r}`);
    for (const r of cheminsSitemap) if (!routes.has(r)) globaux.push(`URL au sitemap sans page construite : ${r}`);
  }

  for (const { source, cible } of await lireRedirections(racine)) {
    const routes = new Set(pages.map((p) => p.route));
    if (routes.has(source)) globaux.push(`redirection depuis ${source}, que le build produit pourtant encore`);
    if (!routes.has(cible)) globaux.push(`redirection vers ${cible}, qui n'est pas une page construite`);
  }

  /* ------------------------------------------------------------- rapport */

  let erreurs = 0;
  let avertissements = 0;

  /* Un chemin relatif qui remonte hors du dossier courant est illisible : dans
     ce cas l'absolu informe mieux. */
  const relatif = path.relative(process.cwd(), racine);
  const affiche = !relatif ? "." : relatif.startsWith("..") ? racine : relatif;

  console.log(`\nContrôle SEO — ${pages.length} pages dans ${affiche}`);
  if (baseUrl) console.log(`URL de base : ${baseUrl}`);
  if (!opts.production) console.log("Mode aperçu : le noindex résiduel n'est pas contrôlé (--production pour l'exiger).");
  console.log("");

  for (const page of pages) {
    if (page.constats.length === 0) {
      console.log(`  ok   ${page.route}`);
      continue;
    }
    console.log(`  ${page.route}`);
    for (const { niveau, message } of page.constats) {
      if (niveau === "erreur") {
        erreurs++;
        console.log(`    ✗  ${message}`);
      } else {
        avertissements++;
        console.log(`    ⚠  ${message}`);
      }
    }
  }

  if (globaux.length) {
    console.log("\n  ensemble du site");
    for (const message of globaux) {
      erreurs++;
      console.log(`    ✗  ${message}`);
    }
  }

  console.log(`\n${erreurs} erreur(s), ${avertissements} avertissement(s).`);

  if (erreurs === 0) {
    console.log("Contrôle SEO vert.\n");
    process.exit(0);
  }

  if (opts.rapport) {
    console.log("Mode --rapport : rien n'échoue. Retirer --rapport pour en faire une barrière.\n");
    process.exit(0);
  }

  console.log("Contrôle SEO en échec.\n");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
