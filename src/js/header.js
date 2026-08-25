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
  initMobileMenu();
}

/**
 * Marque la page courante dans la navigation et le footer.
 *
 * Fait en JS plutôt qu'en dur dans le HTML : le header et le footer sont des
 * partials partagés par les quatre pages, les écrire en dur imposerait quatre
 * variantes de chacun.
 *
 * Seules les pages activité sont marquées — dans le footer, seul endroit qui
 * les liste encore. L'accueil n'est atteint que par des liens d'ancre, tous de
 * chemin « / » : les marquer reviendrait à désigner toutes les entrées de menu
 * comme courantes en même temps.
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

}

/** « /procuve/index.html », « /procuve » et « /procuve/ » désignent la même page. */
function normalizePath(pathname) {
  return pathname.replace(/index\.html$/, '').replace(/([^/])$/, '$1/');
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
