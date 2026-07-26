# Plugin SDK changelog

## 2.1.0

Adds two bounded, callback-scoped performance primitives:

- `audio.sampleFeatureMatrix()` returns row-major feature data, clip coverage, and an
  opaque session revision without exposing feature caches or timeline state.
- `assets.generatedRaster()` memoizes deterministic RGBA pixels by a plugin-namespaced
  content key. Builders run synchronously only on a miss and are subject to host quotas.

Plugins receive immutable snapshots only. Canvas contexts, cache instances, eviction
budgets, scratch surfaces, and persisted revision identifiers remain host implementation details.

## 2.0.0

Introduces the workspace package, definition/callback authoring, readonly DTOs, structured
diagnostics, manifest-driven capabilities, scoped lifecycles, and complete domain subpaths.
Global accessors and the SDK 1 runtime are removed. No npm publication is performed for this release.

The audio surface also completes its deprecation cleanup: analysis intents use descriptor arrays,
feature metadata uses `channelLayout`, and audio sampling is clip-aware only. Feature cache V4 is
the write format; V3 `channelAliases` remain readable by the host for scene migration.
