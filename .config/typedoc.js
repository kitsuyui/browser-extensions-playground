/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  name: 'browser-extensions-playground',
  entryPoints: [
    '../packages/example-com/src/index.ts',
    '../packages/hello/src/index.ts',
    '../packages/scraped-data/src/index.ts',
    '../packages/scraping-devtools/src/index.ts',
    '../packages/scraping-extension-devtools/src/index.ts',
    '../packages/scraping-platform/src/index.ts',
    '../packages/scraping-server/src/index.ts',
  ],
  out: '../build/typedocs',
  exclude: ['**/node_modules/**', '**/*.spec.ts', '**/examples/**'],
}
