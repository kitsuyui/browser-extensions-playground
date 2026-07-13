# scraping-devtools

CLI and MCP client for the local devtools control API.

## Responsibilities

- inspect devtools connection status
- list connected browser clients
- send `capture-page` commands
- expose the same functionality over CLI and MCP

## Usage

```sh
bun run build
bun run inspect -- list-providers
bun run inspect -- status
bun run inspect -- list-clients
bun run inspect -- capture-page
```

`status`, `list-clients`, and `capture-page`
also accept the devtools server URL as the final argument when the default
server address is not appropriate.

Run the MCP server:

```sh
bun run build
bun run mcp
```

This package operates against the server-side devtools API exposed by [scraping-server](../scraping-server/README.md).
