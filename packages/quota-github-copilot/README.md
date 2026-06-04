# quota-github-copilot

Quota extension for GitHub Copilot usage pages with snapshot syncing.

## Target URLs

- `https://github.com/settings/copilot/*`

## Extraction Strategy

- current: DOM extraction from the Copilot features page

The extension stores its latest local snapshot and also submits every captured snapshot to the local history store.

## Build and Load

```sh
bun run build
```

Load `dist` as an unpacked Chrome extension.

## CLI

Build first:

```sh
bun run build
```

Common commands:

```sh
bun run inspect -- snapshot
bun run inspect -- snapshot http://127.0.0.1:3929
```

- `snapshot` (default): outputs the latest raw snapshot as JSON
- An optional server URL can be appended to target a non-default local server

## Stable Metrics

- `premium_requests_used_percent`
