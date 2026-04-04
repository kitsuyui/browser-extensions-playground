# scraped-data

Read-only accessors over the local scraping server.

## Responsibilities

- fetch latest deterministic snapshots
- fetch historical snapshot rows
- list registered providers
- surface provider-authored schema descriptions
- expose the same functionality over CLI and MCP

## CLI

Build first:

```sh
pnpm build
```

Common commands:

```sh
pnpm inspect -- status
pnpm inspect -- providers
pnpm inspect -- latest openai
pnpm inspect -- history openai http://127.0.0.1:3929
```

## MCP

Run the MCP server over stdio:

```sh
pnpm build
pnpm mcp
```

Available tools:

- `get_status`
- `list_providers`
- `get_snapshot`
- `get_history`
- `describe_provider`

## Data Model

`scraped-data` is intentionally provider-neutral.

- provider-specific metric semantics live with each provider manifest
- `describe_provider` returns those semantics
- `get_history` returns raw recorded snapshots without imposing cross-provider normalization
