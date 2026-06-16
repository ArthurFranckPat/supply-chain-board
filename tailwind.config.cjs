/**
 * Stub de config Tailwind — requis par le CLI shadcn-solid (qui valide
 * components.json → tailwind.config). Le projet tourne en Tailwind v4
 * (config CSS via @theme dans resources/css/app.css) ; ce fichier n'est
 * lu que par le CLI, pas par le build Vite/@tailwindcss/vite.
 */
module.exports = {
  content: ['./inertia/**/*.{ts,tsx}', './resources/views/**/*.edge'],
  theme: { extend: {} },
  plugins: [],
}
