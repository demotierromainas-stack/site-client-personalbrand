/**
 * Un article Directus, rendu en HTML.
 *
 * Le client ne saisit qu'un enregistrement dans Directus. Tout le reste — la
 * page, la card sur l'accueil, les liens « poursuivre la lecture », les
 * métadonnées Open Graph, les données structurées — en est déduit ici, au
 * build. C'est ce qui permet de publier sans jamais toucher au HTML.
 *
 * Ce module ne fait que transformer des données en HTML. Il ne connaît ni le
 * réseau (voir directus.mjs) ni le disque (voir generate-articles.mjs), ce qui
 * le rend vérifiable sans Directus sous la main.
 */

import { marked } from 'marked';

const SITE = 'https://jeanmaximehanny.fr';
const AUTEUR = 'Jean-Maxime Hanny';

/* Vitesse de lecture retenue quand le champ est laissé vide. 200 mots/minute
   est la valeur courante pour de la prose en français lue sur écran. */
const MOTS_PAR_MINUTE = 200;

/** Échappe ce qui part dans un attribut HTML (title, content, alt…). */
const attr = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Échappe ce qui part dans du texte HTML. */
const text = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* Deux formats de date, selon la place disponible : le mois s'écrit en toutes
   lettres dans l'en-tête d'un article — « 28 avril 2026 » — et s'abrège dans
   les cards, où la ligne est partagée avec la catégorie. C'est la convention
   déjà en place sur le site. */
const formatLong = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const formatCourt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * La date de publication est un jour, pas un instant. On la lit et on la
 * formate en UTC : sans ça, `2026-05-12` s'affiche « 11 mai » pour un lecteur
 * situé à l'ouest de Greenwich.
 */
function dateParts(valeur) {
  const iso = String(valeur).slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  const jour = new Date(Date.UTC(y, m - 1, d));
  return { iso, longue: formatLong.format(jour), courte: formatCourt.format(jour) };
}

/**
 * Markdown → HTML.
 *
 * `marked` échappe les apostrophes en `&#39;`. Le rendu à l'écran est le même,
 * mais le reste du site écrit `'` en clair : on rétablit la forme courante pour
 * qu'une page produite se lise comme une page écrite à la main. Sans effet de
 * bord — l'apostrophe n'a aucun rôle syntaxique dans du texte HTML ni dans un
 * attribut délimité par des guillemets doubles.
 */
function renderMarkdown(corps) {
  return marked.parse(String(corps ?? '').trim()).replaceAll('&#39;', "'");
}

/**
 * Normalise un enregistrement Directus en la forme attendue par les gabarits.
 *
 * `image` est le chemin public de l'image déjà téléchargée (voir directus.mjs) :
 * ce module ne va jamais la chercher lui-même.
 */
export function prepare(enregistrement, image) {
  for (const champ of ['slug', 'titre', 'categorie', 'date_publication', 'chapo']) {
    if (!enregistrement[champ]) {
      throw new Error(
        `L'article « ${enregistrement.slug ?? enregistrement.titre ?? '?'} » n'a pas de ${champ}. ` +
          'Le champ est obligatoire côté Directus : compléter la fiche avant de publier.',
      );
    }
  }

  const { iso, longue, courte } = dateParts(enregistrement.date_publication);
  const titreComplet = [enregistrement.titre, enregistrement.titre_accent].filter(Boolean).join(' ');

  /* Le temps de lecture est saisissable, mais personne n'a envie de le
     calculer : laissé vide, il se déduit du nombre de mots. */
  const mots = String(enregistrement.corps ?? '').trim().split(/\s+/).filter(Boolean).length;
  const lecture = Number(enregistrement.lecture) || Math.max(1, Math.round(mots / MOTS_PAR_MINUTE));

  return {
    slug: enregistrement.slug,
    url: `/articles/${enregistrement.slug}/`,
    titre: enregistrement.titre,
    titreAccent: enregistrement.titre_accent ?? '',
    titreComplet,
    categorie: enregistrement.categorie,
    dateIso: iso,
    dateLongue: longue,
    dateCourte: courte,
    lecture,
    image,
    imageAlt: enregistrement.image_alt ?? '',
    chapo: enregistrement.chapo,
    description: enregistrement.description || enregistrement.chapo,
    ogDescription: enregistrement.og_description || enregistrement.description || enregistrement.chapo,
    corps: renderMarkdown(enregistrement.corps),
  };
}

