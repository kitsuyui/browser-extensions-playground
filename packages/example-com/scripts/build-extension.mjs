import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, '..')
const distDir = resolve(packageDir, 'dist')

const bundle = await import(pathToFileURL(resolve(distDir, 'index.js')).href)
const manifest = bundle.createExtensionManifest()

await build({
  entryPoints: {
    background: resolve(packageDir, 'src/background.ts'),
    'content-script': resolve(packageDir, 'src/content-script.ts'),
    popup: resolve(packageDir, 'src/popup.ts'),
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
  minify: true,
  outdir: distDir,
})

await mkdir(distDir, { recursive: true })
await writeFile(
  resolve(distDir, 'manifest.json'),
  `${JSON.stringify(
    {
      ...manifest,
      background: {
        service_worker: 'background.js',
      },
    },
    null,
    2
  )}\n`,
  'utf8'
)
await writeFile(
  resolve(distDir, 'popup.html'),
  bundle
    .createPopupHtml()
    .replace(
      '<script type="module" src="./popup.js"></script>',
      '<script src="./popup.js"></script>'
    ),
  'utf8'
)
