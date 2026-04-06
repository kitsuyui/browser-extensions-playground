# scraping-server

Unified local HTTP and WebSocket server for browser scraping workflows.

## Responsibilities

- accept normalized usage snapshots over HTTP
- preserve historical snapshots in SQLite
- expose latest and history APIs to downstream tools
- broker devtools WebSocket commands for the dangerous developer extension

## Storage

The snapshot store is backed by SQLite.

- default local path from the repository root: `.tmp/scraping-server/deterministic.sqlite`
- access layer: Prisma
- retention model: append-only history plus latest-by-provider queries

## Start

From this package directory:

```sh
pnpm build
pnpm start -- --store-file ../../.tmp/scraping-server/deterministic.sqlite
```

From the repository root:

```sh
pnpm --filter @kitsuyui/browser-extensions-scraping-server build
pnpm --filter @kitsuyui/browser-extensions-scraping-server start -- --store-file .tmp/scraping-server/deterministic.sqlite
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

Used by [extension-dev](../extension-dev/README.md).

## History Queries

`GET /api/snapshots/history` accepts:

- `provider`
- `from`
- `to`
- `limit`

This is the main entry point for time-series analysis such as usage trends over the day.
