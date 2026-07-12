# scraping-extension-devtools

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

## Security Warning

While scraping-extension-devtools is enabled, the local scraping server exposes an **unauthenticated** HTTP endpoint:

```
POST http://127.0.0.1:3929/api/dev/commands
```

Any process running on your machine can POST to this endpoint and ask the extension to capture DOM content from the provider tab currently connected to the local devtools server.

The server binds only to `127.0.0.1`, so remote attackers are blocked, but local processes — including other browser extensions, scripts, or malware — are not.

**Disable the extension when not actively developing.** Do not leave it enabled in a browser used for daily work.

## Build and Load

```sh
bun run build
```

Load `dist` as an unpacked Chrome extension.

## Related Packages

- [scraping-server](../scraping-server/README.md): receives WebSocket connections and commands
- [scraping-devtools](../scraping-devtools/README.md): CLI and MCP client for this extension
