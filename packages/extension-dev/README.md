# extension-dev

Dangerous developer-oriented browser extension for remote browser control and DOM capture.

## Responsibilities

- open a WebSocket to the local scraping server
- respond to devtools commands such as page capture
- help debug selectors and extractors during development

## Safety Model

- default state: disabled
- intended for active development only
- should stay disabled during normal browsing

The popup can enable or disable the connection explicitly.

## Build and Load

```sh
bun run build
```

Load `dist` as an unpacked Chrome extension.

## Related Packages

- [scraping-server](../scraping-server/README.md): receives WebSocket connections and commands
- [scraping-devtools](../scraping-devtools/README.md): CLI and MCP client for this extension
