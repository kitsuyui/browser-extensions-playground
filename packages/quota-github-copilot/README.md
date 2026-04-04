# quota-github-copilot

Deterministic quota extension for GitHub Copilot usage pages.

## Target URLs

- `https://github.com/settings/copilot/*`

## Extraction Strategy

- current: DOM extraction from the Copilot features page

The extension stores its latest local snapshot and also submits every captured snapshot to the local history store.

## Build and Load

```sh
pnpm build
```

Load `dist` as an unpacked Chrome extension.

## Stable Metrics

- `premium_requests_used_percent`
