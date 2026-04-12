# browser-extensions-playground

![Coverage](https://raw.githubusercontent.com/kitsuyui/octocov-central/main/badges/kitsuyui/browser-extensions-playground/coverage.svg)

Playground for browser scraping extensions and scraped data tooling.
The repository also tracks built package artifact size with
[`gh-build-size`](https://github.com/kitsuyui/gh-build-size).

## Architecture

This workspace centers on a single local scraping server.

- [packages/scraping-server](./packages/scraping-server/README.md): unified HTTP and WebSocket server
- [packages/scraping-platform](./packages/scraping-platform/README.md): provider manifests and shared scraping helpers
- [packages/extension-dev](./packages/extension-dev/README.md): dangerous developer extension for remote browser control
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
bun run start -- --store-file ../../.tmp/scraping-server/deterministic.sqlite
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

## License

MIT
