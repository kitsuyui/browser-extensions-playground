# browser-extensions-playground

![Coverage](https://raw.githubusercontent.com/kitsuyui/octocov-central/main/badges/kitsuyui/browser-extensions-playground/coverage.svg)
[![Build Size Report](https://raw.githubusercontent.com/kitsuyui/browser-extensions-playground/gh-build-size-assets/badges/total.svg)](https://github.com/kitsuyui/browser-extensions-playground/blob/gh-build-size-assets/report.md)

Playground for browser scraping extensions and scraped data tooling.
The repository also tracks built package artifact size with
[`gh-build-size`](https://github.com/kitsuyui/gh-build-size).

## Architecture

This workspace centers on a single local scraping server.

- [packages/scraping-server](./packages/scraping-server/README.md): unified HTTP and WebSocket server
- [packages/scraping-platform](./packages/scraping-platform/README.md): provider manifests and shared scraping helpers
- [packages/scraping-extension-devtools](./packages/scraping-extension-devtools/README.md): dangerous developer extension for remote browser control
- [packages/example-com](./packages/example-com/README.md): deterministic example.com extension used for automated end-to-end testing
- [packages/scraped-data](./packages/scraped-data/README.md): generic read-only accessors over server API
- [packages/scraping-devtools](./packages/scraping-devtools/README.md): CLI/MCP client for the server-side devtools control API
- [packages/quota-openai](./packages/quota-openai/README.md): OpenAI quota extension
- [packages/quota-anthropic](./packages/quota-anthropic/README.md): Anthropic quota extension
- [packages/quota-github-copilot](./packages/quota-github-copilot/README.md): GitHub Copilot quota extension

## Quick Start

Install dependencies:

```sh
bun install
```

Start the local scraping server:

```sh
cd packages/scraping-server
bun run build
bun run start -- --store-file .tmp/scraping-server/deterministic.sqlite
```

Build an extension and load its `dist` directory as an unpacked Chrome extension:

```sh
cd packages/quota-openai
bun run build
```

For package-specific setup, API details, metric semantics, and MCP usage, follow the package README links above.

## Usage

### Build

```sh
bun run build
```

### Test

```sh
bun run typecheck
bun run test
bun run playwright:test
```

## Development

This repository uses [lefthook](https://github.com/evilmartians/lefthook) to run the same checks as CI locally before commits and pushes. This brings feedback earlier without changing what CI runs.

Install the hooks once after cloning:

```sh
bunx lefthook install
```

### Hooks

**pre-commit** — runs on every `git commit`:

| Check | Command |
|-------|---------|
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |

**pre-push** — runs on every `git push`:

| Check | Command |
|-------|---------|
| Lint | `bun run lint` |
| Typecheck | `bun run typecheck` |
| Unit tests | `bun run test` |

Playwright / end-to-end tests are intentionally excluded from hooks because they require a browser environment; CI still runs the full suite.

## License

MIT
