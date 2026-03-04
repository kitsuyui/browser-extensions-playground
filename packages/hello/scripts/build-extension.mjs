import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(scriptDir, '..')
const distDir = resolve(packageDir, 'dist')

const bundle = await import(pathToFileURL(resolve(distDir, 'index.js')).href)

await mkdir(distDir, { recursive: true })
await writeFile(
  resolve(distDir, 'manifest.json'),
  `${JSON.stringify(bundle.createExtensionManifest(), null, 2)}\n`,
  'utf8'
)
await writeFile(
  resolve(distDir, 'popup.html'),
  bundle.createPopupHtml(),
  'utf8'
)
