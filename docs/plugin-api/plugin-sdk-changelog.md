# Plugin SDK changelog

## 2.0.0

Introduces the workspace package, definition/callback authoring, readonly DTOs, structured
diagnostics, manifest-driven capabilities, scoped lifecycles, and complete domain subpaths.
Global accessors and the SDK 1 runtime are removed. No npm publication is performed for this release.

The audio surface also completes its deprecation cleanup: analysis intents use descriptor arrays,
feature metadata uses `channelLayout`, and audio sampling is clip-aware only. Feature cache V4 is
the write format; V3 `channelAliases` remain readable by the host for scene migration.
