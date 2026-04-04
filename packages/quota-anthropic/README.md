# quota-anthropic

Deterministic quota extension for Anthropic usage pages.

## Target URLs

- `https://claude.ai/*`
- `https://console.anthropic.com/*`

## Extraction Strategy

- preferred: Anthropic usage API response
- fallback: DOM extraction

The extension stores its latest local snapshot and also submits every captured snapshot to the local history store.

## Build and Load

```sh
pnpm build
```

Load `dist` as an unpacked Chrome extension.

## Stable Metrics

- `five_hour`
- `seven_day`
- `extra_usage_credits`
