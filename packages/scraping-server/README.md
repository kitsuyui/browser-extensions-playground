# scraping-server

Unified local HTTP and WebSocket server for browser scraping workflows.

## Responsibilities

- accept normalized usage snapshots over HTTP
- preserve historical snapshots in SQLite
- expose latest and history APIs to downstream tools
- broker page-capture commands for the dangerous developer extension

## Storage

The snapshot store is backed by SQLite.

- default local path from the repository root: `.tmp/scraping-server/deterministic.sqlite`
- relative `--store-file` paths are resolved from the repository root, not the invoking shell directory
- access layer: Prisma
- retention model: append-only history plus latest-by-provider queries

## Start

From this package directory:

```sh
bun run build
bun run start -- --store-file .tmp/scraping-server/deterministic.sqlite
```

From the repository root:

```sh
bun run --filter @kitsuyui/browser-extensions-scraping-server build
bun run --filter @kitsuyui/browser-extensions-scraping-server start -- --store-file .tmp/scraping-server/deterministic.sqlite
```

## HTTP API

- `GET /health`
- `GET /api/status`
- `GET /api/providers`
- `GET /api/providers/:providerId`
- `GET /api/snapshots/latest`
- `GET /api/snapshots/history`
- `POST /api/snapshots/ingest`
- `GET /api/dev/clients`
- `POST /api/dev/commands`

## WebSocket API

- `ws://127.0.0.1:3929/ws/dev`

Used by [scraping-extension-devtools](../scraping-extension-devtools/README.md).

## Dev Command Boundary

`POST /api/dev/commands` is intentionally unauthenticated for local development,
but it is not open to arbitrary web pages.

- browser requests must present an allowed `Origin` (`chrome-extension://...`
  or the local server origin)
- command requests must use `Content-Type: application/json`
- non-browser local clients may omit `Origin`, so local processes still remain
  in the trust boundary

This keeps the endpoint usable for local tooling while blocking blind cross-site
simple requests from unrelated sites opened in the browser.

## Latest Queries

`GET /api/snapshots/latest` accepts:

- `provider`
- `source`
- `rawVersion`
- `accountLabel`

When `provider` is present, the endpoint returns the latest matching snapshot
for that provider or `null`. Without `provider`, it returns the latest matching
snapshot per provider.

## History Queries

`GET /api/snapshots/history` accepts:

- `provider`
- `from`
- `to`
- `limit`

This is the main entry point for time-series analysis such as usage trends over the day.
