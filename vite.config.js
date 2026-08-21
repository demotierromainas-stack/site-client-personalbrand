import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  server: { port: 5173, open: true },
  build: {
    // Le site est une page unique : on garde un seul bundle plutôt que
    // de payer un aller-retour réseau pour quelques Ko de chunks.
    assetsInlineLimit: 4096,
  },
});
