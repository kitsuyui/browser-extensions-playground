# quota-openai

Quota extension for OpenAI usage pages with snapshot syncing.

## Target URLs

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## Extraction Strategy

- preferred: page-owned `WHAM` usage response
- fallback: DOM extraction

The extension stores its latest local snapshot and also submits every captured snapshot to the local history store.

## Build and Load

```sh
bun run build
```

Load `dist` as an unpacked Chrome extension.

## Stable Metrics

- `codex_5h`
- `codex_weekly`
- `spark_5h`
- `spark_weekly`
- `code_review`
- `credits_remaining`

Provider-specific metrics may be absent depending on the plan.
