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
bun run inspect -- list-providers
bun run inspect -- status
bun run inspect -- list-clients
bun run inspect -- capture-page
bun run inspect -- execute-script "document.title"
bun run inspect -- fetch-json "https://example.com/data.json"
```

`status`, `list-clients`, `capture-page`, `execute-script`, and `fetch-json`
also accept the devtools server URL as the final argument when the default
server address is not appropriate.

Run the MCP server:

```sh
bun run build
bun run mcp
```

This package operates against the server-side devtools API exposed by [scraping-server](../scraping-server/README.md).
