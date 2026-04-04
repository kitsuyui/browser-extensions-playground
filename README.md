# browser-extensions-playground

![Coverage](https://raw.githubusercontent.com/kitsuyui/octocov-central/main/badges/kitsuyui/browser-extensions-playground/coverage.svg)

Playground for browser scraping extensions and scraped data tooling.

## Architecture

This workspace centers on a single local scraping server.

- `packages/scraping-server`: unified HTTP and WebSocket server
- `packages/scraping-platform`: provider manifests and shared scraping helpers
- `packages/extension-dev`: dangerous developer extension for remote browser control
- `packages/example-com`: deterministic example.com extension used for automated end-to-end testing
- `packages/scraped-data`: generic read-only accessors over server API
- `packages/scraping-devtools`: devtools accessors over server API
- `packages/quota-openai`, `packages/quota-anthropic`: provider-specific deterministic quota extensions

## Server

Start the local server:

```sh
cd packages/scraping-server
pnpm build
pnpm start -- --store-file ../../.tmp/scraping-server/deterministic.sqlite
```

This serves:

- `GET /health`
- `GET /api/status`
- `GET /api/deterministic/latest`
- `GET /api/deterministic/history`
- `POST /api/deterministic/ingest`
- `GET /api/dev/clients`
- `POST /api/dev/commands`
- `ws://127.0.0.1:3929/ws/dev`

The deterministic store is backed by SQLite at `.tmp/scraping-server/deterministic.sqlite`.
Historical snapshots are preserved there so downstream tools can analyze usage over time instead of reading only the latest row.
The server uses Prisma as the storage access layer while keeping the HTTP API storage-backend agnostic.

## Devtools Extension

Build and load the devtools extension:

```sh
cd packages/extension-dev
pnpm build
```

Load `packages/extension-dev/dist` as an unpacked extension in Chrome.

This extension:

- opens a WebSocket to the local server
- exposes dangerous remote browser control commands
- should normally stay disabled unless actively developing selectors or extractors

Useful commands:

```sh
cd packages/scraping-devtools
pnpm build
pnpm inspect -- status
pnpm inspect -- list-clients
pnpm inspect -- capture-page
```

Run the devtools MCP server over stdio:

```sh
cd packages/scraping-devtools
pnpm build
pnpm mcp
```

## Quota Extensions

Build and load the provider-specific deterministic extensions:

```sh
cd packages/quota-openai
pnpm build

cd packages/quota-anthropic
pnpm build
```

Load either `packages/quota-openai/dist` or `packages/quota-anthropic/dist` as an unpacked extension in Chrome.

Each extension:

- keeps a fixed behavior
- is scoped to one provider only
- stores its latest snapshot locally and submits every captured snapshot to the server history store
- posts snapshots to the local server over HTTP
- schedules periodic refreshes and reloads matching tabs to keep usage data current
- surfaces a warning when devtool websocket clients are connected

Read deterministic data:

```sh
cd packages/scraped-data
pnpm build
pnpm inspect -- status
pnpm inspect -- providers

cd packages/quota-openai
pnpm build
pnpm inspect -- stable-snapshot

cd packages/quota-anthropic
pnpm build
pnpm inspect -- snapshot
```

Run the read-only MCP server over stdio:

```sh
cd packages/scraped-data
pnpm build
pnpm mcp
```

The `scraped-data` MCP exposes:

- `get_status`
- `list_providers`
- `get_snapshot`
- `get_history`
- `describe_provider`

## Deterministic OpenAI keys

The stable OpenAI/Codex extractor normalizes usage metrics to these keys:

- `codex_5h`
- `codex_weekly`
- `spark_5h`
- `spark_weekly`
- `code_review`
- `credits_remaining`

Provider-specific metrics may be absent for some plans. Missing metrics are expected and should be treated as `null` in deterministic consumers.

## Usage

### Install

```sh
pnpm install
```

### Build

```sh
pnpm build
```

### Test

```sh
pnpm typecheck
pnpm test
pnpm playwright:test
```

## License

MIT
