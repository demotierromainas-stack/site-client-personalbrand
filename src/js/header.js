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

  /* ---- Menu mobile ---- */
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
