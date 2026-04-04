import { defineConfig } from 'tsdown'

export default defineConfig({
  target: 'es2020',
  format: ['cjs', 'esm'],
  entry: ['./src/**/*.ts', '!./src/**/*.spec.ts'],
  platform: 'node',
  splitting: false,
  treeshake: true,
  sourcemap: true,
  minify: true,
  dts: true,
  noExternal: [/^@kitsuyui\//],
})