/**
 * Une card d'article. Le même bloc sert sur l'accueil et en bas des pages
 * article ; seule la hauteur déclarée de l'image y diffère.
 */
function renderCard(a, { hauteurImage }) {
  return `<a href="${a.url}" class="glass glass-hover group flex flex-col overflow-hidden" data-reveal>
              <div class="overflow-hidden">
                <img
                  src="${attr(a.image)}"
                  alt="${attr(a.imageAlt)}"
                  width="740"
                  height="${hauteurImage}"
                  loading="lazy"
                  decoding="async"
                  class="h-36 w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,0.61,0.36,1)] group-hover:scale-[1.06]"
                />
              </div>
              <div class="flex flex-1 flex-col p-7">
                <div class="flex items-baseline justify-between gap-4">
                  <span class="eyebrow text-copper-400">${text(a.categorie)}</span>
                  <time class="eyebrow text-bone-700" datetime="${a.dateIso}">${a.dateCourte}</time>
                </div>
                <h3 class="mt-4 font-display text-xl leading-snug text-bone-100">
                  ${text(a.titreComplet)}
                </h3>
                <span class="eyebrow card-cta mt-auto flex items-center justify-between gap-4 pt-6">
                  Lire l'article
                  <span aria-hidden="true">&rarr;</span>
                </span>
              </div>
            </a>`;
}

/** La grille de cards de la section « Articles » de l'accueil. */
export function renderHomeCards(articles) {
  /* L'accueil est une vitrine, pas une archive : au-delà de trois cards la
     grille casse et la page s'allonge sans rien apporter. */
  return articles
    .slice(0, 3)
    .map((a) => renderCard(a, { hauteurImage: 263 }))
    .join('\n\n            ');
}

/** Les deux articles proposés en bas de page, hors article courant. */
function renderSuite(courant, articles) {
  const autres = articles.filter((a) => a.slug !== courant.slug).slice(0, 2);
  if (autres.length === 0) return '';

  return `
      <section id="suite" class="relative py-20 lg:py-28">
        <div class="mx-auto max-w-[1240px] px-6 lg:px-10">
          <header class="mb-14">
            <p class="eyebrow text-bone-500" data-reveal>Poursuivre la lecture</p>
            <h2 class="section-title mt-3 text-bone-100" data-reveal>
              Les autres <span class="text-copper-400">réflexions</span>
            </h2>
          </header>

          <div class="grid gap-6 md:grid-cols-2" data-stagger>
            ${autres.map((a) => renderCard(a, { hauteurImage: 245 })).join('\n\n            ')}
          </div>
        </div>
      </section>
`;
}

/**
 * La page complète d'un article.
 *
 * Deux partis pris de mise en page s'y jouent, et ils sont volontaires :
 *  - l'en-tête porte l'id `hero`, ce qui lui vaut la cascade d'entrée de
 *    hero.js, la même que sur les autres pages du site ;
 *  - le corps, lui, n'est pas animé. Sur une section courte, une révélation au
 *    scroll rythme la descente ; sur un texte qu'on lit vraiment, elle oblige à
 *    attendre chaque paragraphe.
 *
 * Les données structurées (JSON-LD) sont ce qui permet à un moteur de
 * reconnaître un article — auteur, date, sujet — plutôt qu'une page quelconque.
 */
