import { defineConfig } from 'vite'

// GitHub Pages serves this project from /origami-crane-tutorial/.
// Local dev keeps the root base so `npm run dev` works unchanged.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/origami-crane-tutorial/' : '/',
}))
