# Plugin capabilities

SDK 2 supports `timeline.read`, `audio.features.read`, `audio.raw.read`, `timing.conversion`,
`midi.utils`, and `audio.calculators.register`.

- Put capabilities needed for meaningful output in `required`.
- Put enhancements in `optional` and branch when their facet is absent.
- Declare capabilities once on the element entry in `plugin.json`; definitions receive only granted context facets.
- The host grants declared capabilities only when their underlying service is available.
- There are no user permission prompts or persisted grants in SDK 2.0.

Network and storage are not capabilities in this release because the CJS loader cannot securely
enforce them. A missing required capability skips only that element and reports an actionable
diagnostic; a missing optional capability leaves its context facet absent.
