# quota-anthropic

Quota extension for Anthropic usage pages with snapshot syncing.

## Target URLs

- `https://claude.ai/*`
- `https://console.anthropic.com/*`

## Extraction Strategy

- preferred: Anthropic usage API response
- fallback: DOM extraction

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

- `five_hour`
- `seven_day`
- `extra_usage_credits`
