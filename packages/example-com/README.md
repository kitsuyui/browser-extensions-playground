# example-com

Deterministic example extension used for automated end-to-end testing.

## Responsibilities

- provide a minimal deterministic provider for harness and e2e coverage
- exercise the same capture and ingest path as real provider extensions
- keep test fixtures isolated from provider-specific production logic

## Build

```sh
pnpm build
```

Load `dist` as an unpacked Chrome extension when running the example flow manually.
