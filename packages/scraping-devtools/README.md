# scraping-devtools

CLI and MCP client for the local devtools control API.

## Responsibilities

- inspect devtools connection status
- list connected browser clients
- send `capture-page` and other development-time commands
- expose the same functionality over CLI and MCP

## Usage

```sh
bun run build
bun run inspect -- status
bun run inspect -- list-clients
bun run inspect -- capture-page
```

Run the MCP server:

```sh
bun run build
bun run mcp
```

This package operates against the server-side devtools API exposed by [scraping-server](../scraping-server/README.md).
