import esbuild from 'esbuild'
import { solidPlugin } from 'esbuild-plugin-solid'

const watch = process.argv.includes('--watch')

const options = {
  entryPoints: ['resources/js/app.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'public/js/app.js',
  minify: !watch,
  sourcemap: watch,
  target: 'es2022',
  plugins: [solidPlugin()],
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[esbuild] watching resources/js/app.tsx (Solid)…')
} else {
  await esbuild.build(options)
}
