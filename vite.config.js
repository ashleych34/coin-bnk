import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built site works on GitHub Pages regardless of
  // the repository name (served from /<repo>/ rather than the domain root).
  base: './',
});
