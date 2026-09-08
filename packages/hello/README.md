# hello

Private starter browser extension package used as a minimal template for new extensions.

## Responsibilities

- provide a minimal Manifest V3 extension (`Hello, World!` popup) as a starting point
- exercise the shared build pipeline (`tsdown` + extension asset generation) without provider-specific logic
- stay independent of the scraping server and provider packages

## Build

```sh
bun run build
```

Load `dist` as an unpacked Chrome extension to try it manually.
