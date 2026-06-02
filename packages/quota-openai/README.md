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

## CLI

Build first:

```sh
bun run build
```

Common commands:

```sh
bun run inspect -- stable-snapshot
bun run inspect -- snapshot
bun run inspect -- stable-snapshot http://127.0.0.1:3929
```

- `stable-snapshot` (default): outputs only stable metrics as JSON
- `snapshot`: outputs the latest raw snapshot as JSON
- An optional server URL can be appended to target a non-default local server

## Stable Metrics

- `codex_5h`
- `codex_weekly`
- `spark_5h`
- `spark_weekly`
- `code_review`
- `credits_remaining`

Provider-specific metrics may be absent depending on the plan.