export function renderArticlePage(a, articles) {
  const jsonLd = JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: a.titreComplet,
      datePublished: a.dateIso,
      author: { '@type': 'Person', name: AUTEUR },
      image: `${SITE}${a.image}`,
      articleSection: a.categorie,
      mainEntityOfPage: `${SITE}${a.url}`,
    },
    null,
    2,
  )
    .split('\n')
    .join('\n      ');

  /* Le titre est coupé en deux lignes, la seconde en cuivre. Quand l'article
     n'a pas de partie accentuée, on ne laisse pas un <br> orphelin. */
  const titreHtml = a.titreAccent
    ? `${text(a.titre)}<br />\n              <span class="text-copper-400">${text(a.titreAccent)}</span>`
    : text(a.titre);

  return `<!doctype html>
<!--
  Page produite au build par scripts/generate-articles.mjs, à partir de
  l'article « ${a.slug} » dans Directus. Toute modification faite ici sera
  écrasée au prochain build : c'est dans Directus qu'il faut corriger.
-->
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>${text(a.titreComplet)} — ${AUTEUR}</title>
    <meta name="description" content="${attr(a.description)}" />
    <link rel="canonical" href="${SITE}${a.url}" />

    <meta property="og:type" content="article" />
    <meta property="og:url" content="${SITE}${a.url}" />
    <meta property="og:title" content="${attr(a.titreComplet)}" />
    <meta property="og:description" content="${attr(a.ogDescription)}" />
    <meta property="og:image" content="${attr(a.image)}" />
    <meta property="article:published_time" content="${a.dateIso}" />
    <meta property="article:author" content="${AUTEUR}" />
    <meta property="article:section" content="${attr(a.categorie)}" />

    <link rel="preload" as="image" href="${attr(a.image)}" />

    <script type="application/ld+json">
      ${jsonLd}
    </script>

    <!--@include head.html-->
  </head>

  <body data-page="article">
    <a
      href="#hero"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-bone-100"
      >Aller au contenu</a
    >

    <!--@include decor.html-->

    <!--@include header.html-->

    <main>
      <article>
        <header id="hero" class="relative pt-32 lg:pt-40">
          <div class="mx-auto max-w-[1240px] px-6 lg:px-10">
            <nav aria-label="Fil d'Ariane" data-reveal>
              <ol class="eyebrow flex flex-wrap items-center gap-3 text-bone-700">
                <li><a href="/" class="footer-link">Accueil</a></li>
                <li aria-hidden="true">/</li>
                <li><a href="/#articles" class="footer-link">Articles</a></li>
                <li aria-hidden="true">/</li>
                <li class="text-copper-400" aria-current="page">${text(a.categorie)}</li>
              </ol>
            </nav>

            <div class="mt-8 flex flex-wrap items-baseline gap-x-6 gap-y-2" data-reveal>
              <span class="eyebrow text-copper-400">${text(a.categorie)}</span>
              <time class="eyebrow text-bone-700" datetime="${a.dateIso}">${a.dateLongue}</time>
              <span class="eyebrow text-bone-700">${a.lecture} min de lecture</span>
            </div>

            <h1
              class="font-display mt-6 max-w-4xl text-[clamp(2.125rem,5vw,3.75rem)] leading-[1.08] text-bone-100"
              data-reveal
            >
              ${titreHtml}
            </h1>

            <p class="article-lead mt-8 max-w-2xl" data-reveal>
              ${text(a.chapo)}
            </p>

            <figure class="mt-14" data-reveal-fade>
              <img
                src="${attr(a.image)}"
                alt="${attr(a.imageAlt)}"
                width="740"
                height="245"
                class="h-[220px] w-full rounded-[14px] object-cover lg:h-[420px]"
              />
            </figure>
          </div>
        </header>

        <div class="mx-auto max-w-[1240px] px-6 lg:px-10">
          <div class="prose mx-auto mt-16 max-w-[42rem] lg:mt-20">
${a.corps.trimEnd().replace(/^/gm, '            ')}
          </div>

          <div class="mx-auto mt-16 flex max-w-[42rem] items-center gap-5 border-t border-white/[0.07] pt-8">
            <span class="font-display text-3xl leading-none text-copper-400" aria-hidden="true">JMH</span>
            <div>
              <p class="eyebrow text-bone-300">${AUTEUR}</p>
              <p class="mt-2 text-sm font-light text-bone-500">
                Entrepreneur, investisseur et développeur de projets.
              </p>
            </div>
          </div>
        </div>
      </article>
${renderSuite(a, articles)}
      <!--@include cta.html-->
    </main>

    <!--@include footer.html-->

    <script type="module" src="/src/js/main.js"></script>
  </body>
</html>
`;
}
