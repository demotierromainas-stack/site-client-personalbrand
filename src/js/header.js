import { gsap, ScrollTrigger } from './motion.js';

/**
 * Header : transparent au-dessus du hero, opaque dès qu'on descend.
 * Piloté par ScrollTrigger plutôt que par un écouteur de scroll, pour rester
 * synchronisé avec Lenis et ne pas recalculer à chaque frame.
 */
export function initHeader() {
  const header = document.querySelector('#site-header');
  if (!header) return;

  ScrollTrigger.create({
    start: 'top -80',
    end: 99999,
    onToggle: (self) => {
      header.classList.toggle('is-scrolled', self.isActive);
    },
  });

  markCurrentPage();
  initActivitiesMenu();
  initMobileMenu();
}

/**
 * Marque la page courante dans la navigation et le footer.
 *
 * Fait en JS plutôt qu'en dur dans le HTML : le header et le footer sont des
 * partials partagés par les quatre pages, les écrire en dur imposerait quatre
 * variantes de chacun.
 *
 * Seules les pages activité sont marquées. L'accueil n'est atteint que par des
 * liens d'ancre, tous de chemin « / » : les marquer reviendrait à désigner
 * quatre entrées de menu comme courantes en même temps.
 */
function markCurrentPage() {
  const here = normalizePath(window.location.pathname);
  if (here === '/') return;

  document
    .querySelectorAll('#site-header a[href], footer a[href]')
    .forEach((link) => {
      if (normalizePath(new URL(link.href).pathname) === here) {
        link.setAttribute('aria-current', 'page');
      }
    });

  // Le bouton « Activités » ouvre le sous-menu où se trouve la page courante.
  // `aria-current` ne s'applique pas à un bouton qui ne navigue pas : on passe
  // par un attribut de présentation, que le CSS souligne comme un lien actif.
  const toggle = document.querySelector('#activites-toggle');
  if (toggle && document.querySelector('.nav-submenu a[aria-current="page"]')) {
    toggle.dataset.current = 'true';
  }
}

/** « /procuve/index.html », « /procuve » et « /procuve/ » désignent la même page. */
function normalizePath(pathname) {
  return pathname.replace(/index\.html$/, '').replace(/([^/])$/, '$1/');
}

/**
 * Sous-menu « Activités » du header desktop.
 *
 * L'ouverture elle-même est en CSS (`:hover` et `:focus-within`) : elle
 * fonctionne donc avant le chargement du JS, et à la souris comme au clavier.
 * Le JS ne sert qu'à ce que le CSS seul ne peut pas faire — tenir
 * `aria-expanded` à jour, et permettre la fermeture par Échap.
 */
function initActivitiesMenu() {
  const group = document.querySelector('.nav-group');
  const toggle = document.querySelector('#activites-toggle');
  const menu = document.querySelector('#activites-menu');
  if (!group || !toggle || !menu) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    // Toute ouverture annule une fermeture forcée précédente, sinon le menu
    // resterait replié jusqu'à ce que le pointeur quitte le groupe.
    if (open) delete menu.dataset.collapsed;
  };

  group.addEventListener('pointerenter', () => setOpen(true));
  group.addEventListener('pointerleave', () => setOpen(false));
  group.addEventListener('focusin', () => setOpen(true));
  group.addEventListener('focusout', (event) => {
    if (!group.contains(event.relatedTarget)) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!group.contains(document.activeElement)) return;

    // Le focus revient sur le bouton — il ne part pas dans le vide — et
    // l'attribut force le repli malgré le `:focus-within` toujours vrai.
    menu.dataset.collapsed = 'true';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  });
}

/** Menu mobile plein écran, sous le header. */
function initMobileMenu() {
  const toggle = document.querySelector('#menu-toggle');
  const nav = document.querySelector('#mobile-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('hidden', !open);
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Refermer après navigation : le lien scrolle vers une ancre de la même page,
  // le menu resterait ouvert par-dessus la destination.
  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  // Le menu mobile n'a plus lieu d'être si la fenêtre repasse en desktop.
  gsap.matchMedia().add('(min-width: 1024px)', () => {
    setOpen(false);
  });
}
