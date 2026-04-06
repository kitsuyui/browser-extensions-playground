# example-com

Example extension used for automated end-to-end snapshot testing.

## Responsibilities

- provide a minimal provider for harness and e2e snapshot coverage
- exercise the same capture and ingest path as real provider extensions
- keep test fixtures isolated from provider-specific production logic

## Build

```sh
pnpm build
```

Load `dist` as an unpacked Chrome extension when running the example flow manually.
