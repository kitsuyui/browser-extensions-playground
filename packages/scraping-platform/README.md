# scraping-platform

Shared types and helpers for snapshot-based scraping extensions.

## Responsibilities

- define provider-neutral snapshot and manifest types
- provide shared extension helpers for provider snapshot capture
- keep common runtime contracts in one place without owning provider-specific semantics

## Notes

- provider-specific schema descriptions belong to each provider package
- the server and `scraped-data` consume these shared types, but should stay neutral about provider meaning

## Metric Semantics

`SnapshotMetric.remaining` is interpreted together with `SnapshotMetric.unit`.
For count-like units such as `messages`, `requests`, `tokens`, or `credits`,
`remaining` is the remaining amount. For `percent`, `remaining` is the used
percentage / utilization value, matching quota surfaces that report consumed
capacity. Extractors that read a provider's remaining percent should normalize
it before storing the metric.
