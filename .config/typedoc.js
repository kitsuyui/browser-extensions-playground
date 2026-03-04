/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  name: 'browser-extensions-playground',
  entryPoints: ['../packages/*/src/**/*.ts'],
  out: '../build/typedocs',
  exclude: ['**/node_modules/**', '**/*.spec.ts', '**/examples/**'],
}
