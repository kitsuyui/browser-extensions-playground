# scraping-platform

Shared types and helpers for snapshot-based scraping extensions.

## Responsibilities

- define provider-neutral snapshot and manifest types
- provide shared extension helpers for provider snapshot capture
- keep common runtime contracts in one place without owning provider-specific semantics

## Notes

- provider-specific schema descriptions belong to each provider package
- the server and `scraped-data` consume these shared types, but should stay neutral about provider meaning
